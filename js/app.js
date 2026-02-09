import World from './verlet/World.js';
import Terrain from './verlet/Terrain.js';
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
let lastTime = 0;
let accumulator = 0;
let running = false;

// Replay mode state
let replayMode = false;
let replayBody = null;
let replayElapsed = 0;
let replayStartX = 0;
let savedSpeedMultiplier = 1;

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

    // Create simulation manager
    simManager = new SimulationManager(config);
    hud = new HUD(simManager);

    if (mode === 'resume' && savedState) {
        simManager.resumeFromState(savedState);
    } else {
        simManager.initNewPopulation(seedGenomes || null);
    }

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
    replayBody._muscleColor = '#ff8c00';
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
        ctx.clearRect(0, 0, World.bounds.width, World.bounds.height);
        ctx.save();
        ctx.translate(-World.cameraX, -World.cameraY);
        terrain.render();
        if (replayBody) replayBody.render();
        ctx.restore();

        // Replay HUD overlay
        const w = World.bounds.width;
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

        // Camera: smooth follow leader in X and Y
        const leaderCOM = simManager.getLeaderCOM();
        const targetX = leaderCOM.x - World.bounds.width / 3;
        const targetY = leaderCOM.y - World.bounds.height * 0.6;
        World.cameraX += (targetX - World.cameraX) * 0.08;
        World.cameraY += (targetY - World.cameraY) * 0.08;
        World.cameraX = Math.max(0, World.cameraX);
    }

    // Render
    ctx.clearRect(0, 0, World.bounds.width, World.bounds.height);
    ctx.save();
    ctx.translate(-World.cameraX, -World.cameraY);

    terrain.render();

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

    ctx.restore();

    // HUD (screen space)
    hud.render();

    requestAnimationFrame(gameLoop);
}

// --- Controls ---

// Canvas click → HUD interaction
canvas.addEventListener('click', (e) => {
    if (!hud) {return;}
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (World.bounds.width / rect.width);
    const y = (e.clientY - rect.top) * (World.bounds.height / rect.height);
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
                    rngState: simManager.rng.getState()
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
