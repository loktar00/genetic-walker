import World from './World.js';

// Deterministic hash for random-access noise values
function hash(ix, seed) {
    let h = (ix * 374761393 + seed * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    h = h ^ (h >>> 16);
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
        this.points = [];
        this.edges = [];
        this.generate();
    }

    generate() {
        const segWidth = this.segmentWidth;
        const numPoints = Math.floor(World.worldWidth / segWidth) + 1;
        const canvasH = World.bounds.height;
        const baseGround = canvasH * 0.75;
        const seed = this.seed;

        this.points = [];
        for (let i = 0; i < numPoints; i++) {
            const x = i * segWidth;

            // Progressive difficulty: terrain gets harder as x increases
            const difficulty = Math.min(x / 4000, 3.0);

            const amp1 = 120 + difficulty * 80;   // large hills: 120 -> 360
            const wl1  = 400 - difficulty * 80;    // wavelength: 400 -> 160
            const amp2 = 50 + difficulty * 30;     // medium bumps: 50 -> 140
            const wl2  = 120 - difficulty * 25;    // wavelength: 120 -> 45
            const amp3 = 16 + difficulty * 12;     // small roughness: 16 -> 52
            const wl3  = 40 - difficulty * 8;      // wavelength: 40 -> 16

            let y = baseGround;
            y += (noise(x, Math.max(wl1, 20), seed * 3 + 1) - 0.5) * amp1;
            y += (noise(x, Math.max(wl2, 10), seed * 7 + 2) - 0.5) * amp2;
            y += (noise(x, Math.max(wl3, 5),  seed * 13 + 3) - 0.5) * amp3;

            // Flat starting zone: blend toward baseGround for first ~200px
            if (x < 200) {
                const blend = x / 200; // 0 at x=0, 1 at x=200
                y = baseGround + (y - baseGround) * blend * blend;
            }

            const minY = canvasH * 0.10;
            const maxY = canvasH * 0.95;
            y = Math.max(minY, Math.min(maxY, y));
            this.points.push({ x, y });
        }

        // Smoothing pass (3-point average)
        for (let pass = 0; pass < 2; pass++) {
            const smoothed = this.points.map((p, i, arr) => {
                if (i === 0 || i === arr.length - 1) return { x: p.x, y: p.y };
                return { x: p.x, y: (arr[i - 1].y + p.y + arr[i + 1].y) / 3 };
            });
            this.points = smoothed;
        }

        // Build edges
        this.edges = [];
        for (let i = 0; i < this.points.length - 1; i++) {
            this.edges.push({
                p1: this.points[i],
                p2: this.points[i + 1]
            });
        }
    }

    getEdgeAtX(x) {
        const idx = Math.floor(x / this.segmentWidth);
        const clamped = Math.max(0, Math.min(idx, this.edges.length - 1));
        const edge = this.edges[clamped];
        const t = (x - edge.p1.x) / (edge.p2.x - edge.p1.x);
        return { edge, edgeIndex: clamped, t: Math.max(0, Math.min(1, t)) };
    }

    getHeightAtX(x) {
        const { edge, t } = this.getEdgeAtX(x);
        return edge.p1.y + (edge.p2.y - edge.p1.y) * t;
    }

    render() {
        const ctx = World.ctx;
        const camX = World.cameraX;
        const viewWidth = World.bounds.width;
        const canvasH = World.bounds.height;

        // Determine visible segment range
        const startIdx = Math.max(0, Math.floor(camX / this.segmentWidth) - 1);
        const endIdx = Math.min(this.points.length - 1, Math.ceil((camX + viewWidth) / this.segmentWidth) + 1);

        ctx.beginPath();
        ctx.moveTo(this.points[startIdx].x, this.points[startIdx].y);
        for (let i = startIdx + 1; i <= endIdx; i++) {
            ctx.lineTo(this.points[i].x, this.points[i].y);
        }
        // Close path along bottom for fill
        ctx.lineTo(this.points[endIdx].x, canvasH);
        ctx.lineTo(this.points[startIdx].x, canvasH);
        ctx.closePath();

        ctx.fillStyle = 'rgba(139, 90, 43, 0.4)';
        ctx.fill();
        ctx.strokeStyle = '#8B5A2B';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}
