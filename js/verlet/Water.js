// Animated water surface rendering
import Environment from './Environment.js';

const WATER_LEVEL = 440;

const Water = {
    level: WATER_LEVEL,

    // Pass 1: main water fill (behind creatures)
    renderBase(ctx, cameraX, cameraY, viewWidth, viewHeight, speed) {
        speed = speed || 1;
        const screenWaterY = WATER_LEVEL - cameraY;

        // Skip if water not visible
        if (screenWaterY > viewHeight + 10) return;
        if (WATER_LEVEL + 200 < cameraY) return;

        const bottomY = cameraY + viewHeight;
        const leftX = cameraX;
        const rightX = cameraX + viewWidth;

        const now = performance.now() / 1000;
        const flatMode = speed > 100;
        const frozenWave = speed > 20;

        // Wave time (freeze at high speed)
        const t = frozenWave ? 0 : now;

        ctx.save();

        if (flatMode) {
            // Simple flat rectangle
            ctx.fillStyle = 'rgba(20,80,140,0.35)';
            ctx.fillRect(leftX, WATER_LEVEL, rightX - leftX, bottomY - WATER_LEVEL);
        } else {
            // Wavy surface
            ctx.beginPath();
            ctx.moveTo(leftX, bottomY);
            ctx.lineTo(leftX, WATER_LEVEL + _waveOffset(leftX, t));
            for (let x = leftX; x <= rightX; x += 4) {
                ctx.lineTo(x, WATER_LEVEL + _waveOffset(x, t));
            }
            ctx.lineTo(rightX, WATER_LEVEL + _waveOffset(rightX, t));
            ctx.lineTo(rightX, bottomY);
            ctx.closePath();

            // Water color based on day/night
            const phase = Environment._phase;
            let fillColor;
            if (phase >= 0.72 || phase < 0.08) {
                // Night
                fillColor = 'rgba(10,20,50,0.45)';
            } else if ((phase >= 0.08 && phase < 0.20) || (phase >= 0.55 && phase < 0.72)) {
                // Dawn/Dusk
                fillColor = 'rgba(80,60,100,0.38)';
            } else {
                // Day
                fillColor = 'rgba(20,80,140,0.40)';
            }
            ctx.fillStyle = fillColor;
            ctx.fill();
        }

        ctx.restore();
    },

    // Pass 2: surface highlight + shimmer (over creatures)
    renderSurface(ctx, cameraX, cameraY, viewWidth, viewHeight, speed) {
        speed = speed || 1;
        const screenWaterY = WATER_LEVEL - cameraY;
        if (screenWaterY > viewHeight + 10) return;
        if (WATER_LEVEL + 200 < cameraY) return;
        if (speed > 100) return;

        const leftX = cameraX;
        const rightX = cameraX + viewWidth;
        const now = performance.now() / 1000;
        const frozenWave = speed > 20;
        const t = frozenWave ? 0 : now;

        ctx.save();

        // Surface highlight line
        ctx.beginPath();
        ctx.moveTo(leftX, WATER_LEVEL + _waveOffset(leftX, t));
        for (let x = leftX; x <= rightX; x += 4) {
            ctx.lineTo(x, WATER_LEVEL + _waveOffset(x, t));
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Shimmer streaks (4-5 vertical gradient bands)
        if (!frozenWave) {
            const shimmerCount = 5;
            const shimmerW = 30;
            for (let i = 0; i < shimmerCount; i++) {
                const baseX = leftX + ((i / shimmerCount) * viewWidth + now * 15 + i * 137) % viewWidth;
                const waveY = WATER_LEVEL + _waveOffset(baseX, t);
                const grad = ctx.createLinearGradient(baseX, waveY, baseX, waveY + 40);
                grad.addColorStop(0, 'rgba(255,255,255,0.12)');
                grad.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = grad;
                ctx.fillRect(baseX - shimmerW / 2, waveY, shimmerW, 40);
            }
        }

        ctx.restore();
    }
};

function _waveOffset(x, t) {
    return Math.sin(x * 0.02 + t * 1.5) * 3 + Math.sin(x * 0.046 + t * 2.3) * 1.5;
}

export default Water;
