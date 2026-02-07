import World from './World.js';

export default class VerletBody {
    constructor(chromosome) {
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

        this.width              = Math.random() * 200;
        this.height             = Math.random() * 200;

        const pointNum          = chromosome.pointNum || 5;

        for (let i = 0; i < pointNum; i++) {
            this.createPoint((10) + Math.random() * this.width, Math.random() * this.height, 0, 0);
        }

        // Create constraints between points
        for (let i = 1; i < this.pointMass.length; i++) {
            const spring = 1 + Math.random() * 3;
            this.createConstraint(this.pointMass[i - 1], this.pointMass[i], spring);
        }

        // create muscles
        const muscleNum = chromosome.muscleNum || 5;

        for (let i = 0; i < muscleNum; i++) {
            const pointA = Math.floor(Math.random() * this.pointMass.length);
            let pointB = pointA;

            while (pointB === pointA) {
                pointB = Math.floor(Math.random() * this.pointMass.length);
            }

            this.createMuscle(this.pointMass[pointA], this.pointMass[pointB], 0.3, 0.01);
        }
    }

    createPoint(x, y, vx, vy) {
        this.pointMass.push({
            x: x,
            y: y,
            ox: x,
            oy: y,
            vx: vx || 0,
            vy: vy || 0
        });
    }

    createConstraint(pMassA, pMassB, spring) {
        this.pointConstraints.push({
            p1: pMassA,
            p2: pMassB,
            spring: spring,
            cLength: Math.sqrt((pMassA.x - pMassB.x) * (pMassA.x - pMassB.x) + (pMassA.y - pMassB.y) * (pMassA.y - pMassB.y))
        });
    }

    createMuscle(pMassA, pMassB, maxLen, spring) {
        const muscleLength = Math.sqrt((pMassA.x - pMassB.x) * (pMassA.x - pMassB.x) + (pMassA.y - pMassB.y) * (pMassA.y - pMassB.y));
        const muscleMin = 0;
        const muscleMax = muscleLength + muscleLength * maxLen;

        this.pointMuscles.push({
            p1: pMassA,
            p2: pMassB,
            cLength: muscleLength,
            minLen: muscleMin,
            maxLen: muscleMax,
            contract: false,
            spring: spring
        });
    }

    updatePointMass() {
        const pointMass = this.pointMass;
        const bounds = this.bounds;

        for (let i = 0; i < pointMass.length; i++) {
            const point = pointMass[i];
            let dx = point.x - point.ox + point.vx;
            let dy = point.y - point.oy + point.vy + 0.1;

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
    }

    updateConstraints() {
        const pointConstraints = this.pointConstraints;
        const pointMuscles = this.pointMuscles;
        const simSteps = this.simSteps;

        for (let i = 0; i < simSteps; i++) {
            for (let c = 0; c < pointConstraints.length; c++) {
                const constraint = pointConstraints[c];
                const dist = Math.sqrt(
                    (constraint.p1.x - constraint.p2.x) *
                    (constraint.p1.x - constraint.p2.x) +
                    (constraint.p1.y - constraint.p2.y) *
                    (constraint.p1.y - constraint.p2.y)
                );
                let diff = dist - constraint.cLength;

                let dx = constraint.p1.x - constraint.p2.x;
                let dy = constraint.p1.y - constraint.p2.y;

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
            for (let c = 0; c < pointMuscles.length; c++) {
                const muscle = pointMuscles[c];

                if (muscle.contract) {
                    if (muscle.cLength > 1) {
                        muscle.cLength -= 0.1;
                    } else {
                        muscle.contract = false;
                    }
                } else {
                    if (muscle.cLength <= muscle.maxLen) {
                        muscle.cLength += 0.1;
                    } else {
                        muscle.contract = true;
                    }
                }

                const dist = Math.sqrt(
                    (muscle.p1.x - muscle.p2.x) *
                    (muscle.p1.x - muscle.p2.x) +
                    (muscle.p1.y - muscle.p2.y) *
                    (muscle.p1.y - muscle.p2.y)
                );
                let diff = dist - muscle.cLength;

                let dx = muscle.p1.x - muscle.p2.x;
                let dy = muscle.p1.y - muscle.p2.y;

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
    }

    update() {
        this.updatePointMass();
        this.updateConstraints();
    }

    render() {
        const pointMass = this.pointMass;
        const pointConstraints = this.pointConstraints;
        const pointMuscles = this.pointMuscles;
        const ctx = this.ctx;
        const color = this.color;

        ctx.fillStyle = color;
        ctx.strokeStyle = color;

        for (let p = 0; p < pointMass.length; p++) {
            const point = pointMass[p];

            ctx.beginPath();
            ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.stroke();
        }

        for (let c = 0; c < pointConstraints.length; c++) {
            const constraint = pointConstraints[c];

            ctx.beginPath();
            ctx.moveTo(constraint.p1.x, constraint.p1.y);
            ctx.lineTo(constraint.p2.x, constraint.p2.y);
            ctx.closePath();
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgb(255,0,0)';
        for (let c = 0; c < pointMuscles.length; c++) {
            const muscle = pointMuscles[c];

            ctx.beginPath();
            ctx.moveTo(muscle.p1.x, muscle.p1.y);
            ctx.lineTo(muscle.p2.x, muscle.p2.y);
            ctx.closePath();
            ctx.stroke();
        }
    }
}
