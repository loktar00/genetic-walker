import World from './World.js';

// Deterministic hash for random-access noise values
function hash(ix, seed) {
    let h = (ix * 374761393 + seed * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    h ^= (h >>> 16);
    return (h >>> 0) / 4294967296;
}

function noise(x, wavelength, seed) {
    const ix = Math.floor(x / wavelength);
    const t = (x / wavelength) - ix;
    const smooth = t * t * (3 - 2 * t); // smoothstep
    const a = hash(ix, seed);
    const b = hash(ix + 1, seed);
    return a + (b - a) * smooth;
}

export default class Terrain {
    constructor(seed) {
        this.seed = seed || 42;
        this.segmentWidth = 20;
        this.baseGround = 400;
        this.waterLevel = 440;
        this._cache = new Map();
    }

    _heightAtSegment(ix) {
        if (this._cache.has(ix)) return this._cache.get(ix);

        const x = ix * this.segmentWidth;
        const seed = this.seed;
        const baseGround = this.baseGround;

        // Negative x: flat at baseGround
        if (x < 0) {
            this._cache.set(ix, baseGround);
            return baseGround;
        }

        // Progressive difficulty: ramps up over distance, no cap
        const difficulty = Math.min(x / 3000, 8.0);

        // Layer 1: Mega terrain — broad elevation changes
        const amp1 = 200 + difficulty * 100;
        const wl1 = 600 - difficulty * 40;

        // Layer 2: Major features — mountains and valleys
        const amp2 = 100 + difficulty * 60;
        const wl2 = 200 - difficulty * 15;

        // Layer 3: Minor features — hills and dips
        const amp3 = 40 + difficulty * 25;
        const wl3 = 70 - difficulty * 5;

        // Layer 4: Surface detail
        const amp4 = 15 + difficulty * 10;
        const wl4 = 30 - difficulty * 2;

        let y = baseGround;
        y += (noise(x, Math.max(wl1, 80), seed * 3 + 1) - 0.5) * amp1;
        y += (noise(x, Math.max(wl2, 30), seed * 7 + 2) - 0.5) * amp2;
        y += (noise(x, Math.max(wl3, 15), seed * 13 + 3) - 0.5) * amp3;
        y += (noise(x, Math.max(wl4, 8), seed * 19 + 4) - 0.5) * amp4;

        // Layer 5: Mountains — very broad, very high amplitude (kicks in at distance)
        if (difficulty > 1.0) {
            const mountainStrength = Math.min((difficulty - 1.0) / 2.0, 1.0);
            const amp5 = 400 * mountainStrength;
            const wl5 = 1000 - difficulty * 60;
            y += (noise(x, Math.max(wl5, 400), seed * 23 + 5) - 0.5) * amp5;
        }

        // Layer 6: Mega ridges and basins at extreme distance
        if (difficulty > 2.5) {
            const megaStrength = Math.min((difficulty - 2.5) / 2.0, 1.0);
            const amp6 = 300 * megaStrength;
            y += (noise(x, 2000, seed * 29 + 6) - 0.5) * amp6;
        }

        // Cliff generation in hard terrain
        if (difficulty > 2.0) {
            const cliffRoll = hash(ix, seed * 31 + 7);
            const cliffChance = 0.015 * Math.min((difficulty - 2.0) / 2.0, 1.0);
            if (cliffRoll < cliffChance) {
                const cliffHeight = (hash(ix, seed * 37 + 8) - 0.5) * 2;
                y += cliffHeight * (80 + 120 * (difficulty / 5.0));
            }
        }

        // Flat starting zone: blend toward baseGround for first 200px
        if (x < 200) {
            const blend = x / 200;
            y = baseGround + (y - baseGround) * blend * blend;
        }

        this._cache.set(ix, y);
        return y;
    }

    getEdgeAtX(x) {
        const segWidth = this.segmentWidth;
        const ix = Math.floor(x / segWidth);
        const x1 = ix * segWidth;
        const x2 = x1 + segWidth;
        const y1 = this._heightAtSegment(ix);
        const y2 = this._heightAtSegment(ix + 1);
        const t = (x - x1) / segWidth;
        return {
            edge: { p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } },
            edgeIndex: ix,
            t: Math.max(0, Math.min(1, t))
        };
    }

    getHeightAtX(x) {
        const { edge, t } = this.getEdgeAtX(x);
        return edge.p1.y + (edge.p2.y - edge.p1.y) * t;
    }

    render() {
        const ctx = World.ctx;
        const camX = World.cameraX;
        const camY = World.cameraY;
        const viewWidth = World.bounds.width;
        const viewHeight = World.bounds.height;
        const segWidth = this.segmentWidth;

        // Visible segment range
        const startIdx = Math.floor(camX / segWidth) - 1;
        const endIdx = Math.ceil((camX + viewWidth) / segWidth) + 1;
        const bottomY = camY + viewHeight;

        // Draw terrain fill
        const x0 = startIdx * segWidth;
        ctx.beginPath();
        ctx.moveTo(x0, this._heightAtSegment(startIdx));
        for (let i = startIdx + 1; i <= endIdx; i++) {
            ctx.lineTo(i * segWidth, this._heightAtSegment(i));
        }
        const xEnd = endIdx * segWidth;
        ctx.lineTo(xEnd, bottomY);
        ctx.lineTo(x0, bottomY);
        ctx.closePath();

        ctx.fillStyle = 'rgba(139, 90, 43, 0.4)';
        ctx.fill();
        ctx.strokeStyle = '#8B5A2B';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw water
        this._renderWater(ctx, camX, camY, viewWidth, viewHeight);
    }

    _renderWater(ctx, camX, camY, viewWidth, viewHeight) {
        const wl = this.waterLevel;
        const bottomY = camY + viewHeight;

        // Water level below viewport — nothing to draw
        if (wl > bottomY) return;

        const left = camX;
        const right = camX + viewWidth;

        if (wl < camY) {
            // Water level above viewport — everything visible is underwater
            ctx.fillStyle = 'rgba(30, 100, 180, 0.25)';
            ctx.fillRect(left, camY, viewWidth, viewHeight);
            return;
        }

        // Water fill below water level
        ctx.fillStyle = 'rgba(30, 100, 180, 0.25)';
        ctx.fillRect(left, wl, viewWidth, bottomY - wl);

        // Water surface line
        ctx.strokeStyle = 'rgba(60, 160, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(left, wl);
        ctx.lineTo(right, wl);
        ctx.stroke();
    }
}
