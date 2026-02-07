import { cloneGenome, createRandomGenome } from './Genome.js';
import { crossover } from './Crossover.js';
import { mutate } from './Mutation.js';

function tournamentSelect(scoredPop, rng, tournamentSize) {
    let best = null;
    for (let i = 0; i < tournamentSize; i++) {
        const idx = rng.int(0, scoredPop.length);
        const candidate = scoredPop[idx];
        if (!best || candidate.fitness > best.fitness) {
            best = candidate;
        }
    }
    return best;
}

/**
 * @param {Array<{genome, fitness}>} scoredPopulation
 * @param {number} populationSize
 * @param {object} rng
 * @param {number} structuralRate - structural mutation multiplier
 * @param {number} stagnationGen - how many generations without improvement (0 = not stagnating)
 * @returns {Array} new generation of genomes
 */
export function nextGeneration(scoredPopulation, populationSize, rng, structuralRate, stagnationGen) {
    // Sort by fitness descending
    const sorted = [...scoredPopulation].sort((a, b) => b.fitness - a.fitness);

    // Stagnation boost: ramp up mutation pressure when stuck
    let mutBoost = 1;
    if (stagnationGen >= 5) mutBoost = 2;
    if (stagnationGen >= 10) mutBoost = 3;
    const effectiveStructural = structuralRate * mutBoost;

    const newGenomes = [];

    // Elitism: #1 passes unchanged, #2 gets mutated (can break through barriers)
    if (sorted.length >= 1) {
        newGenomes.push(cloneGenome(sorted[0].genome));
    }
    if (sorted.length >= 2) {
        newGenomes.push(mutate(cloneGenome(sorted[1].genome), rng, effectiveStructural));
    }

    // Random immigrants: ~10% of population are fresh random genomes
    const numImmigrants = Math.max(1, Math.floor(populationSize * 0.1));
    // More immigrants when stagnating
    const extraImmigrants = stagnationGen >= 5 ? 1 : 0;
    const totalImmigrants = numImmigrants + extraImmigrants;

    for (let i = 0; i < totalImmigrants && newGenomes.length < populationSize; i++) {
        const numPts = rng.int(3, 10);
        const numMus = rng.int(1, Math.max(2, numPts - 1));
        newGenomes.push(createRandomGenome(rng, numPts, numMus));
    }

    // Fill remaining slots with crossover/mutation
    while (newGenomes.length < populationSize) {
        const parentA = tournamentSelect(sorted, rng, 3);

        // Select parentB, try to get a different one
        let parentB = parentA;
        for (let attempt = 0; attempt < 3; attempt++) {
            parentB = tournamentSelect(sorted, rng, 3);
            if (parentB !== parentA) break;
        }

        let child;
        if (parentB !== parentA) {
            child = crossover(
                parentA.genome, parentB.genome,
                parentA.fitness, parentB.fitness,
                rng, effectiveStructural
            );
        } else {
            child = mutate(cloneGenome(parentA.genome), rng, effectiveStructural);
        }

        newGenomes.push(child);
    }

    return newGenomes;
}
