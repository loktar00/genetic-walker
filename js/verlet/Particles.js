// Pooled particle system: dust, KO bursts, food collect + screen-space ambient particles

const POOL_SIZE = 500;
const DUST_GRAVITY = 100; // px/s²
const AMBIENT_COUNT = 25;

// Particle pool (pre-allocated)
const pool = new Array(POOL_SIZE);
let activeCount = 0;

for (let i = 0; i < POOL_SIZE; i++) {
    pool[i] = { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, r: 160, g: 140, b: 100, type: 0 };
}

function _emit(x, y, vx, vy, life, size, r, g, b, type) {
    if (activeCount >= POOL_SIZE) return;
    for (let i = 0; i < POOL_SIZE; i++) {
        if (!pool[i].active) {
            const p = pool[i];
            p.active = true;
            p.x = x; p.y = y;
            p.vx = vx; p.vy = vy;
            p.life = life; p.maxLife = life;
            p.size = size;
            p.r = r; p.g = g; p.b = b;
            p.type = type; // 0=dust, 2=KO burst, 3=food collect
            activeCount++;
            return;
        }
    }
}

// Screen-space ambient particles (pollen motes / fireflies)
const ambient = new Array(AMBIENT_COUNT);
for (let i = 0; i < AMBIENT_COUNT; i++) {
    ambient[i] = {
        x: Math.random(),    // 0-1 fraction of screen width
        y: Math.random(),    // 0-1 fraction of screen height
        size: 2 + Math.random() * 2,          // 2-4px (was 1-2.5)
        phase: Math.random() * Math.PI * 2,
        driftX: (Math.random() - 0.5) * 0.003,  // slow brownian (was (random-0.3)*0.01)
        bobFreq: 0.2 + Math.random() * 0.4,     // 0.2-0.6 Hz (was 0.5-1.5)
        bobAmp: 0.001 + Math.random() * 0.002   // 0.001-0.003 (was 0.003-0.008)
    };
}

const Particles = {
    // Emit dust particles on ground impact
    emitDust(x, y, impactVel) {
        const count = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            _emit(
                x + (Math.random() - 0.5) * 6,
                y,
                (Math.random() - 0.5) * 60,
                -20 - Math.random() * 40,
                0.3 + Math.random() * 0.3,
                1 + Math.random() * 2,
                160, 140, 100,
                0
            );
        }
    },

    // Emit KO burst when creature/enemy is knocked out
    emitKO(x, y) {
        const count = 12 + Math.floor(Math.random() * 6);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 40 + Math.random() * 80;
            _emit(
                x + (Math.random() - 0.5) * 10,
                y + (Math.random() - 0.5) * 10,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 30,
                0.5 + Math.random() * 0.5,
                2 + Math.random() * 3,
                255, 200 + Math.floor(Math.random() * 55), 50,
                2
            );
        }
    },

    // Emit small burst when food is collected
    emitFoodCollect(x, y, r, g, b) {
        const count = 3;
        for (let i = 0; i < count; i++) {
            _emit(
                x + (Math.random() - 0.5) * 6,
                y - 2,
                (Math.random() - 0.5) * 30,
                -15 - Math.random() * 25,
                0.3 + Math.random() * 0.2,
                1.5 + Math.random() * 1.5,
                r, g, b,
                3
            );
        }
    },

    update(dt) {
        for (let i = 0; i < POOL_SIZE; i++) {
            const p = pool[i];
            if (!p.active) continue;

            p.life -= dt;
            if (p.life <= 0) {
                p.active = false;
                activeCount--;
                continue;
            }

            p.x += p.vx * dt;
            p.y += p.vy * dt;

            // Gravity on dust, KO burst, food collect
            if (p.type === 0 || p.type === 2 || p.type === 3) {
                p.vy += DUST_GRAVITY * dt;
            }
        }
    },

    render(ctx) {
        for (let i = 0; i < POOL_SIZE; i++) {
            const p = pool[i];
            if (!p.active) continue;

            const alpha = p.life / p.maxLife;
            ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha.toFixed(2)})`;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
    },

    // Update screen-space ambient particles
    updateAmbient(dt, speed) {
        if (speed > 20) return;
        const count = speed > 5 ? 15 : AMBIENT_COUNT;
        for (let i = 0; i < count; i++) {
            const a = ambient[i];
            a.x += a.driftX;
            a.y += Math.sin(a.phase) * a.bobAmp;
            a.phase += a.bobFreq * dt;
            // Wrap edges
            if (a.x > 1.05) a.x = -0.05;
            if (a.x < -0.05) a.x = 1.05;
            if (a.y > 1.05) a.y = -0.05;
            if (a.y < -0.05) a.y = 1.05;
        }
    },

    // Render ambient particles in screen-space (call after ctx.restore)
    renderAmbient(ctx, w, h, phase, speed) {
        if (speed > 20) return;
        const count = speed > 5 ? 15 : AMBIENT_COUNT;
        const now = performance.now() / 1000;

        // Determine mode: day pollen (0.15-0.65), night fireflies (0.72-1.0 / 0.0-0.08)
        const isDay = phase >= 0.15 && phase <= 0.65;
        const isNight = phase >= 0.72 || phase < 0.08;

        // Compute transition alpha for dawn/dusk crossfade
        let dayAlpha = 0, nightAlpha = 0;
        if (isDay) {
            dayAlpha = 1;
        } else if (isNight) {
            nightAlpha = 1;
        } else if (phase > 0.65 && phase < 0.72) {
            // Dusk transition
            const t = (phase - 0.65) / 0.07;
            dayAlpha = 1 - t;
            nightAlpha = t;
        } else if (phase >= 0.08 && phase < 0.15) {
            // Dawn transition
            const t = (phase - 0.08) / 0.07;
            nightAlpha = 1 - t;
            dayAlpha = t;
        }

        for (let i = 0; i < count; i++) {
            const a = ambient[i];
            const sx = a.x * w;
            const sy = a.y * h;

            // Day: pollen motes
            if (dayAlpha > 0) {
                const moteAlpha = (0.08 + Math.abs(Math.sin(a.phase * 0.7)) * 0.12) * dayAlpha;
                ctx.fillStyle = `rgba(255,250,220,${moteAlpha.toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(sx, sy, a.size, 0, Math.PI * 2);
                ctx.fill();
            }

            // Night: fireflies — slow pulse, strong warm glow
            if (nightAlpha > 0) {
                const pulse = Math.max(0, Math.sin(a.phase + now * 0.4));
                const ffAlpha = 0.55 * pulse * nightAlpha;
                if (ffAlpha > 0.01) {
                    ctx.save();
                    ctx.shadowColor = `rgba(180,255,100,${(ffAlpha * 0.6).toFixed(3)})`;
                    ctx.shadowBlur = 8;
                    ctx.fillStyle = `rgba(180,255,100,${ffAlpha.toFixed(3)})`;
                    ctx.beginPath();
                    ctx.arc(sx, sy, a.size * 1.2, 0, Math.PI * 2);
                    ctx.fill();
                    // Warm center pixel
                    ctx.fillStyle = `rgba(255,255,200,${(ffAlpha * 0.8).toFixed(3)})`;
                    ctx.fillRect(sx - 0.5, sy - 0.5, 1, 1);
                    ctx.restore();
                }
            }
        }
    },

    get activeCount() { return activeCount; },

    // Reset all particles (e.g., on new generation)
    clear() {
        for (let i = 0; i < POOL_SIZE; i++) {
            pool[i].active = false;
        }
        activeCount = 0;
    }
};

export default Particles;
