import World from './verlet/World.js';
import Terrain from './verlet/Terrain.js';
import Environment from './verlet/Environment.js';
import Parallax from './verlet/Parallax.js';
import Particles from './verlet/Particles.js';
import Food from './verlet/Food.js';
import SimulationManager from './ga/SimulationManager.js';
import ConfigScreen from './ui/ConfigScreen.js';
import CreatureCreator from './ui/CreatureCreator.js';
import HUD from './ui/HUD.js';
import VerletBody from './verlet/Verlet.js';
import { exportJSON } from './ui/Persistence.js';

const canvas = World.canvas;
const ctx = World.ctx;
const dt = World.dt;

let simManager = null;
let hud = null;
let terrain = null;
let food = null;
let lastTime = 0;
let accumulator = 0;
let running = false;

// Replay mode state
let replayMode = false;
let replayBody = null;
let replayElapsed = 0;
let replayStartX = 0;
let savedSpeedMultiplier = 1;

// Camera system state
let cameraMode = 'auto'; // 'auto' or 'manual'
let manualCreatureIdx = -1;
let cameraPriorities = []; // per-creature priority scores
let cameraEventDecay = []; // per-creature event decay timers

// Split view state
let splitViewMode = false;

// Append canvas to page
document.querySelector('main').appendChild(canvas);

// Create controls bar under canvas
const controlsBar = document.createElement('div');
controlsBar.className = 'sim-controls';
controlsBar.style.display = 'none';
controlsBar.innerHTML = `
    <button id="btn-pause">Pause</button>
    <button id="btn-1x" class="active">1x</button>
    <button id="btn-2x">2x</button>
    <button id="btn-3x">3x</button>
    <button id="btn-5x">5x</button>
    <button id="btn-10x">10x</button>
    <button id="btn-20x">20x</button>
    <button id="btn-100x">100x</button>
    <button id="btn-250x">250x</button>
    <button id="btn-1000x">1000x</button>
    <span class="controls-sep">|</span>
    <button id="btn-px1" class="px-btn active">PX1</button>
    <button id="btn-px2" class="px-btn">PX2</button>
    <button id="btn-px3" class="px-btn">PX3</button>
    <button id="btn-px4" class="px-btn">PX4</button>
    <span class="controls-sep">|</span>
    <button id="btn-split" class="split-btn">Split</button>
    <button id="btn-replay">Replay Best</button>
    <button id="btn-export">Export</button>
    <button id="btn-restart">New Run</button>
`;
document.querySelector('main').appendChild(controlsBar);

// Handle window resize
window.addEventListener('resize', () => {
    World.resize(window.innerWidth, window.innerHeight - 100);
});

// Show config screen
const configScreen = new ConfigScreen(handleStart, handleOpenCreator);

function handleOpenCreator() {
    new CreatureCreator(() => {
        // On close: return to config screen
        configScreen.show();
    });
}

function handleStart({ mode, config, savedState, seedGenomes }) {
    // Setup terrain
    terrain = new Terrain(config.terrainSeed, config.worldType);
    World.terrain = terrain;
    World.cameraX = 0;

    // Init visual systems
    Parallax.init(config.terrainSeed);
    Particles.clear();

    // Init food system
    food = new Food(terrain, config.terrainSeed);

    // Create simulation manager
    simManager = new SimulationManager(config, food);
    hud = new HUD(simManager);

    if (mode === 'resume' && savedState) {
        simManager.resumeFromState(savedState);
    } else {
        simManager.initNewPopulation(seedGenomes || null);
    }

    // Reset camera
    cameraMode = 'auto';
    manualCreatureIdx = -1;
    cameraPriorities = [];
    cameraEventDecay = [];
    splitViewMode = false;

    // Show controls
    controlsBar.style.display = 'flex';
    running = true;
    lastTime = 0;
    accumulator = 0;

    requestAnimationFrame(gameLoop);
}

