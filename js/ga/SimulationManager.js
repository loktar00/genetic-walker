import { createRNG } from '../utils/random.js';
import { createRandomGenome, randomCreatureSize, cloneGenome, validateGenome } from './Genome.js';
import { nextGeneration } from './Selection.js';
import VerletBody from '../verlet/Verlet.js';
import Particles from '../verlet/Particles.js';
import { saveState } from '../ui/Persistence.js';

// Fitness weight constants
const FOOD_WEIGHT = 50;           // per berry collected
const KO_BONUS = 200;             // per enemy KO
const DAMAGE_WEIGHT = 0.5;        // per damage dealt
const SURVIVAL_BONUS = 100;       // full health at end
const DAMAGE_SCALE = 0.15;        // velocity → damage multiplier

// Hall of Fame localStorage key
const HOF_KEY = 'genetic-walker-hof';

export default class SimulationManager {
    constructor(config, food) {
        this.config = config;
        this.food = food || null;
        this.generation = 0;
        this.genomes = [];
        this.bodies = [];
        this.bodyStates = [];
        this.elapsedTime = 0;
        this.rng = createRNG(config.terrainSeed);
        this.history = [];
        this.bestGenome = null;
        this.bestFitness = 0;
        this.stagnationGen = 0;
        this.state = 'IDLE';
        this.spawnX = 100;

        // Enemy system — per-creature
        this.hallOfFame = this._loadHallOfFame();
        this.enemyMilestones = []; // [{generation, genome}] — chronological order
        this.enemyBlueprints = []; // mirrored genomes ready to instantiate

        // Stats for HUD
        this.genFoodCollected = 0;
        this.genKOs = 0;
    }

    _loadHallOfFame() {
        try {
            const raw = localStorage.getItem(HOF_KEY);
            if (raw) {
                const hof = JSON.parse(raw);
                if (Array.isArray(hof)) return hof.slice(0, 20);
            }
        } catch (e) {
            // ignore
        }
        return [];
    }

    _saveHallOfFame() {
        try {
            localStorage.setItem(HOF_KEY, JSON.stringify(this.hallOfFame.slice(0, 20)));
        } catch (e) {
            // ignore
        }
    }

    _addToHallOfFame(genome, fitness, generation) {
        this.hallOfFame.push({
            genome: cloneGenome(genome),
            fitness,
            generation
        });
        // Keep sorted by fitness descending, cap at 20
        this.hallOfFame.sort((a, b) => b.fitness - a.fitness);
        if (this.hallOfFame.length > 20) {
            this.hallOfFame.length = 20;
        }
        this._saveHallOfFame();
    }

    _getMilestoneParams() {
        const difficulty = this.config.enemyDifficulty || 'normal';
        switch (difficulty) {
            case 'easy':   return { interval: 10, max: 4 };
            case 'hard':   return { interval: 3,  max: 12 };
            default:       return { interval: 5,  max: 8 };
        }
    }

    _captureMilestone(genome, generation) {
        const params = this._getMilestoneParams();
        if (this.enemyMilestones.length >= params.max) return;
        this.enemyMilestones.push({
            generation,
            genome: cloneGenome(genome)
        });
    }

    initNewPopulation(seedGenomes) {
        this.genomes = [];
        this.seedCount = 0;
        if (seedGenomes) {
            for (const sg of seedGenomes) {
                if (this.genomes.length < this.config.populationSize) {
                    this.genomes.push(validateGenome(cloneGenome(sg)));
                    this.seedCount++;
                }
            }
        }
        if (this.seedCount > 0) {
            // eslint-disable-next-line no-console
            console.log(`Seeded ${this.seedCount} creature(s) into population`);
        }
        while (this.genomes.length < this.config.populationSize) {
            const { numPts, numMus } = randomCreatureSize(this.rng);
            this.genomes.push(createRandomGenome(this.rng, numPts, numMus));
        }
        this.startGeneration(this.genomes);
    }

    resumeFromState(savedState) {
        this.generation = savedState.generation;
        this.genomes = savedState.genomes;
        this.bestGenome = savedState.bestGenome;
        this.bestFitness = savedState.bestFitness;
        this.history = savedState.history || [];
        if (savedState.enemyMilestones) {
            this.enemyMilestones = savedState.enemyMilestones;
        }
        if (savedState.rngState !== undefined) {
            this.rng.setState(savedState.rngState);
        }
        this.startGeneration(this.genomes);
    }

