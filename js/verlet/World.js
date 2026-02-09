import { createRNG } from '../utils/random.js';

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.classList.add('simulation-canvas');
ctx.lineWidth = 2;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight - 100;

const World = {
    bounds: {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height
    },
    cameraX: 0,
    cameraY: 0,
    simSteps: 15,
    dt: 1 / 60,
    gravity: 600,
    damping: 0.99,
    groundFriction: 0.6,
    restitution: 0.3,
    speedMultiplier: 1,
    offsetX: 0,
    canvas,
    ctx,
    // Game rendering context — routes through offscreen canvas when pixelScale > 1
    gctx: ctx,
    gameCanvas: null,
    pixelScale: 1,
    rng: createRNG(42),
    terrain: null,

    setPixelScale(scale) {
        this.pixelScale = scale;
        if (scale <= 1) {
            this.gctx = ctx;
            this.gameCanvas = null;
        } else {
            const gw = Math.ceil(this.bounds.width / scale);
            const gh = Math.ceil(this.bounds.height / scale);
            if (!this.gameCanvas) {
                this.gameCanvas = document.createElement('canvas');
            }
            this.gameCanvas.width = gw;
            this.gameCanvas.height = gh;
            this.gctx = this.gameCanvas.getContext('2d');
            this.gctx.lineWidth = 2;
        }
    },

    resize(w, h) {
        canvas.width = w;
        canvas.height = h;
        this.bounds.width = w;
        this.bounds.height = h;
        ctx.lineWidth = 2;
        // Rebuild offscreen canvas if pixel scaling is active
        if (this.pixelScale > 1) {
            this.setPixelScale(this.pixelScale);
        }
    }
};

export default World;
