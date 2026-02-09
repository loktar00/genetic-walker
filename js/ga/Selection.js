import { cloneGenome, createRandomGenome, randomCreatureSize } from './Genome.js';
import { crossover } from './Crossover.js';
import { mutate } from './Mutation.js';

function tournamentSelect(sorted, rng, tournamentSize) {
    // Pick tournamentSize random individuals, return the fittest
    let best = null;
    for (let i = 0; i < tournamentSize; i++) {
        const idx = rng.int(0, sorted.length);
        if (!best || sorted[idx].fitness > best.fitness) {
            best = sorted[idx];
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

    // Stagnation boost: gentle ramp for PARAMETRIC mutations only
    // Reaches 2x at gen 10, caps at 3x at gen 20
    const parametricBoost = 1 + Math.min(stagnationGen * 0.1, 2);

    // Structural mutation does NOT scale with stagnation — topology-breaking
    // mutations during stagnation destroy coordinated body plans
    const effectiveStructural = structuralRate;

    const newGenomes = [];

    // Extinction event: every 100 stagnation gens, keep top 3, replace rest
    if (stagnationGen > 0 && stagnationGen % 100 === 0) {
        const keepCount = Math.min(3, sorted.length);
        for (let i = 0; i < keepCount; i++) {
            newGenomes.push(cloneGenome(sorted[i].genome));
        }
        while (newGenomes.length < populationSize) {
            const { numPts, numMus } = randomCreatureSize(rng);
            newGenomes.push(createRandomGenome(rng, numPts, numMus));
        }
        return newGenomes;
    }

    // Elitism: preserve top 2 unchanged (was 1 — more stability)
    const eliteCount = Math.min(2, sorted.length);
    for (let i = 0; i < eliteCount; i++) {
        newGenomes.push(cloneGenome(sorted[i].genome));
    }

    // Lightly mutated elite variants: top 3 with gentle mutation (no structural)
    const variantCount = Math.min(2, populationSize - newGenomes.length);
    for (let i = 0; i < variantCount && newGenomes.length < populationSize; i++) {
        const eliteIdx = i % Math.min(3, sorted.length);
        // Light parametric-only mutation on elites (structural rate 0)
        newGenomes.push(mutate(cloneGenome(sorted[eliteIdx].genome), rng, 0, Math.min(parametricBoost, 1.5)));
    }

    // Random immigrants: ~10% base, up to ~20% during deep stagnation
    const baseImmigrants = Math.max(1, Math.floor(populationSize * 0.1));
    const stagnationImmigrants = Math.min(
        Math.floor(populationSize * 0.15),
        Math.floor(stagnationGen / 10)
    );
    const totalImmigrants = baseImmigrants + stagnationImmigrants;

    for (let i = 0; i < totalImmigrants && newGenomes.length < populationSize; i++) {
        const { numPts, numMus } = randomCreatureSize(rng);
        newGenomes.push(createRandomGenome(rng, numPts, numMus));
    }

    // --- Speciation by topology (point count) ---
    // Group population by point count
    const speciesMap = new Map();
    for (const ind of sorted) {
        const key = ind.genome.points.length;
        if (!speciesMap.has(key)) speciesMap.set(key, []);
        speciesMap.get(key).push(ind);
    }

    // Each species is already sorted by fitness (inherits from sorted)
    const speciesList = [...speciesMap.entries()]; // [[pointCount, members], ...]

    // Allocate breeding slots proportionally to each species' best fitness
    const remainingSlots = populationSize - newGenomes.length;
    const totalBest = speciesList.reduce((sum, [, members]) => sum + Math.max(members[0].fitness, 0.01), 0);
    const minSlots = speciesList.length * 2 <= remainingSlots ? 2 : 1;

    let rawAllocations = speciesList.map(([key, members]) => {
        const speciesBest = Math.max(members[0].fitness, 0.01);
        return {
            key,
            members,
            slots: Math.max(minSlots, Math.round((speciesBest / totalBest) * remainingSlots))
        };
    });

    // Adjust to match remainingSlots exactly
    let totalAllocated = rawAllocations.reduce((s, a) => s + a.slots, 0);
    while (totalAllocated > remainingSlots) {
        // Remove from the species with most excess slots
        rawAllocations.sort((a, b) => b.slots - a.slots);
        if (rawAllocations[0].slots > minSlots) {
            rawAllocations[0].slots--;
            totalAllocated--;
        } else break;
    }
    while (totalAllocated < remainingSlots) {
        // Add to species with best fitness
        rawAllocations[0].slots++;
        totalAllocated++;
    }

    // Breed within each species
    for (const { members, slots } of rawAllocations) {
        const tSize = Math.min(3, members.length);
        for (let s = 0; s < slots && newGenomes.length < populationSize; s++) {
            const parentA = tournamentSelect(members, rng, tSize);

            if (members.length >= 2) {
                let parentB = tournamentSelect(members, rng, tSize);
                if (parentB === parentA) parentB = tournamentSelect(members, rng, tSize);

                if (parentB !== parentA) {
                    newGenomes.push(crossover(
                        parentA.genome, parentB.genome,
                        parentA.fitness, parentB.fitness,
                        rng, effectiveStructural, parametricBoost
                    ));
                } else {
                    newGenomes.push(mutate(cloneGenome(parentA.genome), rng, effectiveStructural, parametricBoost));
                }
            } else {
                // Single-member species: mutation only
                newGenomes.push(mutate(cloneGenome(parentA.genome), rng, effectiveStructural, parametricBoost));
            }
        }
    }

    return newGenomes;
}