    startGeneration(genomes) {
        this.genomes = genomes;
        this.bodies = [];
        this.bodyStates = [];
        this.elapsedTime = 0;
        this.state = 'RUNNING';
        this.genFoodCollected = 0;
        this.genKOs = 0;

        // Reset food for new generation
        if (this.food) {
            this.food.reset();
        }

        const seedCount = this.seedCount || 0;

        for (let i = 0; i < genomes.length; i++) {
            const isSeeded = this.generation === 0 && i < seedCount;
            const hue = (i / genomes.length) * 360;
            const color = isSeeded ? '#fff' : `hsl(${hue}, 80%, 60%)`;
            const body = new VerletBody(genomes[i], this.spawnX, undefined, color);
            body._hue = hue;
            body._muscleColor = isSeeded ? '#ff0' : `hsl(${(hue + 20) % 360}, 85%, 45%)`;
            body._bodyFill = isSeeded ? 'rgba(255,255,255,0.30)' : `hsla(${hue},70%,50%,0.30)`;
            body._isSeeded = isSeeded;

            // Health system
            body.health = 100;
            body.maxHealth = 100;
            body.knockouts = 0;
            body.damageDealt = 0;
            body.foodScore = 0;

            this.bodies.push(body);

            const com = body.getCOM();
            this.bodyStates.push({
                startX: com.x,
                maxX: com.x,
                currentX: com.x,
                lastProgressTime: 0,
                stallCountdown: null,
                finished: false,
                fitness: 0,
                lastSpeedCheckTime: 0,
                lastSpeedCheckX: com.x,
                enemies: [],        // per-creature enemy VerletBody instances
                enemyHealths: null,  // Float32Array
                enemyKOd: null       // Uint8Array
            });
        }

        // Build enemy blueprints and spawn per-creature enemies
        this._buildBlueprints();
        this._spawnPerCreatureEnemies();
    }

    _buildBlueprints() {
        this.enemyBlueprints = [];
        if (this.config.combatEnabled === false) return;
        if (this.enemyMilestones.length === 0) return;

        for (let i = 0; i < this.enemyMilestones.length; i++) {
            const mirroredGenome = this._mirrorGenome(this.enemyMilestones[i].genome);
            this.enemyBlueprints.push(mirroredGenome);
        }
    }

    _mirrorGenome(genome) {
        const mirrored = cloneGenome(genome);
        for (const pt of mirrored.points) {
            pt.rx = 1 - pt.rx;
        }
        for (const m of mirrored.muscles) {
            m.phase = (m.phase + Math.PI) % (Math.PI * 2);
        }
        return mirrored;
    }

    _spawnPerCreatureEnemies() {
        const numBlueprints = this.enemyBlueprints.length;

        for (let i = 0; i < this.bodyStates.length; i++) {
            const state = this.bodyStates[i];
            state.enemies = [];
            state.enemyHealths = new Float32Array(numBlueprints).fill(100);
            state.enemyKOd = new Uint8Array(numBlueprints); // 0 = alive

            if (numBlueprints === 0) continue;

            for (let j = 0; j < numBlueprints; j++) {
                const spawnX = 800 + j * 1000;
                const enemyBody = new VerletBody(this.enemyBlueprints[j], spawnX, undefined, '#f44');
                enemyBody._hue = 0;
                enemyBody._muscleColor = '#a22';
                enemyBody._bodyFill = 'rgba(200,40,40,0.30)';
                enemyBody._isEnemy = true;
                enemyBody.health = 100;
                enemyBody.maxHealth = 100;
                state.enemies.push(enemyBody);
            }
        }
    }

    _createMirroredBody(genome, spawnX) {
        const mirroredGenome = this._mirrorGenome(genome);
        const body = new VerletBody(mirroredGenome, spawnX, undefined, '#f44');
        return body;
    }

