'use strict';
var World       = require('./World');

var VerletBody = function(chromosome){
    chromosome              = chromosome || {};
    this.chromosome         = chromosome;

    this.pointMass          = chromosome.pointMass || [];
    this.pointConstraints   = chromosome.pointConstraints || [];
    this.pointMuscles       = chromosome.pointMuscles || [];

    this.world              = World;
    this.bounds             = World.bounds;
    this.simSteps           = World.simSteps;
    this.ctx                = World.ctx;

    this.color              = 'rgb(0,255,0)';

    this.width              = Math.random()*200;
    this.height             = Math.random()*200;

    var pointNum            = chromosome.pointNum || 5;

    for(var i = 0; i < pointNum; i++){
        this.createPoint((10)+Math.random()*this.width, Math.random()*this.height, 0, 0);
    }

    // Create constraints between points
    for (i = 1; i < this.pointMass.length; i++) {
        var spring = 1+Math.random()*3;
        this.createConstraint(this.pointMass[i - 1], this.pointMass[i], spring);
    }

    // create muscles
    var muscleNum = chromosome.muscleNum || 5;

    for (i = 0; i < muscleNum; i++) {
        var pointA = Math.floor(Math.random()*this.pointMass.length),
            pointB = pointA;

        while(pointB === pointA){
            pointB = Math.floor(Math.random()*this.pointMass.length);
        }

        this.createMuscle(this.pointMass[pointA], this.pointMass[pointB], 0.3, 0.01);
    }
};

