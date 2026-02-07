import { createRNG } from '../utils/random.js';

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.classList.add('simulation-canvas');
ctx.lineWidth = 2;

const width = 800;
const height = 400;

canvas.width = width;
canvas.height = height;

const World = {
    bounds: {
        x: 0,
        y: 0,
        width: width,
        height: height
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
    canvas: canvas,
    ctx: ctx,
    rng: createRNG(42),
    terrain: null
};

export default World;