function enterReplayMode() {
    if (!simManager || !simManager.lastGenBestReplay) return;
    const replay = simManager.lastGenBestReplay;
    savedSpeedMultiplier = World.speedMultiplier;
    World.speedMultiplier = 1;
    setSpeed(1);
    replayBody = new VerletBody(replay.genome, replay.spawnX, undefined, '#ffd700');
    replayBody._hue = 45;
    replayBody._muscleColor = '#ff8c00';
    replayBody._bodyFill = 'rgba(255,215,0,0.30)';
    const com = replayBody.getCOM();
    replayStartX = com.x;
    replayElapsed = 0;
    replayMode = true;
    World.cameraX = 0;
    World.cameraY = 0;
    document.getElementById('btn-replay').textContent = 'Exit Replay';
}

function exitReplayMode() {
    replayMode = false;
    replayBody = null;
    World.speedMultiplier = savedSpeedMultiplier;
    setSpeed(savedSpeedMultiplier);
    document.getElementById('btn-replay').textContent = 'Replay Best';
}

// --- Focused creature index ---

function getFocusedCreatureIdx() {
    if (!simManager || simManager.bodies.length === 0) return -1;

    if (cameraMode === 'manual' && manualCreatureIdx >= 0 &&
        manualCreatureIdx < simManager.bodies.length) {
        return manualCreatureIdx;
    }

    // Auto mode: find highest priority creature (same logic as updateAutoCamera)
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < cameraPriorities.length; i++) {
        if (cameraPriorities[i] > bestScore) {
            bestScore = cameraPriorities[i];
            bestIdx = i;
        }
    }
    return bestIdx;
}

// --- Pixel render helpers ---

function beginPixelRender() {
    const scale = World.pixelScale;
    const w = World.bounds.width;
    const h = World.bounds.height;
    if (scale <= 1) {
        ctx.clearRect(0, 0, w, h);
        return ctx;
    }
    // Offscreen canvas at reduced resolution
    const gctx = World.gctx;
    const gw = World.gameCanvas.width;
    const gh = World.gameCanvas.height;
    gctx.clearRect(0, 0, gw, gh);
    gctx.save();
    gctx.scale(1 / scale, 1 / scale);
    return gctx;
}

