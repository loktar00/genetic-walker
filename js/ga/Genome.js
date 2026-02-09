// Genome schema, random creation, clone, validate, serialize

import { assembleModularCreature } from './Modules.js';

export const LIMITS = {
    bodyWidth:  { min: 20, max: 200 },
    bodyHeight: { min: 20, max: 200 },
    pointRx:    { min: 0, max: 1 },
    pointRy:    { min: 0, max: 1 },
    stiffness:  { min: 0.5, max: 5 },
    extensionFactor:   { min: 0.05, max: 0.5 },
    contractionFactor: { min: 0.05, max: 0.5 },
    frequency:  { min: 0.2, max: 5.0 },
    phase:      { min: 0, max: Math.PI * 2 },
    strength:   { min: 0.005, max: 0.1 },
    pointMass:  { min: 0.5, max: 5.0 },
    minPoints:  3,
    maxPoints:  16,
    minConstraints: 2,
    minMuscles: 1
};

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

export function randomCreatureSize(rng) {
    const numPts = rng.int(LIMITS.minPoints, LIMITS.maxPoints);
    const numMus = rng.int(LIMITS.minMuscles, Math.max(2, numPts - 1));
    return { numPts, numMus };
}

export function createRandomGenome(rng, rawNumPoints, rawNumMuscles) {
    // 70% modular creatures, 30% legacy random (preserves exploration of novel topologies)
    if (rng.random() < 0.70) {
        return assembleModularCreature(rng);
    }

    const numPoints = Math.max(LIMITS.minPoints, rawNumPoints || 5);
    const numMuscles = Math.max(LIMITS.minMuscles, rawNumMuscles || 3);

    // Body shape variety: 25% tall/narrow, 25% wide/flat, 50% standard
    const shapeRoll = rng.random();
    let bodyWidth, bodyHeight;
    if (shapeRoll < 0.25) {
        // Tall/narrow — leggy potential
        bodyWidth = rng.range(30, 100);
        bodyHeight = rng.range(100, 200);
    } else if (shapeRoll < 0.50) {
        // Wide/flat — crawler potential
        bodyWidth = rng.range(120, 200);
        bodyHeight = rng.range(30, 80);
    } else {
        // Standard — slightly expanded range
        bodyWidth = rng.range(50, 180);
        bodyHeight = rng.range(40, 160);
    }

    // Regional point placement bias
    const placementRoll = rng.random();
    const points = [];

    if (placementRoll < 0.30) {
        // Bimodal vertical: 40% bottom cluster (ground contact), 60% upper (body mass)
        for (let i = 0; i < numPoints; i++) {
            const rx = rng.random();
            let ry;
            if (rng.random() < 0.4) {
                // Bottom 30% — ground contact region
                ry = 0.7 + rng.random() * 0.3;
            } else {
                // Upper 50% — body mass
                ry = rng.random() * 0.5;
            }
            // Heavy upper body (ry>0.5 = top half), light feet
            const mass = ry > 0.5 ? rng.range(1.5, 3.5) : rng.range(0.5, 1.5);
            points.push({ rx, ry, mass });
        }
    } else if (placementRoll < 0.50) {
        // Symmetric left-right: points in mirrored pairs
        for (let i = 0; i < numPoints; i += 2) {
            const rx = rng.range(0.5, 1.0);
            const ry = rng.random();
            const mass = ry > 0.5 ? rng.range(1.5, 3.5) : rng.range(0.5, 1.5);
            points.push({ rx, ry, mass });
            if (i + 1 < numPoints) {
                points.push({ rx: 1.0 - rx, ry, mass });
            }
        }
    } else {
        // Uniform random — existing behavior
        for (let i = 0; i < numPoints; i++) {
            const ry = rng.random();
            points.push({
                rx: rng.random(),
                ry,
                mass: ry > 0.5 ? rng.range(1.5, 3.5) : rng.range(0.5, 1.5)
            });
        }
    }

    // Chain constraints (ensure connectivity)
    const constraints = [];
    for (let i = 1; i < numPoints; i++) {
        constraints.push({
            a: i - 1,
            b: i,
            stiffness: rng.range(1, 3)
        });
    }

    // Add random cross-braces
    const numBraces = rng.int(1, Math.max(2, Math.floor(numPoints / 2)));
    for (let i = 0; i < numBraces; i++) {
        const a = rng.int(0, numPoints);
        let b = rng.int(0, numPoints);
        if (b === a) {b = (a + 1) % numPoints;}
        // Check not duplicate
        const exists = constraints.some(c =>
            (c.a === a && c.b === b) || (c.a === b && c.b === a)
        );
        if (!exists) {
            constraints.push({
                a, b,
                stiffness: rng.range(1, 3)
            });
        }
    }

    // Create muscles between random pairs
    const muscles = [];
    for (let i = 0; i < numMuscles; i++) {
        const a = rng.int(0, numPoints);
        let b = rng.int(0, numPoints);
        if (b === a) {b = (a + 1) % numPoints;}
        // Avoid duplicate muscles
        const exists = muscles.some(m =>
            (m.a === a && m.b === b) || (m.a === b && m.b === a)
        );
        if (!exists) {
            // Waveform: 60% sine, 25% sawtooth, 15% square
            const wRoll = rng.random();
            const waveform = wRoll < 0.60 ? 0 : wRoll < 0.85 ? 1 : 2;
            // Activation: 40% always, 40% grounded, 20% airborne
            const aRoll = rng.random();
            const activationMode = aRoll < 0.40 ? 0 : aRoll < 0.80 ? 1 : 2;
            muscles.push({
                a, b,
                extensionFactor: rng.range(0.1, 0.35),
                contractionFactor: rng.range(0.1, 0.35),
                frequency: rng.range(0.5, 3.0),
                phase: rng.range(0, Math.PI * 2),
                strength: rng.range(0.01, 0.05),
                waveform,
                activationMode
            });
        }
    }

    // Ensure at least 1 muscle
    if (muscles.length === 0) {
        muscles.push({
            a: 0, b: 1,
            extensionFactor: 0.3,
            contractionFactor: 0.3,
            frequency: 1.5,
            phase: 0,
            strength: 0.02,
            waveform: 0,
            activationMode: 0
        });
    }

    // Phase alternation for bottom muscles (30% chance)
    if (rng.random() < 0.30) {
        let idx = 0;
        for (const m of muscles) {
            const ptA = points[m.a];
            const ptB = points[m.b];
            if (ptA && ptB && (ptA.ry > 0.7 || ptB.ry > 0.7)) {
                m.phase = (m.phase + Math.PI * idx) % (Math.PI * 2);
                idx++;
            }
        }
    }

    return {
        version: 1,
        bodyWidth,
        bodyHeight,
        points,
        constraints,
        muscles
    };
}

