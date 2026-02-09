// Food system: deterministic pixel berries scattered along terrain
import { hash } from '../utils/hash.js';
import Particles from './Particles.js';

const BERRY_TYPES = [
    { r: 220, g: 40, b: 40 },   // Red
    { r: 40, g: 180, b: 40 },   // Green
    { r: 60, g: 80, b: 220 },   // Blue
];

const COLLECT_RANGE = 15;      // px proximity to collect
const CLUSTER_MIN_SPACING = 150;
const CLUSTER_MAX_SPACING = 300;
const BERRIES_PER_CLUSTER_MIN = 2;
const BERRIES_PER_CLUSTER_MAX = 4;
const START_X = 200;           // No berries in flat starting zone

export default class Food {
    constructor(terrain, seed) {
        this.terrain = terrain;
        this.seed = seed || 42;
        this.berries = [];
        this._generate();
    }

    _generate() {
        this.berries = [];
        let x = START_X;
        let clusterIdx = 0;

        // Generate berries along the terrain up to a reasonable distance
        // More will be generated on-demand as creatures explore further
        this._generateUpTo(5000);
    }

    _generateUpTo(maxX) {
        const existingMax = this.berries.length > 0
            ? this.berries[this.berries.length - 1].x
            : START_X;

        let x = existingMax < START_X ? START_X : existingMax;
        let clusterIdx = this.berries.length;

        while (x < maxX) {
            // Deterministic cluster spacing
            const spacing = CLUSTER_MIN_SPACING +
                hash(clusterIdx, this.seed * 137 + 1) * (CLUSTER_MAX_SPACING - CLUSTER_MIN_SPACING);
            x += spacing;

            const count = BERRIES_PER_CLUSTER_MIN +
                Math.floor(hash(clusterIdx, this.seed * 149 + 2) * (BERRIES_PER_CLUSTER_MAX - BERRIES_PER_CLUSTER_MIN + 1));

            for (let i = 0; i < count; i++) {
                const bx = x + (hash(clusterIdx * 10 + i, this.seed * 163 + 3) - 0.5) * 30;
                const typeIdx = Math.floor(hash(clusterIdx * 10 + i, this.seed * 173 + 4) * BERRY_TYPES.length);
                this.berries.push({
                    x: bx,
                    type: typeIdx,
                    collected: false
                });
            }

            clusterIdx++;
        }
    }

    // Reset all berries for new generation
    reset() {
        for (let i = 0; i < this.berries.length; i++) {
            this.berries[i].collected = false;
        }
    }

    // Check collection: returns number of berries collected by this body
    checkCollection(body) {
        let collected = 0;
        const pts = body.pointMass;

        // Extend berry generation if creatures have gone far
        const com = body.getCOM();
        if (this.berries.length === 0 || com.x > this.berries[this.berries.length - 1].x - 500) {
            this._generateUpTo(com.x + 2000);
        }

        for (let b = 0; b < this.berries.length; b++) {
            const berry = this.berries[b];
            if (berry.collected) continue;

            // Quick X-range check
            if (berry.x < com.x - 100 || berry.x > com.x + 100) continue;

            const by = this.terrain.getHeightAtX(berry.x);

            for (let p = 0; p < pts.length; p++) {
                const dx = pts[p].x - berry.x;
                const dy = pts[p].y - by;
                if (dx * dx + dy * dy < COLLECT_RANGE * COLLECT_RANGE) {
                    berry.collected = true;
                    collected++;
                    // Particle burst
                    const bt = BERRY_TYPES[berry.type];
                    Particles.emitFoodCollect(berry.x, by, bt.r, bt.g, bt.b);
                    break;
                }
            }
        }

        return collected;
    }

    // Render visible berries
    render(ctx, cameraX, viewWidth, speed) {
        if (speed > 20) return; // Skip rendering at high speed (still collect in physics)

        const leftX = cameraX - 20;
        const rightX = cameraX + viewWidth + 20;

        for (let b = 0; b < this.berries.length; b++) {
            const berry = this.berries[b];
            if (berry.collected) continue;
            if (berry.x < leftX || berry.x > rightX) continue;

            const by = this.terrain.getHeightAtX(berry.x);
            const bt = BERRY_TYPES[berry.type];

            // Stem (1px line below berry)
            ctx.strokeStyle = 'rgba(40,80,20,0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(berry.x, by);
            ctx.lineTo(berry.x, by - 4);
            ctx.stroke();

            // Berry dot (3-4px colored rectangle for pixel art)
            const size = 3;
            ctx.fillStyle = `rgb(${bt.r},${bt.g},${bt.b})`;
            ctx.fillRect(berry.x - size / 2, by - 4 - size, size, size);

            // Highlight pixel (top-left)
            ctx.fillStyle = `rgba(255,255,255,0.4)`;
            ctx.fillRect(berry.x - size / 2, by - 4 - size, 1, 1);
        }
    }
}