function endPixelRender() {
    const scale = World.pixelScale;
    if (scale <= 1) return;
    const gctx = World.gctx;
    gctx.restore();
    // Blit to display canvas with nearest-neighbor
    const w = World.bounds.width;
    const h = World.bounds.height;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(World.gameCanvas, 0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
}

// --- Camera system ---

function updateAutoCamera(frameTime) {
    if (!simManager || simManager.bodies.length === 0) return;

    const bodies = simManager.bodies;
    const states = simManager.bodyStates;

    // Ensure arrays are sized
    while (cameraPriorities.length < bodies.length) {
        cameraPriorities.push(0);
        cameraEventDecay.push({ combat: 0, ko: 0, food: 0 });
    }

    // Decay event timers
    for (let i = 0; i < bodies.length; i++) {
        const d = cameraEventDecay[i];
        if (d.combat > 0) d.combat -= frameTime;
        if (d.ko > 0) d.ko -= frameTime;
        if (d.food > 0) d.food -= frameTime;
    }

    // Score each creature
    let bestIdx = 0;
    let bestScore = -Infinity;
    let leaderIdx = -1;
    let leaderX = -Infinity;

    for (let i = 0; i < bodies.length; i++) {
        if (states[i].finished) {
            cameraPriorities[i] = -100;
            continue;
        }

        let score = 0;
        const com = bodies[i].getCOM();

        // Leader bonus
        if (com.x > leaderX) {
            leaderX = com.x;
            leaderIdx = i;
        }

        // Event bonuses
        const d = cameraEventDecay[i];
        if (d.combat > 0) score += 20;
        if (d.ko > 0) score += 30 * (d.ko / 2);
        if (d.food > 0) score += 5;

        cameraPriorities[i] = score;
    }

    // Add leader bonus
    if (leaderIdx >= 0 && !states[leaderIdx].finished) {
        cameraPriorities[leaderIdx] += 10;
    }

    // Find highest priority
    for (let i = 0; i < bodies.length; i++) {
        if (cameraPriorities[i] > bestScore) {
            bestScore = cameraPriorities[i];
            bestIdx = i;
        }
    }

    // Camera target
    const targetBody = bodies[bestIdx];
    const com = targetBody.getCOM();
    const targetX = com.x - World.bounds.width / 3;
    const targetY = com.y - World.bounds.height * 0.6;

    // Smooth or cut based on priority delta
    const lerp = 0.08;
    World.cameraX += (targetX - World.cameraX) * lerp;
    World.cameraY += (targetY - World.cameraY) * lerp;
    World.cameraX = Math.max(0, World.cameraX);
}

function updateManualCamera() {
    if (!simManager) return;
    const bodies = simManager.bodies;
    if (manualCreatureIdx < 0 || manualCreatureIdx >= bodies.length) return;

    const body = bodies[manualCreatureIdx];
    const com = body.getCOM();
    const targetX = com.x - World.bounds.width / 3;
    const targetY = com.y - World.bounds.height * 0.6;
    World.cameraX += (targetX - World.cameraX) * 0.08;
    World.cameraY += (targetY - World.cameraY) * 0.08;
    World.cameraX = Math.max(0, World.cameraX);
}

function cycleCreature(direction) {
    if (!simManager) return;
    cameraMode = 'manual';
    const bodies = simManager.bodies;
    const active = [];
    for (let i = 0; i < bodies.length; i++) {
        if (!simManager.bodyStates[i].finished) active.push(i);
    }
    if (active.length === 0) return;

    if (manualCreatureIdx < 0) {
        manualCreatureIdx = active[0];
    } else {
        const curPos = active.indexOf(manualCreatureIdx);
        if (curPos < 0) {
            manualCreatureIdx = active[0];
        } else {
            const nextPos = (curPos + direction + active.length) % active.length;
            manualCreatureIdx = active[nextPos];
        }
    }
}

// Notify camera of events
function cameraNotify(creatureIdx, eventType) {
    if (creatureIdx < 0 || creatureIdx >= cameraEventDecay.length) return;
    const d = cameraEventDecay[creatureIdx];
    switch (eventType) {
        case 'combat': d.combat = 1; break;
        case 'ko': d.ko = 2; break;
        case 'food': d.food = 1; break;
    }
}

// --- Minimap ---

function renderMinimap(renderCtx, w) {
    if (!simManager || !terrain) return;
    const spd = World.speedMultiplier;
    if (spd > 20) return;
    if (splitViewMode) return; // Hide minimap in split view

    const mmW = 200;
    const mmH = 15;
    const mmX = (w - mmW) / 2;
    const mmY = 2;

    // Find world extent from all creatures
    let maxWorldX = 1000;
    for (let i = 0; i < simManager.bodies.length; i++) {
        const com = simManager.bodies[i].getCOM();
        if (com.x > maxWorldX) maxWorldX = com.x;
    }
    // Include focused creature's enemies in extent
    const focusIdx = getFocusedCreatureIdx();
    if (focusIdx >= 0 && simManager.bodyStates[focusIdx]?.enemies) {
        const enemies = simManager.bodyStates[focusIdx].enemies;
        for (let i = 0; i < enemies.length; i++) {
            if (enemies[i].frozen) continue;
            const com = enemies[i].getCOM();
            if (com.x > maxWorldX) maxWorldX = com.x;
        }
    }
    maxWorldX += 200;

    renderCtx.save();

    // Background
    renderCtx.fillStyle = 'rgba(0,0,0,0.6)';
    renderCtx.fillRect(mmX, mmY, mmW, mmH);

    // Terrain silhouette
    renderCtx.strokeStyle = 'rgba(60,120,40,0.6)';
    renderCtx.lineWidth = 1;
    renderCtx.beginPath();
    for (let px = 0; px < mmW; px++) {
        const worldX = (px / mmW) * maxWorldX;
        const th = terrain.getHeightAtX(worldX);
        const normY = (th - 200) / 400; // normalize
        const sy = mmY + Math.max(1, Math.min(mmH - 1, normY * mmH));
        if (px === 0) renderCtx.moveTo(mmX + px, sy);
        else renderCtx.lineTo(mmX + px, sy);
    }
    renderCtx.stroke();

    // Creature dots
    for (let i = 0; i < simManager.bodies.length; i++) {
        const body = simManager.bodies[i];
        const com = body.getCOM();
        const dotX = mmX + (com.x / maxWorldX) * mmW;
        const dotY = mmY + mmH / 2;
        renderCtx.fillStyle = simManager.bodyStates[i].finished ? 'rgba(100,100,100,0.5)' : '#0f0';
        renderCtx.fillRect(dotX - 1, dotY - 1, 2, 2);
    }

    // Enemy dots (red) — focused creature's enemies only
    if (focusIdx >= 0 && simManager.bodyStates[focusIdx]?.enemies) {
        const enemies = simManager.bodyStates[focusIdx].enemies;
        const kos = simManager.bodyStates[focusIdx].enemyKOd;
        for (let i = 0; i < enemies.length; i++) {
            if (enemies[i].frozen || kos[i]) continue;
            const com = enemies[i].getCOM();
            const dotX = mmX + (com.x / maxWorldX) * mmW;
            const dotY = mmY + mmH / 2;
            renderCtx.fillStyle = '#f44';
            renderCtx.fillRect(dotX - 1, dotY - 1, 2, 2);
        }
    }

    // Camera viewport rectangle
    const vpLeft = mmX + (World.cameraX / maxWorldX) * mmW;
    const vpWidth = (World.bounds.width / maxWorldX) * mmW;
    renderCtx.strokeStyle = 'rgba(255,255,255,0.5)';
    renderCtx.lineWidth = 1;
    renderCtx.strokeRect(vpLeft, mmY, Math.max(vpWidth, 2), mmH);

    renderCtx.restore();
}

// --- Split View ---

function getActiveCreatureIndices() {
    if (!simManager) return [];
    const indices = [];
    for (let i = 0; i < simManager.bodyStates.length; i++) {
        if (!simManager.bodyStates[i].finished) {
            indices.push(i);
        }
    }
    // Sort by currentX descending (furthest ahead first)
    indices.sort((a, b) => simManager.bodyStates[b].currentX - simManager.bodyStates[a].currentX);
    return indices;
}

function renderSplitView(gctx, w, h) {
    const active = getActiveCreatureIndices();
    const count = Math.min(active.length, 12);
    if (count === 0) return;

    const cols = count <= 2 ? count : (count <= 4 ? 2 : (count <= 6 ? 3 : 4));
    const rows = Math.ceil(count / cols);
    const cellW = Math.floor(w / cols);
    const cellH = Math.floor(h / rows);

    for (let c = 0; c < count; c++) {
        const idx = active[c];
        const col = c % cols;
        const row = Math.floor(c / cols);
        const cx = col * cellW;
        const cy = row * cellH;

        // Clip to cell
        gctx.save();
        gctx.beginPath();
        gctx.rect(cx, cy, cellW, cellH);
        gctx.clip();

        // Camera centered on this creature
        const com = simManager.bodies[idx].getCOM();
        const camX = Math.max(0, com.x - cellW / 3);
        const camY = com.y - cellH * 0.6;

        // Render terrain in this viewport
        terrain.renderInViewport(gctx, camX, camY, cellW, cellH, cx, cy);

        // Render this creature + its enemies
        gctx.save();
        gctx.translate(cx - camX, cy - camY);

        simManager.bodies[idx].render();

        const state = simManager.bodyStates[idx];
        if (state.enemies) {
            for (let j = 0; j < state.enemies.length; j++) {
                if (!state.enemies[j].frozen) {
                    state.enemies[j].render();
                }
            }
        }

        gctx.restore();

        // Cell border + label
        gctx.strokeStyle = 'rgba(255,255,255,0.3)';
        gctx.lineWidth = 1;
        gctx.strokeRect(cx, cy, cellW, cellH);
        gctx.fillStyle = '#fff';
        gctx.font = '10px monospace';
        gctx.fillText(`#${idx + 1} ${Math.round(state.maxX - state.startX)}px`, cx + 4, cy + 12);

        gctx.restore();
    }
}

// --- Game Loop ---

function gameLoop(timestamp) {
    if (!running) {return;}

    if (lastTime === 0) {
        lastTime = timestamp;
        requestAnimationFrame(gameLoop);
        return;
    }

    let frameTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    if (frameTime > 0.1) {frameTime = 0.1;}

    if (replayMode) {
        // Replay mode: single body at 1x
        accumulator += frameTime;
        while (accumulator >= dt) {
            if (replayBody && !replayBody.frozen) {
                replayBody.update(dt);
                replayElapsed += dt;
            }
            accumulator -= dt;
        }

        // Camera follows replay body
        if (replayBody) {
            const com = replayBody.getCOM();
            const targetX = com.x - World.bounds.width / 3;
            const targetY = com.y - World.bounds.height * 0.6;
            World.cameraX += (targetX - World.cameraX) * 0.08;
            World.cameraY += (targetY - World.cameraY) * 0.08;
            World.cameraX = Math.max(0, World.cameraX);
        }

        // Render
        const w = World.bounds.width;
        const h = World.bounds.height;
        const phase = Environment._phase;
        const gctx = beginPixelRender();
        Environment.update(simManager ? simManager.generation : 0);
        Environment.renderSky(gctx, w, h);
        Parallax.render(gctx, w, h, World.cameraX, phase, 1);
        gctx.save();
        gctx.translate(-World.cameraX, -World.cameraY);
        terrain.render();
        if (food) food.render(gctx, World.cameraX, w, 1);
        if (replayBody) {
            replayBody.isLeader = true;
            replayBody.render();
        }
        Particles.update(frameTime);
        Particles.render(gctx);
        gctx.restore();
        Environment.renderAtmosphericHaze(gctx, w, h);
        Particles.updateAmbient(frameTime, 1);
        Particles.renderAmbient(gctx, w, h, phase, 1);
        Environment.renderVignette(gctx, w, h);
        endPixelRender();

        // Replay HUD overlay (always on display ctx, native res)
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, w, 28);
        ctx.font = '13px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffd700';
        const replay = simManager.lastGenBestReplay;
        const dist = replayBody ? Math.max(0, replayBody.getCOM().x - replayStartX) : 0;
        const speed = replayElapsed > 0 ? (dist / replayElapsed) : 0;
        ctx.fillText(
            `REPLAY  |  Gen ${replay.generation} Best  |  Distance: ${Math.round(dist)}px  |  Speed: ${speed.toFixed(1)} px/s  |  [ESC to exit]`,
            8, 18
        );
        ctx.restore();

        requestAnimationFrame(gameLoop);
        return;
    }

    if (!hud.paused) {
        accumulator += frameTime;

        while (accumulator >= dt) {
            // Run speedMultiplier physics steps per frame tick
            for (let s = 0; s < World.speedMultiplier; s++) {
                simManager.update(dt);
            }
            accumulator -= dt;
        }

        // Camera (only used in main view but always update for focused creature tracking)
        if (cameraMode === 'auto') {
            updateAutoCamera(frameTime);
        } else {
            updateManualCamera();
        }
    }

    // Auto-disable split view above 5x
    if (splitViewMode && World.speedMultiplier > 5) {
        splitViewMode = false;
        updateSplitButton();
    }

    // Render
    {
        const w = World.bounds.width;
        const h = World.bounds.height;
        const spd = World.speedMultiplier;
        const gctx = beginPixelRender();
        Environment.update(simManager.generation);
        Environment.renderSky(gctx, w, h);

        if (splitViewMode) {
            // Split view rendering
            renderSplitView(gctx, w, h);
        } else {
            // Main view rendering
            Parallax.render(gctx, w, h, World.cameraX, Environment._phase, spd);
            gctx.save();
            gctx.translate(-World.cameraX, -World.cameraY);

            terrain.render();

            // Food (between terrain and creatures)
            if (food && simManager.config.foodEnabled !== false) {
                food.render(gctx, World.cameraX, w, spd);
            }

            // Determine leader (furthest active creature)
            let leaderIdx = -1;
            let leaderX = -Infinity;
            for (let i = 0; i < simManager.bodies.length; i++) {
                const body = simManager.bodies[i];
                body.isLeader = false;
                if (!body.frozen) {
                    const bx = body.getCOM().x;
                    if (bx > leaderX) {
                        leaderX = bx;
                        leaderIdx = i;
                    }
                }
            }
            if (leaderIdx >= 0) simManager.bodies[leaderIdx].isLeader = true;

            // Render frozen bodies first (behind), then active ones
            for (let i = 0; i < simManager.bodies.length; i++) {
                if (simManager.bodies[i].frozen) {
                    simManager.bodies[i].render();
                }
            }
            for (let i = 0; i < simManager.bodies.length; i++) {
                if (!simManager.bodies[i].frozen) {
                    simManager.bodies[i].render();
                }
            }

            // Render focused creature's enemies only
            const focusIdx = getFocusedCreatureIdx();
            if (focusIdx >= 0 && simManager.bodyStates[focusIdx]?.enemies) {
                const enemies = simManager.bodyStates[focusIdx].enemies;
                const healths = simManager.bodyStates[focusIdx].enemyHealths;
                const kos = simManager.bodyStates[focusIdx].enemyKOd;
                for (let j = 0; j < enemies.length; j++) {
                    if (!enemies[j].frozen) {
                        enemies[j].render();
                        // Health bars for enemies at low speed
                        if (spd <= 10 && !kos[j]) {
                            _renderHealthBar(gctx, enemies[j], true, healths[j]);
                        }
                    }
                }
            }

            // Health bars for creatures (in combat mode)
            if (spd <= 10 && simManager.config.combatEnabled !== false &&
                simManager.enemyBlueprints && simManager.enemyBlueprints.length > 0) {
                for (let i = 0; i < simManager.bodies.length; i++) {
                    if (!simManager.bodies[i].frozen) {
                        _renderHealthBar(gctx, simManager.bodies[i], false);
                    }
                }
            }

            // Update and render particles
            if (spd <= 50) {
                Particles.update(frameTime);
                Particles.render(gctx);
            }

            gctx.restore();
            Environment.renderAtmosphericHaze(gctx, w, h);
            Particles.updateAmbient(frameTime, spd);
            Particles.renderAmbient(gctx, w, h, Environment._phase, spd);
        }

        Environment.renderVignette(gctx, w, h);
        endPixelRender();

        // HUD + Minimap (screen space, native resolution on display ctx)
        hud.render();
        renderMinimap(ctx, w);
    }

    requestAnimationFrame(gameLoop);
}

