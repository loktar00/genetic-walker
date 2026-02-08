import { createRNG } from '../utils/random.js';

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.classList.add('simulation-canvas');
ctx.lineWidth = 2;

canvas.width = window.innerWidth;
canvas.height = 550;

const World = {
    bounds: {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height
    },
    worldWidth: 20000,
    cameraX: 0,
    simSteps: 15,
    dt: 1 / 60,
    gravity: 600,
    damping: 0.99,
    groundFriction: 0.7,
    speedMultiplier: 1,
    offsetX: 0,
    canvas,
    ctx,
    rng: createRNG(42),
    terrain: null,

    resize(w, h) {
        canvas.width = w;
        canvas.height = h;
        this.bounds.width = w;
        this.bounds.height = h;
        ctx.lineWidth = 2;
    }
};

export default World;
