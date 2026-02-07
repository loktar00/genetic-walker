import World from './World.js';

export default class VerletBody {
    constructor(genome, spawnX, spawnY, color) {
        this.pointMass = [];
        this.pointConstraints = [];
        this.pointMuscles = [];
        this.world = World;
        this.bounds = World.bounds;
        this.simSteps = World.simSteps;
        this.ctx = World.ctx;
        this.genome = genome || null;
        this.age = 0;
        this.frozen = false;
        this.color = color || 'rgb(0,255,0)';

        if (genome) {
            this._buildFromGenome(genome, spawnX || 100, spawnY);
        }
    }

    _buildFromGenome(genome, spawnX, spawnY) {
        const terrain = World.terrain;

        // If no spawnY provided, calculate from terrain
        if (spawnY === undefined) {
            const terrainY = terrain ? terrain.getHeightAtX(spawnX) : World.bounds.height;
            spawnY = terrainY - genome.bodyHeight - 20;
        }

        // Create points from genome (ry=0 is ground level, ry=1 is top)
        for (const pt of genome.points) {
            const px = spawnX + pt.rx * genome.bodyWidth;
            const py = spawnY + (1 - pt.ry) * genome.bodyHeight; // flip ry so 1=top
            this.createPoint(px, py, 0, 0);
        }

        // Create constraints
        for (const c of genome.constraints) {
            if (c.a < this.pointMass.length && c.b < this.pointMass.length) {
                this.createConstraint(this.pointMass[c.a], this.pointMass[c.b], c.stiffness);
            }
        }

        // Create muscles from genome
        for (const m of genome.muscles) {
            if (m.a < this.pointMass.length && m.b < this.pointMass.length) {
                this._createMuscleFromGenome(
                    this.pointMass[m.a], this.pointMass[m.b],
                    m.extensionFactor, m.contractionFactor,
                    m.frequency, m.phase, m.strength
                );
            }
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
        const rawLength = Math.sqrt(
            (pMassA.x - pMassB.x) * (pMassA.x - pMassB.x) +
            (pMassA.y - pMassB.y) * (pMassA.y - pMassB.y)
        );
        this.pointConstraints.push({
            p1: pMassA,
            p2: pMassB,
            spring: spring,
            cLength: Math.max(rawLength, 5)
        });
    }

    _createMuscleFromGenome(pMassA, pMassB, extensionFactor, contractionFactor, frequency, phase, strength) {
        const restLength = Math.sqrt(
            (pMassA.x - pMassB.x) * (pMassA.x - pMassB.x) +
            (pMassA.y - pMassB.y) * (pMassA.y - pMassB.y)
        );
        const maxLen = restLength * (1 + extensionFactor);
        const minLen = Math.max(restLength * (1 - contractionFactor), 5);

        this.pointMuscles.push({
            p1: pMassA,
            p2: pMassB,
            cLength: restLength,
            restLength: restLength,
            minLen: minLen,
            maxLen: maxLen,
            frequency: frequency,
            phase: phase,
            spring: strength
        });
    }

    createMuscle(pMassA, pMassB, maxLen, spring) {
        const muscleLength = Math.sqrt(
            (pMassA.x - pMassB.x) * (pMassA.x - pMassB.x) +
            (pMassA.y - pMassB.y) * (pMassA.y - pMassB.y)
        );
        const muscleMin = Math.max(muscleLength * 0.3, 5);
        const muscleMax = muscleLength + muscleLength * maxLen;

        this.pointMuscles.push({
            p1: pMassA,
            p2: pMassB,
            cLength: muscleLength,
            restLength: muscleLength,
            minLen: muscleMin,
            maxLen: muscleMax,
            frequency: 1.5,
            phase: 0,
            spring: spring
        });
    }

    getCOM() {
        let cx = 0, cy = 0;
        const pts = this.pointMass;
        for (let i = 0; i < pts.length; i++) {
            cx += pts[i].x;
            cy += pts[i].y;
        }
        return { x: cx / pts.length, y: cy / pts.length };
    }

    setColor(color) {
        this.color = color;
    }

    updatePointMass(dt) {
        const pointMass = this.pointMass;
        const gravity = World.gravity;
        const damping = World.damping;
        const terrain = World.terrain;
        const worldWidth = World.worldWidth;
        const friction = World.groundFriction;
        const dtSq = dt * dt;

        for (let i = 0; i < pointMass.length; i++) {
            const point = pointMass[i];
            let dx = (point.x - point.ox) * damping + point.vx * dt;
            let dy = (point.y - point.oy) * damping + point.vy * dt + gravity * dtSq;

            point.vx = 0;
            point.vy = 0;
            point.ox = point.x;
            point.oy = point.y;

            point.x += dx;
            point.y += dy;

            // Terrain collision
            if (terrain && point.x >= 0 && point.x <= worldWidth) {
                const terrainY = terrain.getHeightAtX(point.x);
                if (point.y > terrainY) {
                    point.y = terrainY;

                    // Get edge for tangent-based friction
                    const { edge } = terrain.getEdgeAtX(point.x);
                    const ex = edge.p2.x - edge.p1.x;
                    const ey = edge.p2.y - edge.p1.y;
                    const edgeLen = Math.sqrt(ex * ex + ey * ey);

                    if (edgeLen > 0) {
                        const tx = ex / edgeLen;
                        const ty = ey / edgeLen;

                        // Velocity from position delta
                        const velX = point.x - point.ox;
                        const velY = point.y - point.oy;

                        // Project velocity onto tangent
                        const dot = velX * tx + velY * ty;
                        point.ox = point.x - dot * friction * tx;
                        point.oy = point.y - dot * friction * ty;
                    }
                }
            } else {
                // Fallback boundary collision for outside terrain range
                if (point.y >= this.bounds.height) {
                    point.y = this.bounds.height;
                    dx = point.x - point.ox;
                    point.ox += dx * 0.5;
                }
            }

            // Left/right world bounds
            if (point.x < 0) {
                point.x = 0;
            } else if (point.x > worldWidth) {
                point.x = worldWidth;
            }

            // Top boundary
            if (point.y < 0) {
                point.y = 0;
            }
        }
    }

    solveDistanceConstraint(constraint) {
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

        constraint.p1.x -= (diff * dx) / constraint.spring;
        constraint.p1.y -= (diff * dy) / constraint.spring;
        constraint.p2.x += (diff * dx) / constraint.spring;
        constraint.p2.y += (diff * dy) / constraint.spring;
    }

    solveMuscleConstraint(muscle) {
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

        muscle.p1.x -= (diff * dx) * muscle.spring;
        muscle.p1.y -= (diff * dy) * muscle.spring;
        muscle.p2.x += (diff * dx) * muscle.spring;
        muscle.p2.y += (diff * dy) * muscle.spring;
    }

    updateConstraints(dt) {
        const pointConstraints = this.pointConstraints;
        const pointMuscles = this.pointMuscles;
        const simSteps = this.simSteps;

        // Sin-based muscle oscillation
        for (let c = 0; c < pointMuscles.length; c++) {
            const muscle = pointMuscles[c];
            const t = Math.sin(this.age * muscle.frequency * Math.PI * 2 + muscle.phase) * 0.5 + 0.5;
            muscle.cLength = muscle.minLen + t * (muscle.maxLen - muscle.minLen);
        }

        // Solver iterations (structure enforcement)
        for (let i = 0; i < simSteps; i++) {
            for (let c = 0; c < pointConstraints.length; c++) {
                this.solveDistanceConstraint(pointConstraints[c]);
            }
            for (let c = 0; c < pointMuscles.length; c++) {
                this.solveMuscleConstraint(pointMuscles[c]);
            }
        }
    }

    update(dt) {
        if (this.frozen) return;
        this.age += dt;
        this.updateConstraints(dt);  // solve structure first
        this.updatePointMass(dt);    // then integrate + collide
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

        // Muscles rendered slightly transparent version of body color
        const muscleColor = this.frozen ? this.color : this._muscleColor || 'rgb(255,0,0)';
        ctx.strokeStyle = muscleColor;
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
