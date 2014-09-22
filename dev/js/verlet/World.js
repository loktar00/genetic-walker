// Really basic.

'use strict';

var World = (function () {
    var instance,
        canvas = document.createElement('canvas'),
        ctx = canvas.getContext('2d');
    canvas.classList.add('simulation-canvas');
    ctx.lineWidth = 2;

    function init() {
        var x       = 0,
            y       = 0, 
            width   = 800,
            height  = 200,
            simSteps = 15,
            offsetX = 0;

        canvas.width = width;
        canvas.height = height;

        return {
            bounds : {
                x : x,
                y : y,
                width : width,
                height : height
            },
            simSteps : simSteps,
            offsetX : offsetX,
            canvas : canvas,
            ctx : ctx
        };
    }
    return {
        getInstance: function () {
            if ( !instance ) {
                instance = init();
            }

            return instance;
        }
    };
})(); 
 
module.exports = World.getInstance();