    update(dt) {
        if (this.state !== 'RUNNING') {return;}

        this.elapsedTime += dt;

        // Update creatures
        for (let i = 0; i < this.bodies.length; i++) {
            const body = this.bodies[i];
            const state = this.bodyStates[i];

            if (state.finished) continue;

            body.update(dt);

            // Food collection
            if (this.food && this.config.foodEnabled !== false) {
                const collected = this.food.checkCollection(body);
                if (collected > 0) {
                    body.foodScore += collected;
                    this.genFoodCollected += collected;
                }
            }

            // Track progress
            const com = body.getCOM();
            state.currentX = com.x;

            if (state.currentX > state.maxX + 1) {
                state.maxX = state.currentX;
                state.lastProgressTime = this.elapsedTime;
                state.stallCountdown = null;
            }

            // Backward movement detection
            const backwardThreshold = this.config.backwardThreshold || 0;
            const movedBackward = backwardThreshold > 0 &&
                state.currentX < state.maxX - backwardThreshold;

            // Stall detection
            const timeSinceProgress = this.elapsedTime - state.lastProgressTime;
            const isStalled = timeSinceProgress > this.config.stallTimeout;

            // Minimum speed check
            const speedCheckInterval = 3;
            const minSpeed = 5;
            const timeSinceSpeedCheck = this.elapsedTime - state.lastSpeedCheckTime;
            if (timeSinceSpeedCheck >= speedCheckInterval) {
                const dx = state.currentX - state.lastSpeedCheckX;
                const speed = dx / timeSinceSpeedCheck;
                state.lastSpeedCheckTime = this.elapsedTime;
                state.lastSpeedCheckX = state.currentX;
                if (speed < minSpeed && this.elapsedTime > speedCheckInterval) {
                    this._finishCreature(i);
                    continue;
                }
            }

            // KO check (health depleted by enemies)
            if (body.health <= 0 && !state.finished) {
                this._finishCreature(i);
                Particles.emitKO(com.x, com.y);
                continue;
            }

            if (isStalled || movedBackward) {
                if (state.stallCountdown === null) {
                    state.stallCountdown = 3;
                } else {
                    state.stallCountdown -= dt;
                    if (state.stallCountdown <= 0) {
                        this._finishCreature(i);
                    }
                }
            }
        }

        // Update per-creature enemies (proximity gated)
        if (this.config.combatEnabled !== false && this.enemyBlueprints.length > 0) {
            for (let i = 0; i < this.bodies.length; i++) {
                const state = this.bodyStates[i];
                if (state.finished) continue;
                const creatureCOM = this.bodies[i].getCOM();

                for (let j = 0; j < state.enemies.length; j++) {
                    const enemy = state.enemies[j];
                    if (enemy.frozen) continue;

                    // Proximity gate: only simulate within 500px
                    const eCOM = enemy.getCOM();
                    if (Math.abs(eCOM.x - creatureCOM.x) > 500) continue;

                    enemy.update(dt);

                    // Despawn if walked past x=0
                    if (eCOM.x < 0) enemy.frozen = true;
                }
            }

            // Combat
            this._handleCombat();
        }

        // Check if eval time exceeded
        if (this.config.evalTime !== Infinity && this.elapsedTime >= this.config.evalTime) {
            for (let i = 0; i < this.bodies.length; i++) {
                if (!this.bodyStates[i].finished) {
                    this._finishCreature(i);
                }
            }
        }

        // Check if all finished
        const allFinished = this.bodyStates.every(s => s.finished);
        if (allFinished) {
            this.endGeneration();
        }
    }