VerletBody.prototype = {
    createPoint : function (x, y, vx, vy) {
        this.pointMass.push({
            x : x,
            y : y,
            ox : x,
            oy : y,
            vx : vx || 0,
            vy : vy || 0
        });
    },
    createConstraint : function (pMassA, pMassB, spring) {
        this.pointConstraints.push({
            p1 : pMassA,
            p2 : pMassB,
            spring : spring,
            cLength : Math.sqrt((pMassA.x - pMassB.x) * (pMassA.x - pMassB.x) + (pMassA.y - pMassB.y) * (pMassA.y - pMassB.y))
        });
    },
    createMuscle : function(pMassA, pMassB, maxLen, spring){
        var muscleLength = Math.sqrt((pMassA.x - pMassB.x) * (pMassA.x - pMassB.x) + (pMassA.y - pMassB.y) * (pMassA.y - pMassB.y)),
            muscleMin = 0,
            muscleMax = muscleLength+muscleLength*maxLen;

        this.pointMuscles.push({
            p1 : pMassA,
            p2 : pMassB,
            cLength : muscleLength,
            minLen : muscleMin,
            maxLen : muscleMax,
            contract : false,
            spring : spring
        });
    },
    updatePointMass : function(){
        var pointMass           = this.pointMass,
            bounds              = this.bounds;

        for (var i = 0; i < pointMass.length; i++) {
            var point = pointMass[i],
                dx = point.x - point.ox + point.vx,
                dy = point.y - point.oy + point.vy + 0.1;
          
            point.vx *= 0.8;
            point.vy *= 0.8;
            point.ox = point.x;
            point.oy = point.y;

            point.x = point.x + dx;
            point.y = point.y + dy;

            if (point.y >= bounds.height) {
                point.y = bounds.height;
                dx = point.x - point.ox;
                dx = dx * 0.5;
                point.ox += dx;
            }

            if (point.x > bounds.width || point.x < bounds.x) {

                if (point.x > bounds.width) {
                    point.x = bounds.width;
                } else if (point.x < 0) {
                    point.x = 0;
                }
                dy = point.y - point.oy;
                dy = dy * 0.5;
                point.oy += dy;
            }
        }
    },
    updateConstraints : function(){
        var pointConstraints    = this.pointConstraints,
            pointMuscles        = this.pointMuscles,
            simSteps            = this.simSteps;

        for (var i = 0; i < simSteps; i++) {
            for (var c = 0; c < pointConstraints.length; c++) {
                var constraint = pointConstraints[c],
                    dist = Math.sqrt(
                            (constraint.p1.x - constraint.p2.x) * 
                            (constraint.p1.x - constraint.p2.x) + 
                            (constraint.p1.y - constraint.p2.y) * 
                            (constraint.p1.y - constraint.p2.y)
                            ),
                    diff = dist - constraint.cLength;

                var dx = constraint.p1.x - constraint.p2.x,
                    dy = constraint.p1.y - constraint.p2.y;

                if (constraint.cLength > 0) {
                    diff /= constraint.cLength;
                } else {
                    diff = 0;
                }

                dx = dx * 0.5;
                dy = dy * 0.5;

                constraint.p1.x = constraint.p1.x - (diff * dx) / constraint.spring;
                constraint.p1.y = constraint.p1.y - (diff * dy) / constraint.spring;

                constraint.p2.x = constraint.p2.x + (diff * dx) / constraint.spring;
                constraint.p2.y = constraint.p2.y + (diff * dy) / constraint.spring;
            }

            // update muscles
            for (c = 0; c < pointMuscles.length; c++) {
                var muscle = pointMuscles[c];

                if(muscle.contract){
                    if(muscle.cLength > 1){
                        muscle.cLength-=0.1;
                    }else{
                        muscle.contract = false;
                    }
                }else{
                    if(muscle.cLength <= muscle.maxLen){
                        muscle.cLength+=0.1;
                    }else{
                        muscle.contract = true;
                    }
                }

               // muscle.cLength -= Math.sin( (muscle.ang--) );

                var dist = Math.sqrt(
                            (muscle.p1.x - muscle.p2.x) * 
                            (muscle.p1.x - muscle.p2.x) + 
                            (muscle.p1.y - muscle.p2.y) * 
                            (muscle.p1.y - muscle.p2.y)
                            ),
                    diff = dist - muscle.cLength;

                var dx = muscle.p1.x - muscle.p2.x,
                    dy = muscle.p1.y - muscle.p2.y;

                if (muscle.cLength > 0) {
                    diff /= muscle.cLength;
                } else {
                    diff = 0;
                }

                dx = dx * 0.5;
                dy = dy * 0.5;

                muscle.p1.x = muscle.p1.x - (diff * dx) * muscle.spring;
                muscle.p1.y = muscle.p1.y - (diff * dy) * muscle.spring;

                muscle.p2.x = muscle.p2.x + (diff * dx) * muscle.spring;
                muscle.p2.y = muscle.p2.y + (diff * dy) * muscle.spring;
            }
        }
    },
    update : function() {
        this.updatePointMass();
        this.updateConstraints();
    },
    render : function () {
        var pointMass           = this.pointMass,
            pointConstraints    = this.pointConstraints,
            pointMuscles        = this.pointMuscles,
            ctx                 = this.ctx,
            color               = this.color;

          ctx.fillStyle      = color;
          ctx.strokeStyle    = color;

         // ctx.lineWidth = 2;

          //ctx.beginPath();
          //ctx.moveTo(pointConstraints[0].x, pointConstraints[0].y);
          //for (var c = 1; c < pointConstraints.length; c++) {
          //    var point = pointConstraints[c];
          //    ctx.lineTo(point.x, point.y);
         // }

          //ctx.lineTo(pointConstraints[pointConstraints.length - 2].x, pointConstraints[pointConstraints.length - 2].y);
          //ctx.closePath();
          //ctx.fill();

        for (var p = 0; p < pointMass.length; p++) {
            var point = pointMass[p];

            ctx.beginPath();
            ctx.arc(point.x, point.y, 2, 0,Math.PI*2);
            ctx.closePath();
            ctx.stroke();
        }

        for (var c = 0; c < pointConstraints.length; c++) {
            var constraint = pointConstraints[c];

            ctx.beginPath();
                ctx.moveTo(constraint.p1.x, constraint.p1.y);
                ctx.lineTo(constraint.p2.x, constraint.p2.y);
            ctx.closePath();
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgb(255,0,0)';
        for (c = 0; c < pointMuscles.length; c++) {
            var muscle = pointMuscles[c];

            ctx.beginPath();
                ctx.moveTo(muscle.p1.x, muscle.p1.y);
                ctx.lineTo(muscle.p2.x, muscle.p2.y);
            ctx.closePath();
            ctx.stroke();
        }
    }

};

module.exports = VerletBody;