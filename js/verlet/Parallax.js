// Parallax background: volumetric clouds, atmospheric mountains, sun/moon
import { hash } from '../utils/hash.js';
import Environment from './Environment.js';

// Mountain layer configs
const LAYERS = [
    { depth: 0.05, ampMin: 50, ampMax: 100, segW: 200, color: [40, 50, 80], skyBlend: 0.35 },   // Far
    { depth: 0.15, ampMin: 80, ampMax: 150, segW: 120, color: [50, 70, 55], skyBlend: 0.15 },    // Mid
    { depth: 0.30, ampMin: 60, ampMax: 120, segW: 80,  color: [35, 55, 30], skyBlend: 0.0 }      // Near
];

const CLOUD_COUNT = 10;

let _seed = 42;
let _mountains = [];
let _clouds = [];
let _inited = false;

function _buildCloudSprite(cloud) {
    const pad = 8;
    const cw = cloud.w + pad * 2;
    const ch = cloud.h + pad * 2;
    const offscreen = document.createElement('canvas');
    offscreen.width = cw;
    offscreen.height = ch;
    const oc = offscreen.getContext('2d');
    const cx = cw / 2;
    const cy = ch / 2;

    // Pixel-art cloud: stacked horizontal rect runs
    const rows = cloud.rows || [];
    if (rows.length > 0) {
        // Top highlight (white)
        oc.fillStyle = 'rgba(255,255,255,0.7)';
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (i < rows.length * 0.35) {
                oc.fillRect(cx + row.ox, cy + row.oy, row.w, row.h);
            }
        }
        // Middle body (light gray)
        oc.fillStyle = 'rgba(230,235,240,0.65)';
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (i >= rows.length * 0.35 && i < rows.length * 0.7) {
                oc.fillRect(cx + row.ox, cy + row.oy, row.w, row.h);
            }
        }
        // Bottom shadow (darker gray)
        oc.fillStyle = 'rgba(180,190,200,0.5)';
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (i >= rows.length * 0.7) {
                oc.fillRect(cx + row.ox, cy + row.oy, row.w, row.h);
            }
        }
    }

    cloud.sprite = offscreen;
    cloud.spriteW = cw;
    cloud.spriteH = ch;
}

