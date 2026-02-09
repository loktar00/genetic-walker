import World from './World.js';

// Day/night cycle driven by generation number (40 gens = one full cycle)
const CYCLE_LENGTH = 40;

// Sky color palettes per phase
// Each entry: [cycleStart, topColor, bottomColor]
const SKY_STOPS = [
    // Night end
    [0.00, [10, 10, 30], [20, 15, 40]],
    // Dawn
    [0.08, [40, 20, 60], [80, 40, 50]],
    [0.15, [80, 50, 30], [200, 130, 60]],
    // Day start
    [0.20, [30, 80, 160], [100, 170, 230]],
    // Midday
    [0.35, [25, 70, 150], [90, 160, 220]],
    // Day end
    [0.50, [30, 80, 160], [100, 170, 230]],
    // Dusk
    [0.58, [80, 50, 100], [200, 120, 60]],
    [0.68, [40, 20, 60], [100, 50, 40]],
    // Night
    [0.75, [10, 10, 30], [15, 12, 35]],
    [1.00, [10, 10, 30], [20, 15, 40]]
];

// Pre-generate star positions (deterministic)
const STAR_COUNT = 150;
const stars = [];
for (let i = 0; i < STAR_COUNT; i++) {
    let h = (i * 374761393 + 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    h ^= (h >>> 16);
    const r1 = (h >>> 0) / 4294967296;
    h = ((i + 1) * 374761393 + 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    h ^= (h >>> 16);
    const r2 = (h >>> 0) / 4294967296;
    h = ((i + 2) * 374761393 + 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    h ^= (h >>> 16);
    const r3 = (h >>> 0) / 4294967296;
    stars.push({
        x: r1,           // 0-1, fraction of width
        y: r2 * 0.6,     // upper 60% of sky
        size: 0.5 + r3 * 1.5,
        twinkleOffset: r1 * Math.PI * 2
    });
}

function lerpColor(a, b, t) {
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t
    ];
}

function colorStr(c) {
    return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}

// Cache for sky gradient
let _cachedGrad = null;
let _cachedPhase = -1;
let _cachedW = 0;
let _cachedH = 0;

// Cache for vignette
let _vignetteCanvas = null;
let _vignetteW = 0;
let _vignetteH = 0;

const Environment = {
    _phase: 0,

    update(generation) {
        this._phase = (generation % CYCLE_LENGTH) / CYCLE_LENGTH;
    },

    _getSkyColors() {
        const p = this._phase;
        // Find the two stops we're between
        for (let i = 0; i < SKY_STOPS.length - 1; i++) {
            const [s0] = SKY_STOPS[i];
            const [s1] = SKY_STOPS[i + 1];
            if (p >= s0 && p <= s1) {
                const t = (p - s0) / (s1 - s0);
                const smooth = t * t * (3 - 2 * t); // smoothstep
                return {
                    top: lerpColor(SKY_STOPS[i][1], SKY_STOPS[i + 1][1], smooth),
                    bottom: lerpColor(SKY_STOPS[i][2], SKY_STOPS[i + 1][2], smooth)
                };
            }
        }
        return { top: SKY_STOPS[0][1], bottom: SKY_STOPS[0][2] };
    },

    renderSky(ctx, w, h) {
        const colors = this._getSkyColors();
        // Quantize phase to reduce gradient rebuilds
        const phaseStep = Math.floor(this._phase * 200);
        if (_cachedGrad && _cachedPhase === phaseStep && _cachedW === w && _cachedH === h) {
            ctx.fillStyle = _cachedGrad;
            ctx.fillRect(0, 0, w, h);
        } else {
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, colorStr(colors.top));
            grad.addColorStop(1, colorStr(colors.bottom));
            _cachedGrad = grad;
            _cachedPhase = phaseStep;
            _cachedW = w;
            _cachedH = h;
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        }

        // Stars during night phase
        this._renderStars(ctx, w, h);
    },

    _renderStars(ctx, w, h) {
        // Stars visible when phase is in night range (0.68-1.0 and 0.0-0.15)
        const p = this._phase;
        let alpha = 0;
        if (p >= 0.70) {
            alpha = Math.min(1, (p - 0.68) / 0.07);
        } else if (p <= 0.15) {
            alpha = Math.min(1, (0.15 - p) / 0.07);
        }
        if (alpha <= 0.01) return;

        const time = performance.now() / 1000;
        ctx.fillStyle = '#fff';
        for (let i = 0; i < stars.length; i++) {
            const s = stars[i];
            const twinkle = 0.5 + 0.5 * Math.sin(time * 1.5 + s.twinkleOffset);
            const a = alpha * (0.4 + 0.6 * twinkle);
            ctx.globalAlpha = a;
            ctx.beginPath();
            ctx.arc(s.x * w, s.y * h, s.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;
    },

    renderVignette(ctx, w, h) {
        // Use offscreen canvas cache for vignette
        if (!_vignetteCanvas || _vignetteW !== w || _vignetteH !== h) {
            _vignetteCanvas = document.createElement('canvas');
            _vignetteCanvas.width = w;
            _vignetteCanvas.height = h;
            const vctx = _vignetteCanvas.getContext('2d');
            const cx = w / 2;
            const cy = h / 2;
            const r = Math.sqrt(cx * cx + cy * cy);
            const grad = vctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, 'rgba(0,0,0,0.5)');
            vctx.fillStyle = grad;
            vctx.fillRect(0, 0, w, h);
            _vignetteW = w;
            _vignetteH = h;
        }
        ctx.drawImage(_vignetteCanvas, 0, 0);
    },

    renderAtmosphericHaze(ctx, w, h) {
        const colors = this._getSkyColors();
        const [r, g, b] = colors.bottom;
        const grad = ctx.createLinearGradient(0, h * 0.35, 0, h * 0.80);
        grad.addColorStop(0, `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},0)`);
        grad.addColorStop(0.4, `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},0.06)`);
        grad.addColorStop(1, `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, h * 0.35, w, h * 0.45);
    },

    getColors() {
        const p = this._phase;
        let tint = null;
        // Dawn/dusk warm tint
        if (p >= 0.05 && p < 0.20) {
            const t = p < 0.12 ? (p - 0.05) / 0.07 : (0.20 - p) / 0.08;
            const a = Math.max(0, t) * 0.15;
            tint = `rgba(200,120,40,${a.toFixed(3)})`;
        } else if (p >= 0.55 && p < 0.72) {
            const t = p < 0.63 ? (p - 0.55) / 0.08 : (0.72 - p) / 0.09;
            const a = Math.max(0, t) * 0.15;
            tint = `rgba(180,100,50,${a.toFixed(3)})`;
        }
        // Night cool tint
        else if (p >= 0.72 || p < 0.05) {
            tint = 'rgba(20,30,60,0.2)';
        }
        return { terrainTint: tint };
    }
};

export default Environment;
