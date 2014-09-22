'use strict';

var VerletBody  = require('./verlet/Verlet'),
    World       = require('./verlet/World'),
    Creator     = require('./creator');


var bodies = [],
    canvas = World.canvas,
    ctx = World.ctx,
    width = World.bounds.width,
    height = World.bounds.height;

function ready(){
    document.removeEventListener( 'DOMContentLoaded', ready, false );
    window.removeEventListener( 'load', ready, false );

    var creatorCanvas = new Creator();

    document.querySelector('main').appendChild(World.canvas);

    bodies.push(new VerletBody());
    updateBodies();
}

document.addEventListener( 'DOMContentLoaded', ready, false );
window.addEventListener( 'load', ready, false );



function updateBodies(){
    //update
    for(var b = 0; b < bodies.length; b++){
        bodies[b].update();
    }

    // render
    ctx.clearRect(0,0,width,height);
    for(b = 0; b < bodies.length; b++){
        bodies[b].render();
    }
    requestAnimationFrame(updateBodies);
}