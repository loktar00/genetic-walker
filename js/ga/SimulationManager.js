import { createRNG } from '../utils/random.js';
import { createRandomGenome, cloneGenome } from './Genome.js';
import { nextGeneration } from './Selection.js';
import VerletBody from '../verlet/Verlet.js';
import { saveState } from '../ui/Persistence.js';

export default class SimulationManager {
    constructor(config) {
        this.config = config;
        this.generation = 0;
        this.genomes = [];
        this.bodies = [];
        this.bodyStates = [];
        this.elapsedTime = 0;
        this.rng = createRNG(config.terrainSeed);
        this.history = [];
        this.bestGenome = null;
        this.bestFitness = 0;
        this.stagnationGen = 0;  // generations since last improvement
        this.state = 'IDLE'; // IDLE, RUNNING, BREEDING
        this.spawnX = 100;
    }

    initNewPopulation() {
        this.genomes = [];
        for (let i = 0; i < this.config.populationSize; i++) {
            this.genomes.push(
                createRandomGenome(this.rng, this.config.startingPoints, this.config.startingMuscles)
            );
        }
        this.startGeneration(this.genomes);
    }

    resumeFromState(savedState) {
        this.generation = savedState.generation;
        this.genomes = savedState.genomes;
        this.bestGenome = savedState.bestGenome;
        this.bestFitness = savedState.bestFitness;
        this.history = savedState.history || [];
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

        for (let i = 0; i < genomes.length; i++) {
            const hue = (i / genomes.length) * 360;
            const color = `hsl(${hue}, 80%, 60%)`;
            const body = new VerletBody(genomes[i], this.spawnX, undefined, color);
            body._muscleColor = `hsl(${hue}, 80%, 40%)`;
            this.bodies.push(body);

            const com = body.getCOM();
            this.bodyStates.push({
                startX: com.x,
                maxX: com.x,
                currentX: com.x,
                lastProgressTime: 0,
                stallCountdown: null,
                finished: false,
                fitness: 0
            });
        }
    }

    update(dt) {
        if (this.state !== 'RUNNING') {return;}

        this.elapsedTime += dt;

        for (let i = 0; i < this.bodies.length; i++) {
            const body = this.bodies[i];
            const state = this.bodyStates[i];

            if (state.finished) {
                // eslint-disable-next-line no-continue
                continue;
            }

            body.update(dt);

            // Track progress
            const com = body.getCOM();
            state.currentX = com.x;

            if (state.currentX > state.maxX + 1) {
                state.maxX = state.currentX;
                state.lastProgressTime = this.elapsedTime;
                state.stallCountdown = null;
            }

            // Backward movement detection: if creature falls far behind its best
            const backwardThreshold = this.config.backwardThreshold || 0;
            const movedBackward = backwardThreshold > 0 &&
                state.currentX < state.maxX - backwardThreshold;

            // Stall detection: no forward progress for stallTimeout seconds
            const timeSinceProgress = this.elapsedTime - state.lastProgressTime;
            const isStalled = timeSinceProgress > this.config.stallTimeout;

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

        // Check if eval time exceeded (only in timed mode)
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

    _finishCreature(index) {
        const state = this.bodyStates[index];
        const body = this.bodies[index];
        state.finished = true;
        state.fitness = Math.max(0, state.maxX - state.startX);
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

        // Update all-time best + stagnation tracking
        const bestIdx = fitnesses.indexOf(genBest);
        if (genBest > this.bestFitness) {
            this.bestFitness = genBest;
            this.bestGenome = cloneGenome(this.genomes[bestIdx]);
            this.stagnationGen = 0;
        } else {
            this.stagnationGen++;
        }

        const stagnMsg = this.stagnationGen > 0 ? ` stag=${this.stagnationGen}` : '';
        // eslint-disable-next-line no-console
        console.log(`Gen ${this.generation}: best=${Math.round(genBest)}px avg=${Math.round(genAvg)}px${stagnMsg}`);

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

    getLeaderX() {
        let maxX = 0;
        for (let i = 0; i < this.bodies.length; i++) {
            if (!this.bodyStates[i].finished) {
                const com = this.bodies[i].getCOM();
                if (com.x > maxX) {maxX = com.x;}
            }
        }
        // If all finished, use the best one
        if (maxX === 0) {
            for (let i = 0; i < this.bodies.length; i++) {
                const com = this.bodies[i].getCOM();
                if (com.x > maxX) {maxX = com.x;}
            }
        }
        return maxX;
    }

    _autoSave() {
        saveState({
            config: this.config,
            generation: this.generation,
            genomes: this.genomes,
            bestGenome: this.bestGenome,
            bestFitness: this.bestFitness,
            history: this.history,
            rngState: this.rng.getState()
        });
    }
}