    _handleCombat() {
        for (let i = 0; i < this.bodies.length; i++) {
            const body = this.bodies[i];
            const state = this.bodyStates[i];
            if (state.finished || body.frozen) continue;

            const comA = body.getCOM();

            for (let j = 0; j < state.enemies.length; j++) {
                // Skip if this creature already KO'd this enemy
                if (state.enemyKOd[j]) continue;

                const enemy = state.enemies[j];
                if (enemy.frozen) continue;

                const comB = enemy.getCOM();

                // Quick distance check
                const dx = comA.x - comB.x;
                const dy = comA.y - comB.y;
                const distSq = dx * dx + dy * dy;
                const maxRange = 80;
                if (distSq > maxRange * maxRange) continue;

                // Check point proximity
                let collision = false;
                let penetration = 0;

                for (let pa = 0; pa < body.pointMass.length && !collision; pa++) {
                    for (let pb = 0; pb < enemy.pointMass.length; pb++) {
                        const pA = body.pointMass[pa];
                        const pB = enemy.pointMass[pb];
                        const pdx = pA.x - pB.x;
                        const pdy = pA.y - pB.y;
                        const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
                        if (pdist < 12) {
                            collision = true;
                            penetration = 12 - pdist;
                            break;
                        }
                    }
                }

                if (!collision) continue;

                // Push ONLY the creature away (enemy stays put for fairness)
                const dist = Math.sqrt(distSq) || 1;
                const pushX = dx / dist;
                const pushY = dy / dist;
                const pushForce = penetration * 0.5;

                for (let p = 0; p < body.pointMass.length; p++) {
                    body.pointMass[p].x += pushX * pushForce;
                    body.pointMass[p].y += pushY * pushForce;
                }

                // Damage based on relative velocity
                const velAx = comA.x - (body._prevCombatX || comA.x);
                const velAy = comA.y - (body._prevCombatY || comA.y);
                const velBx = comB.x - (enemy._prevCombatX || comB.x);
                const velBy = comB.y - (enemy._prevCombatY || comB.y);

                const relVelX = velAx - velBx;
                const relVelY = velAy - velBy;
                const relSpeed = Math.sqrt(relVelX * relVelX + relVelY * relVelY);
                const damage = relSpeed * DAMAGE_SCALE * 10;

                if (damage > 0.1) {
                    // Creature takes damage to its own health
                    body.health -= damage * 0.6;
                    body.damageDealt += damage;

                    // Enemy takes damage in THIS creature's personal tracking
                    state.enemyHealths[j] -= damage;

                    // Check per-creature enemy KO
                    if (state.enemyHealths[j] <= 0 && !state.enemyKOd[j]) {
                        state.enemyKOd[j] = 1;
                        body.knockouts++;
                        this.genKOs++;
                        Particles.emitKO(comB.x, comB.y);
                    }
                }
            }
        }

        // Store previous COM for velocity calculation
        for (let i = 0; i < this.bodies.length; i++) {
            const com = this.bodies[i].getCOM();
            this.bodies[i]._prevCombatX = com.x;
            this.bodies[i]._prevCombatY = com.y;
        }
        // Store prev COM for per-creature enemies
        for (let i = 0; i < this.bodyStates.length; i++) {
            const state = this.bodyStates[i];
            for (let j = 0; j < state.enemies.length; j++) {
                const com = state.enemies[j].getCOM();
                state.enemies[j]._prevCombatX = com.x;
                state.enemies[j]._prevCombatY = com.y;
            }
        }
    }

    _finishCreature(index) {
        const state = this.bodyStates[index];
        const body = this.bodies[index];
        state.finished = true;
        state.aliveTime = this.elapsedTime;
        const distance = Math.max(0, state.maxX - state.startX);
        const energy = body.totalEnergy;
        const weight = this.config.energyWeight || 0;
        const avgSpeed = distance / Math.max(state.aliveTime, 0.1);
        state.avgSpeed = avgSpeed;
        const speedBonus = this.config.speedBonus || 0;
        const speedThreshold = 10;
        const speedMult = 1 + speedBonus * Math.max(0, avgSpeed - speedThreshold) / speedThreshold;

        // Base fitness: distance * speed
        let fitness = (distance * speedMult) / (1 + energy * weight);

        // Food bonus
        if (this.config.foodEnabled !== false) {
            fitness += body.foodScore * FOOD_WEIGHT;
        }

        // Combat bonuses
        if (this.config.combatEnabled !== false) {
            fitness += body.knockouts * KO_BONUS;
            fitness += body.damageDealt * DAMAGE_WEIGHT;
            fitness += (Math.max(0, body.health) / 100) * SURVIVAL_BONUS;
        }

        if (!Number.isFinite(fitness)) {fitness = 0;}
        state.fitness = fitness;
        state.distance = distance;
        state.energy = energy;
        body.frozen = true;
        body.setColor('rgba(100, 100, 100, 0.5)');
        body._muscleColor = 'rgba(100, 100, 100, 0.3)';
    }

