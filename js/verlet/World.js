const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.classList.add('simulation-canvas');
ctx.lineWidth = 2;

const width = 800;
const height = 200;

canvas.width = width;
canvas.height = height;

const World = {
    bounds: {
        x: 0,
        y: 0,
        width: width,
        height: height
    },
    simSteps: 15,
    offsetX: 0,
    canvas: canvas,
    ctx: ctx
};

export default World;