const Parallax = {
    init(terrainSeed) {
        _seed = terrainSeed || 42;
        _mountains = [];
        _clouds = [];

        // Generate mountain layers
        for (let li = 0; li < LAYERS.length; li++) {
            const L = LAYERS[li];
            const segCount = 200;
            const heights = new Float32Array(segCount);
            for (let i = 0; i < segCount; i++) {
                const h1 = hash(i, _seed * 11 + li * 997);
                const h2 = hash(i, _seed * 23 + li * 1009);
                const raw = (h1 + h2) * 0.5;
                heights[i] = L.ampMin + raw * (L.ampMax - L.ampMin);
            }
            _mountains.push({
                heights,
                segW: L.segW,
                depth: L.depth,
                color: L.color,
                skyBlend: L.skyBlend,
                segCount
            });
        }

        // Generate pixel-art clouds with stacked rect rows
        for (let i = 0; i < CLOUD_COUNT; i++) {
            const cx = hash(i, _seed * 41 + 1);
            const cy = 0.08 + hash(i, _seed * 43 + 2) * 0.28;
            const speed = 5 + hash(i, _seed * 47 + 3) * 10;
            const alpha = 0.15 + hash(i, _seed * 53 + 4) * 0.25;
            const w = 80 + hash(i, _seed * 59 + 5) * 100;
            const h = 30 + hash(i, _seed * 61 + 6) * 25;

            // Generate pixel-art cloud shape: horizontal rect runs (wide middle, narrow top/bottom)
            const rows = [];
            const rowCount = 5 + Math.floor(hash(i, _seed * 63 + 7) * 4);
            const rowH = Math.max(3, Math.round(h / rowCount));
            for (let r = 0; r < rowCount; r++) {
                const t = r / (rowCount - 1); // 0=top, 1=bottom
                // Bell-shaped width: widest in middle
                const widthFrac = Math.sin(t * Math.PI);
                const rowW = Math.round(w * (0.3 + widthFrac * 0.7));
                const jitter = (hash(i * 20 + r, _seed * 67 + 8) - 0.5) * 8;
                rows.push({
                    ox: Math.round(-rowW / 2 + jitter),
                    oy: Math.round((r - rowCount / 2) * rowH),
                    w: rowW,
                    h: rowH
                });
            }

            const cloud = { x: cx, y: cy, speed, alpha, w, h, rows, sprite: null, spriteW: 0, spriteH: 0 };
            _buildCloudSprite(cloud);
            _clouds.push(cloud);
        }

        _inited = true;
    },

    render(ctx, w, h, cameraX, phase) {
        if (!_inited) return;

        const speed = arguments[5] || 1;
        const now = performance.now() / 1000;

        // Sun/Moon
        this._renderCelestial(ctx, w, h, phase);

        // Get sky bottom color for atmospheric blending
        const skyColors = Environment._getSkyColors();
        const skyBot = skyColors.bottom;

        // Mountains (far to near, interleave clouds after mid)
        for (let li = 0; li < _mountains.length; li++) {
            this._renderMountainLayer(ctx, w, h, cameraX, _mountains[li], phase, skyBot, li);

            // Inter-layer haze band (between far↔mid and mid↔near)
            if (li < _mountains.length - 1) {
                const hazeAlpha = li === 0 ? 0.07 : 0.05;
                const hazeY = h * 0.65;
                const grad = ctx.createLinearGradient(0, hazeY - 30, 0, hazeY + 30);
                grad.addColorStop(0, `rgba(${Math.round(skyBot[0])},${Math.round(skyBot[1])},${Math.round(skyBot[2])},0)`);
                grad.addColorStop(0.5, `rgba(${Math.round(skyBot[0])},${Math.round(skyBot[1])},${Math.round(skyBot[2])},${hazeAlpha})`);
                grad.addColorStop(1, `rgba(${Math.round(skyBot[0])},${Math.round(skyBot[1])},${Math.round(skyBot[2])},0)`);
                ctx.fillStyle = grad;
                ctx.fillRect(0, hazeY - 30, w, 60);
            }

            // Clouds between mid and near layers
            if (li === 1) {
                this._renderClouds(ctx, w, h, now, phase, speed);
            }
        }
    },

    _renderMountainLayer(ctx, w, h, cameraX, layer, phase, skyBot, layerIndex) {
        const offsetX = cameraX * layer.depth;
        const startSeg = Math.floor(offsetX / layer.segW);
        const endSeg = startSeg + Math.ceil(w / layer.segW) + 2;

        // Tint based on day/night
        const [br, bg, bb] = layer.color;
        let r = br, g = bg, b = bb;
        if (phase >= 0.72 || phase < 0.08) {
            r = br * 0.4; g = bg * 0.4; b = bb * 0.5;
        } else if ((phase >= 0.08 && phase < 0.20) || (phase >= 0.55 && phase < 0.72)) {
            r = br * 0.8 + 30; g = bg * 0.6 + 10; b = bb * 0.5;
        }

        // Atmospheric desaturation: blend toward sky bottom color
        const blend = layer.skyBlend;
        if (blend > 0) {
            r = r * (1 - blend) + skyBot[0] * blend;
            g = g * (1 - blend) + skyBot[1] * blend;
            b = b * (1 - blend) + skyBot[2] * blend;
        }

        const baseY = h * 0.75;

        // Build mountain path and find ridge min Y
        const segXYs = [];
        let minRidgeY = h;
        for (let i = startSeg; i <= endSeg; i++) {
            const idx = ((i % layer.segCount) + layer.segCount) % layer.segCount;
            const sx = i * layer.segW - offsetX;
            const sy = baseY - layer.heights[idx];
            segXYs.push({ x: sx, y: sy });
            if (sy < minRidgeY) minRidgeY = sy;
        }

        // Vertical gradient fill: lighter at ridge, darker at base
        const ri = Math.round(r), gi = Math.round(g), bi = Math.round(b);
        const grad = ctx.createLinearGradient(0, minRidgeY, 0, h);
        grad.addColorStop(0, `rgb(${Math.min(255, ri + 25)},${Math.min(255, gi + 25)},${Math.min(255, bi + 20)})`);
        grad.addColorStop(0.6, `rgb(${ri},${gi},${bi})`);
        grad.addColorStop(1, `rgb(${Math.max(0, ri - 15)},${Math.max(0, gi - 15)},${Math.max(0, bi - 10)})`);
        ctx.fillStyle = grad;

        ctx.beginPath();
        const screenX0 = segXYs[0].x;
        ctx.moveTo(screenX0, h);
        for (let i = 0; i < segXYs.length; i++) {
            ctx.lineTo(segXYs[i].x, segXYs[i].y);
        }
        const screenXEnd = segXYs[segXYs.length - 1].x;
        ctx.lineTo(screenXEnd, h);
        ctx.closePath();
        ctx.fill();

        // Ridge highlight (far and mid layers only)
        if (layerIndex < 2) {
            ctx.beginPath();
            for (let i = 0; i < segXYs.length; i++) {
                if (i === 0) ctx.moveTo(segXYs[i].x, segXYs[i].y);
                else ctx.lineTo(segXYs[i].x, segXYs[i].y);
            }
            ctx.strokeStyle = `rgba(${Math.min(255, ri + 60)},${Math.min(255, gi + 60)},${Math.min(255, bi + 50)},0.2)`;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    },

    _renderClouds(ctx, w, h, now, phase, speed) {
        // Clouds visible during day only (fade at night)
        let cloudAlpha = 1;
        if (phase >= 0.68 && phase < 0.75) {
            cloudAlpha = 1 - (phase - 0.68) / 0.07;
        } else if (phase >= 0.75 || phase < 0.08) {
            cloudAlpha = 0;
        } else if (phase >= 0.08 && phase < 0.15) {
            cloudAlpha = (phase - 0.08) / 0.07;
        }
        if (cloudAlpha <= 0.01) return;

        const frozenClouds = speed > 100;

        ctx.save();
        for (let i = 0; i < _clouds.length; i++) {
            const c = _clouds[i];
            const drift = frozenClouds ? 0 : now * c.speed;
            const totalW = w + c.spriteW * 2;
            const cx = ((c.x * w + drift) % totalW + totalW) % totalW - c.spriteW;
            const cy = c.y * h - c.spriteH / 2;

            ctx.globalAlpha = c.alpha * cloudAlpha;
            ctx.drawImage(c.sprite, cx, cy);
        }
        ctx.globalAlpha = 1.0;
        ctx.restore();
    },

    _renderCelestial(ctx, w, h, phase) {
        // Sun: phase 0.15–0.58
        if (phase >= 0.13 && phase <= 0.60) {
            const t = (phase - 0.13) / (0.60 - 0.13);
            const x = w * (0.1 + t * 0.8);
            const y = h * 0.15 - Math.sin(t * Math.PI) * h * 0.12;

            let alpha = 1;
            if (t < 0.1) alpha = t / 0.1;
            else if (t > 0.9) alpha = (1 - t) / 0.1;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.shadowColor = 'rgba(255,220,100,0.6)';
            ctx.shadowBlur = 30;
            ctx.fillStyle = 'rgba(255,240,180,0.9)';
            ctx.beginPath();
            ctx.arc(x, y, 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        // Moon: phase 0.70–1.0 and 0.0–0.08
        let moonT = -1;
        if (phase >= 0.68) {
            moonT = (phase - 0.68) / 0.40;
        } else if (phase < 0.08) {
            moonT = (phase + 1 - 0.68) / 0.40;
        }

        if (moonT >= 0 && moonT <= 1) {
            const x = w * (0.1 + moonT * 0.8);
            const y = h * 0.12 - Math.sin(moonT * Math.PI) * h * 0.10;

            let alpha = 1;
            if (moonT < 0.1) alpha = moonT / 0.1;
            else if (moonT > 0.9) alpha = (1 - moonT) / 0.1;

            ctx.save();
            ctx.globalAlpha = alpha * 0.85;

            ctx.fillStyle = 'rgba(220,225,240,0.9)';
            ctx.beginPath();
            ctx.arc(x, y, 14, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.beginPath();
            ctx.arc(x + 6, y - 2, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';

            ctx.restore();
        }
    }
};

export default Parallax;