// --- Health bar rendering ---

function _renderHealthBar(renderCtx, body, isEnemy, healthOverride) {
    const hp = healthOverride !== undefined ? healthOverride : body.health;
    if (hp === undefined && hp !== 0) return;
    const pts = body.pointMass;
    let minY = Infinity;
    let cx = 0;
    for (let i = 0; i < pts.length; i++) {
        if (pts[i].y < minY) minY = pts[i].y;
        cx += pts[i].x;
    }
    cx /= pts.length;
    const barW = 20;
    const barH = 2;
    const bx = cx - barW / 2;
    const by = minY - 8;
    const maxHp = body.maxHealth || 100;
    const hpFrac = Math.max(0, hp / maxHp);

    // Background
    renderCtx.fillStyle = isEnemy ? 'rgba(80,0,0,0.6)' : 'rgba(0,0,0,0.5)';
    renderCtx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);

    // Health fill
    if (hpFrac > 0.5) {
        renderCtx.fillStyle = '#0f0';
    } else if (hpFrac > 0.25) {
        renderCtx.fillStyle = '#ff0';
    } else {
        renderCtx.fillStyle = '#f00';
    }
    renderCtx.fillRect(bx, by, barW * hpFrac, barH);
}

// --- Controls ---

function updateSplitButton() {
    const btn = document.getElementById('btn-split');
    if (btn) {
        btn.classList.toggle('active', splitViewMode);
    }
}