export function cloneGenome(genome) {
    return JSON.parse(JSON.stringify(genome));
}

export function validateGenome(genome) {
    const L = LIMITS;

    genome.bodyWidth  = clamp(genome.bodyWidth,  L.bodyWidth.min,  L.bodyWidth.max);
    genome.bodyHeight = clamp(genome.bodyHeight, L.bodyHeight.min, L.bodyHeight.max);

    // Ensure minimum points
    while (genome.points.length < L.minPoints) {
        genome.points.push({ rx: 0.5, ry: 0.5, mass: 1.0 });
    }

    // Clamp point positions and mass
    for (const p of genome.points) {
        p.rx = clamp(p.rx, L.pointRx.min, L.pointRx.max);
        p.ry = clamp(p.ry, L.pointRy.min, L.pointRy.max);
        if (p.mass === undefined) p.mass = 1.0;
        p.mass = clamp(p.mass, L.pointMass.min, L.pointMass.max);
    }

    const numPts = genome.points.length;

    // Remove invalid constraint refs and clamp stiffness
    genome.constraints = genome.constraints.filter(c =>
        c.a >= 0 && c.a < numPts && c.b >= 0 && c.b < numPts && c.a !== c.b
    );
    for (const c of genome.constraints) {
        c.stiffness = clamp(c.stiffness, L.stiffness.min, L.stiffness.max);
    }

    // Ensure connectivity: at minimum a full chain (numPts - 1 constraints)
    const minCons = Math.max(L.minConstraints, numPts - 1);
    if (genome.constraints.length < minCons) {
        for (let i = 1; i < numPts && genome.constraints.length < minCons; i++) {
            const exists = genome.constraints.some(c =>
                (c.a === i - 1 && c.b === i) || (c.a === i && c.b === i - 1)
            );
            if (!exists) {
                genome.constraints.push({ a: i - 1, b: i, stiffness: 2 });
            }
        }
    }

    // Remove invalid muscle refs and clamp params
    genome.muscles = genome.muscles.filter(m =>
        m.a >= 0 && m.a < numPts && m.b >= 0 && m.b < numPts && m.a !== m.b
    );
    for (const m of genome.muscles) {
        m.extensionFactor   = clamp(m.extensionFactor,   L.extensionFactor.min,   L.extensionFactor.max);
        m.contractionFactor = clamp(m.contractionFactor, L.contractionFactor.min, L.contractionFactor.max);
        m.frequency         = clamp(m.frequency,         L.frequency.min,         L.frequency.max);
        m.phase             = ((m.phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        m.strength          = clamp(m.strength,          L.strength.min,          L.strength.max);
        // Default new genome fields for backward compatibility
        if (m.waveform === undefined) m.waveform = 0;
        m.waveform = clamp(Math.floor(m.waveform), 0, 2);
        if (m.activationMode === undefined) m.activationMode = 0;
        m.activationMode = clamp(Math.floor(m.activationMode), 0, 2);
    }

    // Ensure minimum muscles
    if (genome.muscles.length < L.minMuscles) {
        genome.muscles.push({
            a: 0, b: Math.min(1, numPts - 1),
            extensionFactor: 0.3, contractionFactor: 0.3,
            frequency: 1.5, phase: 0, strength: 0.02
        });
    }

    return genome;
}
