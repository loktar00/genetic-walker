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
    }

    _heightAtSegment(ix) {
        if (this._cache.has(ix)) {
            return this._cache.get(ix);
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

    }
}