// Canvas click → HUD interaction + minimap click
canvas.addEventListener('click', (e) => {
    if (!hud) {return;}
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (World.bounds.width / rect.width);
    const y = (e.clientY - rect.top) * (World.bounds.height / rect.height);

    // Minimap click check
    const mmW = 200;
    const mmH = 15;
    const mmX = (World.bounds.width - mmW) / 2;
    const mmY = 2;
    if (x >= mmX && x <= mmX + mmW && y >= mmY && y <= mmY + mmH) {
        // Find world extent
        let maxWorldX = 1000;
        if (simManager) {
            for (let i = 0; i < simManager.bodies.length; i++) {
                const com = simManager.bodies[i].getCOM();
                if (com.x > maxWorldX) maxWorldX = com.x;
            }
        }
        maxWorldX += 200;
        const clickWorldX = ((x - mmX) / mmW) * maxWorldX;
        World.cameraX = Math.max(0, clickWorldX - World.bounds.width / 2);
        cameraMode = 'manual';
        manualCreatureIdx = -1; // free look
        return;
    }

    hud.handleClick(x, y);
});

// Keyboard controls
document.addEventListener('keydown', (e) => {
    if (!hud) {return;}

    if (e.key === 'Escape' && replayMode) {
        exitReplayMode();
        return;
    }

    if (replayMode) return;

    switch (e.key) {
        case ' ':
            e.preventDefault();
            hud.paused = !hud.paused;
            updatePauseButton();
            break;
        case '1': setSpeed(1); break;
        case '2': setSpeed(2); break;
        case '3': setSpeed(3); break;
        case '5': setSpeed(5); break;
        case '0': setSpeed(10); break;
        case 'ArrowLeft':
            e.preventDefault();
            cycleCreature(-1);
            break;
        case 'ArrowRight':
            e.preventDefault();
            cycleCreature(1);
            break;
        case 'c':
        case 'C':
            cameraMode = 'auto';
            manualCreatureIdx = -1;
            break;
        case 's':
        case 'S':
            if (World.speedMultiplier <= 5) {
                splitViewMode = !splitViewMode;
                updateSplitButton();
            }
            break;
    }
});

