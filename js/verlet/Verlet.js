import World from './World.js';
import { renderPattern, computePatternParams } from './Patterns.js';
import Particles from './Particles.js';

export default class VerletBody {
    constructor(genome, spawnX, spawnY, color) {
        this.pointMass = [];
        this.pointConstraints = [];
        this.pointMuscles = [];
        this.world = World;
        this.bounds = World.bounds;
        this.simSteps = World.simSteps;
        this.ctx = null; // resolved dynamically via World.gctx
        this.genome = genome || null;
        this.age = 0;
        this.totalEnergy = 0;
        this.frozen = false;
        this.color = color || 'rgb(0,255,0)';

        // Eye tracking state
        this._prevComX = 0;
        this._prevComY = 0;
        this._faceDirX = 1;
        this._faceDirY = 0;

        // Pattern cache (set in _buildFromGenome)
        this._patternType = 'solid';
        this._patternParams = null;

        // Dust emission throttle (per-point frame counter)
        this._dustFrame = 0;

        if (genome) {
            this._buildFromGenome(genome, spawnX || 100, spawnY);
        }
    }

    _buildFromGenome(genome, spawnX, rawSpawnY) {
        const terrain = World.terrain;

        // If no spawnY provided, calculate from terrain
        let spawnY = rawSpawnY;
        if (spawnY === undefined) {
            const terrainY = terrain ? terrain.getHeightAtX(spawnX) : World.bounds.height;
            spawnY = terrainY - genome.bodyHeight - 20;
        }

        // Create points from genome (ry=0 is ground level, ry=1 is top)
        for (const pt of genome.points) {
            const px = spawnX + pt.rx * genome.bodyWidth;
            const py = spawnY + (1 - pt.ry) * genome.bodyHeight; // flip ry so 1=top
            this.createPoint(px, py, 0, 0, pt.mass || 1.0);
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
                    m.frequency, m.phase, m.strength,
                    m.waveform || 0, m.activationMode || 0
                );
            }
        }

        // Compute pattern type from genome topology hash
        const pp = computePatternParams(genome);
        this._patternType = pp.type;
        this._patternParams = pp;

        // Init eye tracking from spawn position
        const com = this.getCOM();
        this._prevComX = com.x;
        this._prevComY = com.y;
    }

    createPoint(x, y, vx, vy, mass) {
        this.pointMass.push({
            x,
            y,
            ox: x,
            oy: y,
            vx: vx || 0,
            vy: vy || 0,
            mass: mass || 1.0,
            grounded: false
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
            spring,
            cLength: Math.max(rawLength, 5)
        });
    }

    _createMuscleFromGenome(pMassA, pMassB, extensionFactor, contractionFactor, frequency, phase, strength, waveform, activationMode) {
        const restLength = Math.sqrt(
            (pMassA.x - pMassB.x) * (pMassA.x - pMassB.x) +
            (pMassA.y - pMassB.y) * (pMassA.y - pMassB.y)
        );
        const maxLen = Math.min(restLength * (1 + extensionFactor), 250);
        const minLen = Math.max(restLength * (1 - contractionFactor), 5);

        this.pointMuscles.push({
            p1: pMassA,
            p2: pMassB,
            cLength: restLength,
            restLength,
            minLen,
            maxLen,
            frequency,
            phase,
            spring: strength,
            waveform: waveform || 0,
            activationMode: activationMode || 0
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
            spring
        });
    }

    getCOM() {
        let cx = 0, cy = 0, totalMass = 0;
        const pts = this.pointMass;
        for (let i = 0; i < pts.length; i++) {
            const m = pts[i].mass;
            cx += pts[i].x * m;
            cy += pts[i].y * m;
            totalMass += m;
        }
        return { x: cx / totalMass, y: cy / totalMass };
    }

    setColor(color) {
        this.color = color;
    }

    updatePointMass(dt) {
        const pointMass = this.pointMass;
        const gravity = World.gravity;
        const damping = World.damping;
        const terrain = World.terrain;
        const friction = World.groundFriction;
        const restitution = World.restitution;
        const dtSq = dt * dt;

        for (let i = 0; i < pointMass.length; i++) {
            const point = pointMass[i];
            point.grounded = false;
            const dx = (point.x - point.ox) * damping + point.vx * dt;
            const dy = (point.y - point.oy) * damping + point.vy * dt + gravity * dtSq;

            point.vx = 0;
            point.vy = 0;
            point.ox = point.x;
            point.oy = point.y;

            point.x += dx;
            point.y += dy;

            // NaN guard — freeze degenerate bodies
            if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
                point.x = point.ox;
                point.y = point.oy;
                this.frozen = true;
                return;
            }

            // Terrain collision (infinite — works for any x >= 0)
            if (terrain && point.x >= 0) {
                const terrainY = terrain.getHeightAtX(point.x);
                if (point.y > terrainY) {
                    const impactVel = point.y - point.oy;
                    point.y = terrainY;
                    point.grounded = true;

                    // Dust particles on hard ground impact
                    if (impactVel > 3 && World.speedMultiplier <= 5 && this._dustFrame <= 0) {
                        Particles.emitDust(point.x, terrainY, impactVel);
                        this._dustFrame = 5;
                    }

                    // Get edge for tangent/normal decomposition
                    const { edge } = terrain.getEdgeAtX(point.x);
                    const ex = edge.p2.x - edge.p1.x;
                    const ey = edge.p2.y - edge.p1.y;
                    const edgeLen = Math.sqrt(ex * ex + ey * ey);

                    if (edgeLen > 0) {
                        const tx = ex / edgeLen;
                        const ty = ey / edgeLen;
                        // Outward normal (away from surface in canvas coords)
                        const nx = ty;
                        const ny = -tx;

                        // Velocity from position delta
                        const velX = point.x - point.ox;
                        const velY = point.y - point.oy;

                        // Decompose velocity into tangent and normal components
                        const vDotT = velX * tx + velY * ty;
                        const vDotN = velX * nx + velY * ny;

                        // Only reflect if moving into surface
                        if (vDotN < 0) {
                            // Tangent component with friction + reflected normal with restitution
                            const newVelX = vDotT * friction * tx + (-vDotN * restitution) * nx;
                            const newVelY = vDotT * friction * ty + (-vDotN * restitution) * ny;
                            point.ox = point.x - newVelX;
                            point.oy = point.y - newVelY;
                        } else {
                            // Sliding along surface — friction only
                            point.ox = point.x - vDotT * friction * tx;
                            point.oy = point.y - vDotT * friction * ty;
                        }
                    }
                }

            }

            // Left boundary
            if (point.x < 0) {
                point.x = 0;
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

        const dx = constraint.p1.x - constraint.p2.x;
        const dy = constraint.p1.y - constraint.p2.y;

        if (constraint.cLength > 0) {
            diff /= constraint.cLength;
        } else {
            diff = 0;
        }

        // Mass-weighted correction: lighter points move more
        const invM1 = 1 / constraint.p1.mass;
        const invM2 = 1 / constraint.p2.mass;
        const totalInv = invM1 + invM2;
        const w1 = invM1 / totalInv;
        const w2 = invM2 / totalInv;

        constraint.p1.x -= (diff * dx) * w1 / constraint.spring;
        constraint.p1.y -= (diff * dy) * w1 / constraint.spring;
        constraint.p2.x += (diff * dx) * w2 / constraint.spring;
        constraint.p2.y += (diff * dy) * w2 / constraint.spring;
    }

    solveMuscleConstraint(muscle) {
        const dist = Math.sqrt(
            (muscle.p1.x - muscle.p2.x) *
            (muscle.p1.x - muscle.p2.x) +
            (muscle.p1.y - muscle.p2.y) *
            (muscle.p1.y - muscle.p2.y)
        );
        let diff = dist - muscle.cLength;

        const dx = muscle.p1.x - muscle.p2.x;
        const dy = muscle.p1.y - muscle.p2.y;

        if (muscle.cLength > 0) {
            diff /= muscle.cLength;
        } else {
            diff = 0;
        }

        // Mass-weighted correction: lighter points move more
        const invM1 = 1 / muscle.p1.mass;
        const invM2 = 1 / muscle.p2.mass;
        const totalInv = invM1 + invM2;
        const w1 = invM1 / totalInv;
        const w2 = invM2 / totalInv;

        muscle.p1.x -= (diff * dx) * w1 * muscle.spring;
        muscle.p1.y -= (diff * dy) * w1 * muscle.spring;
        muscle.p2.x += (diff * dx) * w2 * muscle.spring;
        muscle.p2.y += (diff * dy) * w2 * muscle.spring;
    }

    updateConstraints() {
        const pointConstraints = this.pointConstraints;
        const pointMuscles = this.pointMuscles;
        const simSteps = this.simSteps;

        // Muscle oscillation with waveforms and activation modes
        for (let c = 0; c < pointMuscles.length; c++) {
            const muscle = pointMuscles[c];

            // Check activation mode (uses previous frame's grounded state)
            const mode = muscle.activationMode || 0;
            let active = true;
            if (mode === 1) active = muscle.p1.grounded || muscle.p2.grounded;
            else if (mode === 2) active = !muscle.p1.grounded && !muscle.p2.grounded;

            if (active) {
                const rawPhase = this.age * muscle.frequency * Math.PI * 2 + muscle.phase;
                let t;
                switch (muscle.waveform) {
                    case 1:  // Sawtooth: linear ramp 0→1 then snap back
                        t = ((rawPhase / (Math.PI * 2)) % 1 + 1) % 1;
                        break;
                    case 2:  // Square: hold at extremes
                        t = Math.sin(rawPhase) >= 0 ? 1 : 0;
                        break;
                    default: // Sine: smooth oscillation
                        t = Math.sin(rawPhase) * 0.5 + 0.5;
                }
                muscle.cLength = muscle.minLen + t * (muscle.maxLen - muscle.minLen);
            } else {
                muscle.cLength = muscle.restLength;
            }
        }

        // Measure muscle energy (before solver iterations for consistency)
        for (let c = 0; c < pointMuscles.length; c++) {
            const muscle = pointMuscles[c];
            const mdx = muscle.p1.x - muscle.p2.x;
            const mdy = muscle.p1.y - muscle.p2.y;
            const dist = Math.sqrt(mdx * mdx + mdy * mdy);
            this.totalEnergy += Math.abs(dist - muscle.cLength) * muscle.spring;
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

    resolveConstraintTerrain() {
        const terrain = World.terrain;
        if (!terrain) {return;}
        const allConstraints = this.pointConstraints;
        const allMuscles = this.pointMuscles;

        for (let list = 0; list < 2; list++) {
            const arr = list === 0 ? allConstraints : allMuscles;
            for (let c = 0; c < arr.length; c++) {
                const con = arr[c];
                const p1 = con.p1;
                const p2 = con.p2;

                const dx = Math.abs(p2.x - p1.x);
                const samples = Math.max(1, Math.ceil(dx / 20));

                for (let s = 1; s <= samples; s++) {
                    const t = s / (samples + 1);
                    const sx = p1.x + (p2.x - p1.x) * t;
                    const sy = p1.y + (p2.y - p1.y) * t;

                    // eslint-disable-next-line no-continue
                    if (sx < 0) {continue;}

                    const terrainY = terrain.getHeightAtX(sx);
                    if (sy > terrainY) {
                        const penetration = sy - terrainY;
                        const invM1 = 1 / p1.mass;
                        const invM2 = 1 / p2.mass;
                        const totalInv = invM1 + invM2;
                        p1.y -= penetration * (invM1 / totalInv);
                        p2.y -= penetration * (invM2 / totalInv);
                    }
                }
            }
        }
    }

    update(frameDt) {
        if (this.frozen) {return;}
        this.age += frameDt;
        if (this._dustFrame > 0) this._dustFrame--;
        this.updateConstraints();         // solve structure first
        this.updatePointMass(frameDt);    // then integrate + collide
        this.resolveConstraintTerrain();  // constraint-terrain collision
    }

    _computeConvexHull() {
        const pts = this.pointMass;
        if (pts.length < 3) return pts.map(p => ({ x: p.x, y: p.y }));

        // Jarvis march (gift wrapping) — fine for 3-12 points
        let leftmost = 0;
        for (let i = 1; i < pts.length; i++) {
            if (pts[i].x < pts[leftmost].x ||
                (pts[i].x === pts[leftmost].x && pts[i].y < pts[leftmost].y)) {
                leftmost = i;
            }
        }

        const hull = [];
        let current = leftmost;
        do {
            hull.push({ x: pts[current].x, y: pts[current].y });
            let next = 0;
            for (let i = 1; i < pts.length; i++) {
                if (next === current) { next = i; continue; }
                const cross = (pts[i].x - pts[current].x) * (pts[next].y - pts[current].y) -
                              (pts[i].y - pts[current].y) * (pts[next].x - pts[current].x);
                if (cross < 0) next = i;
                else if (cross === 0) {
                    // Collinear: pick the farther point
                    const di = (pts[i].x - pts[current].x) ** 2 + (pts[i].y - pts[current].y) ** 2;
                    const dn = (pts[next].x - pts[current].x) ** 2 + (pts[next].y - pts[current].y) ** 2;
                    if (di > dn) next = i;
                }
            }
            current = next;
        } while (current !== leftmost && hull.length < pts.length);

        return hull;
    }

    render() {
        const pointMass = this.pointMass;
        const pointConstraints = this.pointConstraints;
        const pointMuscles = this.pointMuscles;
        const ctx = World.gctx;
        const color = this.color;
        const thick = this._isSeeded && !this.frozen;
        const speed = World.speedMultiplier;
        const hue = this._hue || 0;

        // Convex hull body fill with top-lit gradient
        let hull = null;
        if (pointMass.length >= 3) {
            hull = this._computeConvexHull();

            // Find hull bounding box for gradient
            let minHY = Infinity, maxHY = -Infinity;
            for (let i = 0; i < hull.length; i++) {
                if (hull[i].y < minHY) minHY = hull[i].y;
                if (hull[i].y > maxHY) maxHY = hull[i].y;
            }
            // Guard against NaN/degenerate hulls
            if (!isFinite(minHY) || !isFinite(maxHY) || minHY === maxHY) {
                minHY = 0; maxHY = 1;
            }

            ctx.beginPath();
            ctx.moveTo(hull[0].x, hull[0].y);
            for (let i = 1; i < hull.length; i++) {
                ctx.lineTo(hull[i].x, hull[i].y);
            }
            ctx.closePath();

            if (this.isLeader && !this.frozen) {
                // Leader glow with gradient
                ctx.save();
                ctx.shadowColor = 'rgba(255,255,100,0.5)';
                ctx.shadowBlur = 20;
                const lg = ctx.createLinearGradient(0, minHY, 0, maxHY);
                lg.addColorStop(0, 'rgba(255,255,150,0.35)');
                lg.addColorStop(1, 'rgba(200,180,50,0.35)');
                ctx.fillStyle = lg;
                ctx.fill();
                ctx.restore();
            } else if (this.frozen) {
                const fg = ctx.createLinearGradient(0, minHY, 0, maxHY);
                fg.addColorStop(0, 'rgba(140,140,140,0.12)');
                fg.addColorStop(1, 'rgba(80,80,80,0.12)');
                ctx.fillStyle = fg;
                ctx.fill();
            } else {
                const bg = ctx.createLinearGradient(0, minHY, 0, maxHY);
                bg.addColorStop(0, `hsla(${hue},60%,65%,0.30)`);
                bg.addColorStop(1, `hsla(${hue},70%,35%,0.30)`);
                ctx.fillStyle = bg;
                ctx.fill();
            }

            // Subtle hull outline
            ctx.beginPath();
            ctx.moveTo(hull[0].x, hull[0].y);
            for (let i = 1; i < hull.length; i++) {
                ctx.lineTo(hull[i].x, hull[i].y);
            }
            ctx.closePath();
            if (this.frozen) {
                ctx.strokeStyle = 'rgba(80,80,80,0.15)';
            } else {
                ctx.strokeStyle = `hsla(${hue},50%,20%,0.4)`;
            }
            ctx.lineWidth = 1;
            ctx.stroke();

            // Pattern overlay (skip at high speed or when frozen)
            if (speed <= 10 && !this.frozen && this._patternType !== 'solid' && hull.length >= 3) {
                renderPattern(ctx, hull, this._patternParams, this.color);
            }
        }

        // Rounded bones (organic limbs, not wireframe)
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = color;
        ctx.lineWidth = thick ? 2.5 : 1.5;

        for (let c = 0; c < pointConstraints.length; c++) {
            const constraint = pointConstraints[c];
            ctx.beginPath();
            ctx.moveTo(constraint.p1.x, constraint.p1.y);
            ctx.lineTo(constraint.p2.x, constraint.p2.y);
            ctx.stroke();
        }

        // Muscles rendered with contraction-aware thickness/opacity
        const muscleColor = this.frozen ? this.color : this._muscleColor || `hsl(${(hue + 20) % 360},85%,45%)`;
        ctx.strokeStyle = muscleColor;
        const baseWidth = thick ? 4 : 2;
        for (let c = 0; c < pointMuscles.length; c++) {
            const muscle = pointMuscles[c];

            if (!this.frozen && muscle.restLength > 1) {
                const ratio = muscle.cLength / muscle.restLength;
                const ct = Math.max(0, Math.min(1, (1.3 - ratio) / 0.6));
                ctx.lineWidth = baseWidth + ct * 4;
                ctx.globalAlpha = 0.4 + ct * 0.6;
            } else {
                ctx.lineWidth = baseWidth;
                ctx.globalAlpha = 1.0;
            }

            ctx.beginPath();
            ctx.moveTo(muscle.p1.x, muscle.p1.y);
            ctx.lineTo(muscle.p2.x, muscle.p2.y);
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;

        // Joint dots (small filled, not debug circles) — skip at speed>20
        if (speed <= 20) {
            const dotAlpha = this.frozen ? 0.2 : 0.6;
            ctx.fillStyle = this.frozen
                ? `rgba(100,100,100,${dotAlpha})`
                : `hsla(${hue},60%,50%,${dotAlpha})`;
            for (let p = 0; p < pointMass.length; p++) {
                const point = pointMass[p];
                ctx.beginPath();
                ctx.arc(point.x, point.y, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Eyes (skip at high speed)
        if (speed <= 50 && pointMass.length >= 2) {
            this._renderEyes(ctx);
        }

        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.lineWidth = 1;
    }

    _renderEyes(ctx) {
        const pts = this.pointMass;
        const com = this.getCOM();

        // Update facing direction from COM movement
        const dx = com.x - this._prevComX;
        const dy = com.y - this._prevComY;
        this._prevComX = com.x;
        this._prevComY = com.y;

        const moveMag = Math.sqrt(dx * dx + dy * dy);
        if (moveMag > 0.1) {
            const nx = dx / moveMag;
            const ny = dy / moveMag;
            // Exponential moving average for smooth direction
            this._faceDirX = this._faceDirX * 0.9 + nx * 0.1;
            this._faceDirY = this._faceDirY * 0.9 + ny * 0.1;
            // Renormalize
            const len = Math.sqrt(this._faceDirX * this._faceDirX + this._faceDirY * this._faceDirY);
            if (len > 0.01) {
                this._faceDirX /= len;
                this._faceDirY /= len;
            }
        }

        const fdx = this._faceDirX;
        const fdy = this._faceDirY;

        // Find "head" point: highest dot-product with facing direction, biased upward
        let headIdx = 0;
        let bestScore = -Infinity;
        for (let i = 0; i < pts.length; i++) {
            const relX = pts[i].x - com.x;
            const relY = pts[i].y - com.y;
            // Dot with facing + upward bias (negative Y = up in canvas)
            const score = relX * fdx + relY * fdy - relY * 0.5;
            if (score > bestScore) {
                bestScore = score;
                headIdx = i;
            }
        }

        const head = pts[headIdx];

        // Eye sizing based on body dimensions
        const genome = this.genome;
        const bodyScale = genome ? Math.sqrt(genome.bodyWidth * genome.bodyHeight) / 80 : 1;
        const eyeRadius = Math.max(1.5, Math.min(4, 2.5 * bodyScale));

        // Perpendicular to facing direction (for eye spread)
        const perpX = -fdy;
        const perpY = fdx;
        const spread = eyeRadius * 1.8;

        // Eye positions: offset from head point slightly along facing direction
        const eyeOffsetForward = eyeRadius * 0.5;
        const baseX = head.x + fdx * eyeOffsetForward;
        const baseY = head.y + fdy * eyeOffsetForward;

        const leftEyeX = baseX + perpX * spread;
        const leftEyeY = baseY + perpY * spread;
        const rightEyeX = baseX - perpX * spread;
        const rightEyeY = baseY - perpY * spread;

        // Pupil offset (looking in facing direction)
        const pupilOff = eyeRadius * 0.3;
        const pupilR = eyeRadius * 0.5;

        if (this.frozen) {
            // X marks for frozen creatures
            ctx.strokeStyle = 'rgba(150,150,150,0.4)';
            ctx.lineWidth = 1;
            const s = eyeRadius * 0.7;
            for (const [ex, ey] of [[leftEyeX, leftEyeY], [rightEyeX, rightEyeY]]) {
                ctx.beginPath();
                ctx.moveTo(ex - s, ey - s);
                ctx.lineTo(ex + s, ey + s);
                ctx.moveTo(ex + s, ey - s);
                ctx.lineTo(ex - s, ey + s);
                ctx.stroke();
            }
        } else {
            // Sclera (white)
            const scleraColor = this.isLeader ? 'rgba(255,255,230,0.95)' : 'rgba(255,255,255,0.95)';
            const r = this.isLeader ? eyeRadius * 1.15 : eyeRadius;
            ctx.fillStyle = scleraColor;
            for (const [ex, ey] of [[leftEyeX, leftEyeY], [rightEyeX, rightEyeY]]) {
                ctx.beginPath();
                ctx.arc(ex, ey, r, 0, Math.PI * 2);
                ctx.fill();
            }
            // Pupils (black)
            ctx.fillStyle = '#000';
            for (const [ex, ey] of [[leftEyeX, leftEyeY], [rightEyeX, rightEyeY]]) {
                ctx.beginPath();
                ctx.arc(ex + fdx * pupilOff, ey + fdy * pupilOff, pupilR, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}
