import World from './World.js';
import Environment from './Environment.js';
import { hash } from '../utils/hash.js';

function noise(x, wavelength, seed) {
    const ix = Math.floor(x / wavelength);
    const t = (x / wavelength) - ix;
    const smooth = t * t * (3 - 2 * t); // smoothstep
    const a = hash(ix, seed);
    const b = hash(ix + 1, seed);
    return a + (b - a) * smooth;
}

// World type layer parameter tables
// Each returns { wavelength, amplitude } given difficulty level
const WORLD_PROFILES = {
    hills: {
        base(diff) {
            return { wl: 2000 + diff * 300, amp: 200 + diff * 50 };
        },
        mountains(diff) {
            if (diff <= 0.5) {return null;}
            const strength = Math.min((diff - 0.5) / 1.5, 1.0);
            return { wl: 3000 + diff * 250, amp: (300 + diff * 60) * strength };
        },
        valleys(diff) {
            return { wl: 1500 + diff * 200, amp: 100 + diff * 60 };
        },
        detail(diff) {
            return { wl: Math.max(80, 300 - diff * 15), amp: 10 + diff * 5 };
        },
        roughness(diff) {
            if (diff <= 2) {return null;}
            const strength = Math.min((diff - 2) / 2, 1.0);
            return { wl: Math.max(25, 60 - diff * 3), amp: (25 + diff * 8) * strength };
        }
    },
    mountains: {
        base(diff) {
            return { wl: 2500 + diff * 200, amp: 300 + diff * 80 };
        },
        mountains(diff) {
            if (diff <= 0.3) {
                return null;
            }
            const strength = Math.min((diff - 0.3) / 1.2, 1.0);
            return { wl: 3500 + diff * 200, amp: (500 + diff * 100) * strength };
        },
        valleys(diff) {
            return { wl: 1800 + diff * 150, amp: 150 + diff * 80 };
        },
        detail(diff) {
            return { wl: Math.max(80, 250 - diff * 12), amp: 12 + diff * 5 };
        },
        roughness(diff) {
            if (diff <= 1.5) {return null;}
            const strength = Math.min((diff - 1.5) / 2, 1.0);
            return { wl: Math.max(25, 50 - diff * 2), amp: (30 + diff * 10) * strength };
        }
    },
    rugged: {
        base(diff) {
            return { wl: 1200 + diff * 150, amp: 180 + diff * 40 };
        },
        mountains(diff) {
            if (diff <= 0.3) {return null;}
            const strength = Math.min((diff - 0.3) / 1.2, 1.0);
            return { wl: 2000 + diff * 200, amp: (250 + diff * 50) * strength };
        },
        valleys(diff) {
            return { wl: 800 + diff * 100, amp: 80 + diff * 50 };
        },
        detail(diff) {
            return { wl: Math.max(40, 150 - diff * 10), amp: 20 + diff * 8 };
        },
        roughness(diff) {
            // Always active for rugged
            return { wl: Math.max(20, 40 - diff * 2), amp: 15 + diff * 10 };
        }
    },
    flat: {
        base(diff) {
            return { wl: 3000 + diff * 500, amp: 60 + diff * 15 };
        },
        mountains() {
            return null;
        },
        valleys(diff) {
            return { wl: 2500 + diff * 300, amp: 30 + diff * 10 };
        },
        detail(diff) {
            return { wl: 400, amp: 5 + diff * 1.5 };
        },
        roughness() {
            return null;
        }
    }
};

export default class Terrain {
    constructor(seed, worldType) {
        this.seed = seed || 42;
        this.worldType = worldType || 'hills';
        this.segmentWidth = 20;
        this.baseGround = 400;
        this._cache = new Map();
        this._maxCacheSize = 5000;
    }