function setSpeed(multiplier) {
    World.speedMultiplier = multiplier;
    document.querySelectorAll('.sim-controls button[id^="btn-"]').forEach(btn => {
        if (btn.id.match(/btn-\d+x/)) {
            btn.classList.toggle('active', btn.id === `btn-${multiplier}x`);
        }
    });
}

function setPixelScale(scale) {
    World.setPixelScale(scale);
    document.querySelectorAll('.px-btn').forEach(btn => {
        btn.classList.toggle('active', btn.id === `btn-px${scale}`);
    });
}

function updatePauseButton() {
    const btn = document.getElementById('btn-pause');
    if (btn) {btn.textContent = hud.paused ? 'Resume' : 'Pause';}
}

// Button handlers
document.addEventListener('click', (e) => {
    const id = e.target.id;
    if (!id) {return;}

    switch (id) {
        case 'btn-pause':
            if (hud) {
                hud.paused = !hud.paused;
                updatePauseButton();
            }
            break;
        case 'btn-1x': setSpeed(1); break;
        case 'btn-2x': setSpeed(2); break;
        case 'btn-3x': setSpeed(3); break;
        case 'btn-5x': setSpeed(5); break;
        case 'btn-10x': setSpeed(10); break;
        case 'btn-20x': setSpeed(20); break;
        case 'btn-100x': setSpeed(100); break;
        case 'btn-250x': setSpeed(250); break;
        case 'btn-1000x': setSpeed(1000); break;
        case 'btn-px1': setPixelScale(1); break;
        case 'btn-px2': setPixelScale(2); break;
        case 'btn-px3': setPixelScale(3); break;
        case 'btn-px4': setPixelScale(4); break;
        case 'btn-split':
            if (World.speedMultiplier <= 5) {
                splitViewMode = !splitViewMode;
                updateSplitButton();
            }
            break;
        case 'btn-replay':
            if (replayMode) {
                exitReplayMode();
            } else {
                enterReplayMode();
            }
            break;
        case 'btn-export':
            if (replayMode) break;
            if (simManager) {
                exportJSON({
                    config: simManager.config,
                    generation: simManager.generation,
                    genomes: simManager.genomes,
                    bestGenome: simManager.bestGenome,
                    bestFitness: simManager.bestFitness,
                    history: simManager.history,
                    rngState: simManager.rng.getState(),
                    enemyMilestones: simManager.enemyMilestones
                });
            }
            break;
        case 'btn-restart':
            if (replayMode) exitReplayMode();
            running = false;
            controlsBar.style.display = 'none';
            World.speedMultiplier = 1;
            configScreen.show();
            break;
    }
});

// Export for SimulationManager to notify camera
export { cameraNotify };
