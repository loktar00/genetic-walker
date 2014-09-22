'use strict';

var CreatorCanvas = function(){
    this.canvas = document.getElementById('creator-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.addPoint = document.getElementById('add-point');
    this.addConstraint = document.getElementById('add-constraint');
    this.addMuscle = document.getElementById('add-muscle');
    
    this.removePoint = document.getElementById('remove-point');
    this.removeConstraint = document.getElementById('remove-constraint');
    this.removeMuscle = document.getElementById('remove-muscle');


    this.points = [];
    this.contraints = [];
    this.muscles = [];
};



module.exports = CreatorCanvas;