    _heightAtSegment(ix) {
        if (this._cache.has(ix)) {
            return this._cache.get(ix);
        }

        // Evict entire cache when it gets too large — terrain is deterministic
        // so everything can be cheaply recomputed on demand
        if (this._cache.size >= this._maxCacheSize) {
            this._cache.clear();
        }

        const x = ix * this.segmentWidth;
        const seed = this.seed;
        const baseGround = this.baseGround;

        // Negative x: flat at baseGround
        if (x < 0) {
            this._cache.set(ix, baseGround);
            return baseGround;
        }

        // Progressive difficulty: ramps up over distance
        const diff = Math.min(x / 1500, 8.0);

        const profile = WORLD_PROFILES[this.worldType] || WORLD_PROFILES.hills;

        let y = baseGround;

        // Layer 1: Base undulation
        const base = profile.base(diff);
        y += (noise(x, base.wl, seed * 3 + 1) - 0.5) * base.amp;

        // Layer 2: Mountains
        const mtn = profile.mountains(diff);
        if (mtn) {
            y += (noise(x, mtn.wl, seed * 7 + 2) - 0.5) * mtn.amp;
        }

        // Layer 3: Valleys
        const val = profile.valleys(diff);
        y += (noise(x, val.wl, seed * 13 + 3) - 0.5) * val.amp;

        // Layer 4: Surface detail
        const det = profile.detail(diff);
        y += (noise(x, det.wl, seed * 19 + 4) - 0.5) * det.amp;

        // Layer 5: Roughness (replaces spikes — shorter wavelength noise at distance)
        const rough = profile.roughness(diff);
        if (rough) {
            y += (noise(x, rough.wl, seed * 31 + 5) - 0.5) * rough.amp;
        }

        // Flat starting zone: blend toward baseGround for first 400px
        if (x < 400) {
            const blend = x / 400;
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
        const ctx = World.gctx;
        const camX = World.cameraX;
        const camY = World.cameraY;
        const viewWidth = World.bounds.width;
        const viewHeight = World.bounds.height;
        const segWidth = this.segmentWidth;

        // Visible segment range
        const startIdx = Math.floor(camX / segWidth) - 1;
        const endIdx = Math.ceil((camX + viewWidth) / segWidth) + 1;
        const bottomY = camY + viewHeight;

        // Find min terrain Y in visible range for gradient top
        let minY = bottomY;
        const heights = [];
        for (let i = startIdx; i <= endIdx; i++) {
            const h = this._heightAtSegment(i);
            heights.push(h);
            if (h < minY) minY = h;
        }

        // Build terrain path
        const x0 = startIdx * segWidth;
        ctx.beginPath();
        ctx.moveTo(x0, heights[0]);
        for (let i = 1; i < heights.length; i++) {
            ctx.lineTo((startIdx + i) * segWidth, heights[i]);
        }
        const xEnd = endIdx * segWidth;
        ctx.lineTo(xEnd, bottomY);
        ctx.lineTo(x0, bottomY);
        ctx.closePath();

        // Gradient fill: grass green → olive → brown → dark earth
        const grad = ctx.createLinearGradient(0, minY - 10, 0, bottomY);
        grad.addColorStop(0, 'rgb(60,120,40)');
        grad.addColorStop(0.15, 'rgb(70,110,35)');
        grad.addColorStop(0.4, 'rgb(100,80,30)');
        grad.addColorStop(0.7, 'rgb(70,50,20)');
        grad.addColorStop(1.0, 'rgb(35,25,10)');
        ctx.fillStyle = grad;
        ctx.fill();

        // Day/night tint overlay
        const envColors = Environment.getColors();
        if (envColors.terrainTint) {
            ctx.fillStyle = envColors.terrainTint;
            ctx.fill();
        }

        // Soft 3-layer terrain edge
        // Layer 1: Outer glow
        ctx.beginPath();
        ctx.moveTo(x0, heights[0]);
        for (let i = 1; i < heights.length; i++) {
            ctx.lineTo((startIdx + i) * segWidth, heights[i]);
        }
        ctx.strokeStyle = 'rgba(40,90,25,0.25)';
        ctx.lineWidth = 5;
        ctx.stroke();

        // Layer 2: Definition
        ctx.beginPath();
        ctx.moveTo(x0, heights[0]);
        for (let i = 1; i < heights.length; i++) {
            ctx.lineTo((startIdx + i) * segWidth, heights[i]);
        }
        ctx.strokeStyle = 'rgba(70,140,40,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Layer 3: Highlight
        ctx.beginPath();
        ctx.moveTo(x0, heights[0]);
        for (let i = 1; i < heights.length; i++) {
            ctx.lineTo((startIdx + i) * segWidth, heights[i]);
        }
        ctx.strokeStyle = 'rgba(120,180,60,0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Grass tufts along terrain surface
        const spd = World.speedMultiplier || 1;
        this._renderGrassTufts(ctx, startIdx, endIdx, heights, spd);
    }

    renderInViewport(ctx, camX, camY, viewW, viewH, offsetX, offsetY) {
        const segWidth = this.segmentWidth;

        // Visible segment range for this viewport
        const startIdx = Math.floor(camX / segWidth) - 1;
        const endIdx = Math.ceil((camX + viewW) / segWidth) + 1;
        const bottomY = camY + viewH;

        // Find min terrain Y in visible range for gradient top
        let minY = bottomY;
        const heights = [];
        for (let i = startIdx; i <= endIdx; i++) {
            const h = this._heightAtSegment(i);
            heights.push(h);
            if (h < minY) minY = h;
        }

        // Transform: offset for cell position, then subtract camera
        ctx.save();
        ctx.translate(offsetX - camX, offsetY - camY);

        // Build terrain path
        const x0 = startIdx * segWidth;
        ctx.beginPath();
        ctx.moveTo(x0, heights[0]);
        for (let i = 1; i < heights.length; i++) {
            ctx.lineTo((startIdx + i) * segWidth, heights[i]);
        }
        const xEnd = endIdx * segWidth;
        ctx.lineTo(xEnd, bottomY);
        ctx.lineTo(x0, bottomY);
        ctx.closePath();

        // Gradient fill
        const grad = ctx.createLinearGradient(0, minY - 10, 0, bottomY);
        grad.addColorStop(0, 'rgb(60,120,40)');
        grad.addColorStop(0.15, 'rgb(70,110,35)');
        grad.addColorStop(0.4, 'rgb(100,80,30)');
        grad.addColorStop(0.7, 'rgb(70,50,20)');
        grad.addColorStop(1.0, 'rgb(35,25,10)');
        ctx.fillStyle = grad;
        ctx.fill();

        // Day/night tint overlay
        const envColors = Environment.getColors();
        if (envColors.terrainTint) {
            ctx.fillStyle = envColors.terrainTint;
            ctx.fill();
        }

        // Terrain edge stroke
        ctx.beginPath();
        ctx.moveTo(x0, heights[0]);
        for (let i = 1; i < heights.length; i++) {
            ctx.lineTo((startIdx + i) * segWidth, heights[i]);
        }
        ctx.strokeStyle = 'rgba(70,140,40,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();
    }

    _renderGrassTufts(ctx, startIdx, endIdx, heights, speed) {
        if (speed > 20) return;

        const segWidth = this.segmentWidth;

        // Color batches: 4 green shade variants
        const grassColors = [
            'rgba(50,130,30,0.6)',
            'rgba(40,110,25,0.55)',
            'rgba(65,145,40,0.5)',
            'rgba(55,120,35,0.55)'
        ];

        // Pre-compute tuft data for color batching
        const batches = [[], [], [], []];
        for (let i = 0; i < heights.length - 1; i++) {
            const ix = startIdx + i;
            const bx = ix * segWidth;
            const by = heights[i];
            const count = 2 + Math.floor(hash(ix, this.seed * 97 + 7) * 3);
            for (let j = 0; j < count; j++) {
                const h1 = hash(ix * 10 + j, this.seed * 53 + 13);
                const h2 = hash(ix * 10 + j + 100, this.seed * 53 + 13);
                const h3 = hash(ix * 10 + j + 200, this.seed * 53 + 13);
                const tx = bx + h1 * segWidth;
                const t = h1;
                const ty = by + (heights[i + 1] - by) * t;
                const colorIdx = Math.floor(h3 * 4) % 4;
                batches[colorIdx].push({ tx, ty, h2, lean: (h1 - 0.5) * 2 });
            }
        }

        // Pixel-friendly: simple 1-2px vertical lines
        ctx.lineWidth = 1;
        for (let ci = 0; ci < 4; ci++) {
            ctx.strokeStyle = grassColors[ci];
            ctx.beginPath();
            const batch = batches[ci];
            for (let b = 0; b < batch.length; b++) {
                const g = batch[b];
                const grassH = 3 + g.h2 * 5;
                ctx.moveTo(g.tx, g.ty);
                ctx.lineTo(g.tx + g.lean, g.ty - grassH);
            }
            ctx.stroke();
        }
    }
}