    endGeneration() {
        this.state = 'BREEDING';

        // Compute stats
        const fitnesses = this.bodyStates.map(s => s.fitness);
        const genBest = Math.max(...fitnesses);
        const genAvg = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;

        this.history.push({
            gen: this.generation,
            best: Math.round(genBest),
            avg: Math.round(genAvg)
        });

        // Store replay data for best creature this generation
        const bestIdx = fitnesses.indexOf(genBest);
        this.lastGenBestReplay = {
            genome: cloneGenome(this.genomes[bestIdx]),
            fitness: this.bodyStates[bestIdx].fitness,
            generation: this.generation,
            spawnX: this.spawnX
        };

        // Add best to Hall of Fame
        this._addToHallOfFame(this.genomes[bestIdx], genBest, this.generation);

        // Capture enemy milestone at interval
        const params = this._getMilestoneParams();
        if (this.config.combatEnabled !== false &&
            this.generation > 0 &&
            this.generation % params.interval === 0 &&
            this.enemyMilestones.length < params.max) {
            this._captureMilestone(this.genomes[bestIdx], this.generation);
            // eslint-disable-next-line no-console
            console.log(`  Milestone captured at gen ${this.generation} (${this.enemyMilestones.length} total)`);
        }

        // Update all-time best + stagnation tracking
        if (genBest > this.bestFitness) {
            this.bestFitness = genBest;
            this.bestGenome = cloneGenome(this.genomes[bestIdx]);
            this.stagnationGen = 0;
        } else {
            this.stagnationGen++;
        }

        const stagnMsg = this.stagnationGen > 0 ? ` stag=${this.stagnationGen}` : '';
        const foodMsg = this.genFoodCollected > 0 ? ` food=${this.genFoodCollected}` : '';
        const koMsg = this.genKOs > 0 ? ` KOs=${this.genKOs}` : '';
        // eslint-disable-next-line no-console
        console.log(`Gen ${this.generation}: best=${Math.round(genBest)}px avg=${Math.round(genAvg)}px${stagnMsg}${foodMsg}${koMsg}`);

        // Auto-save
        this._autoSave();

        // Breed next generation
        this.breed();
    }

    breed() {
        const scored = this.genomes.map((genome, i) => ({
            genome,
            fitness: this.bodyStates[i].fitness
        }));

        const newGenomes = nextGeneration(scored, this.config.populationSize, this.rng, this.config.structuralMutationRate, this.stagnationGen);
        this.generation++;
        this.startGeneration(newGenomes);
    }

    getGenBestFitness() {
        if (this.bodyStates.length === 0) {return 0;}
        return Math.max(...this.bodyStates.map(s =>
            Math.max(0, s.maxX - s.startX)
        ));
    }

    getGenBestIndex() {
        if (this.bodyStates.length === 0) {return -1;}
        let bestIdx = 0;
        let bestFit = this.bodyStates[0].fitness;
        for (let i = 1; i < this.bodyStates.length; i++) {
            if (this.bodyStates[i].fitness > bestFit) {
                bestFit = this.bodyStates[i].fitness;
                bestIdx = i;
            }
        }
        return bestIdx;
    }

    getLeaderX() {
        return this.getLeaderCOM().x;
    }

    getLeaderCOM() {
        let maxX = 0;
        let leaderCOM = { x: 0, y: 0 };
        for (let i = 0; i < this.bodies.length; i++) {
            if (!this.bodyStates[i].finished) {
                const com = this.bodies[i].getCOM();
                if (com.x > maxX) {
                    maxX = com.x;
                    leaderCOM = com;
                }
            }
        }
        if (maxX === 0) {
            for (let i = 0; i < this.bodies.length; i++) {
                const com = this.bodies[i].getCOM();
                if (com.x > maxX) {
                    maxX = com.x;
                    leaderCOM = com;
                }
            }
        }
        return leaderCOM;
    }

    _autoSave() {
        saveState({
            config: this.config,
            generation: this.generation,
            genomes: this.genomes,
            bestGenome: this.bestGenome,
            bestFitness: this.bestFitness,
            history: this.history,
            rngState: this.rng.getState(),
            enemyMilestones: this.enemyMilestones
        });
    }
}
