import VerletBody from './verlet/Verlet.js';
import World from './verlet/World.js';
import CreatorCanvas from './creator.js';

const bodies = [];
const canvas = World.canvas;
const ctx = World.ctx;
const width = World.bounds.width;
const height = World.bounds.height;

const creatorCanvas = new CreatorCanvas();

document.querySelector('main').appendChild(World.canvas);

bodies.push(new VerletBody());
updateBodies();

function updateBodies() {
    // update
    for (let b = 0; b < bodies.length; b++) {
        bodies[b].update();
    }

    // render
    ctx.clearRect(0, 0, width, height);
    for (let b = 0; b < bodies.length; b++) {
        bodies[b].render();
    }
    requestAnimationFrame(updateBodies);
}
