// Genome schema, random creation, clone, validate, serialize

export const LIMITS = {
    bodyWidth:  { min: 20, max: 300 },
    bodyHeight: { min: 20, max: 300 },
    pointRx:    { min: 0, max: 1 },
    pointRy:    { min: 0, max: 1 },
    stiffness:  { min: 0.5, max: 5 },
    extensionFactor:   { min: 0.05, max: 0.8 },
    contractionFactor: { min: 0.05, max: 0.8 },
    frequency:  { min: 0.2, max: 5.0 },
    phase:      { min: 0, max: Math.PI * 2 },
    strength:   { min: 0.005, max: 0.1 },
    minPoints:  3,
    minConstraints: 2,
    minMuscles: 1
};

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

export function createRandomGenome(rng, numPoints, numMuscles) {
    numPoints = Math.max(LIMITS.minPoints, numPoints || 5);
    numMuscles = Math.max(LIMITS.minMuscles, numMuscles || 3);

    const bodyWidth = rng.range(60, 200);
    const bodyHeight = rng.range(40, 150);

    // Create points with relative positions
    const points = [];
    for (let i = 0; i < numPoints; i++) {
        points.push({
            rx: rng.random(),
            ry: rng.random()
        });
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
        if (b === a) b = (a + 1) % numPoints;
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
        if (b === a) b = (a + 1) % numPoints;
        // Avoid duplicate muscles
        const exists = muscles.some(m =>
            (m.a === a && m.b === b) || (m.a === b && m.b === a)
        );
        if (!exists) {
            muscles.push({
                a, b,
                extensionFactor: rng.range(0.1, 0.5),
                contractionFactor: rng.range(0.1, 0.5),
                frequency: rng.range(0.5, 3.0),
                phase: rng.range(0, Math.PI * 2),
                strength: rng.range(0.01, 0.05)
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
            strength: 0.02
        });
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
        genome.points.push({ rx: 0.5, ry: 0.5 });
    }

    // Clamp point positions
    for (const p of genome.points) {
        p.rx = clamp(p.rx, L.pointRx.min, L.pointRx.max);
        p.ry = clamp(p.ry, L.pointRy.min, L.pointRy.max);
    }

    const numPts = genome.points.length;

    // Remove invalid constraint refs and clamp stiffness
    genome.constraints = genome.constraints.filter(c =>
        c.a >= 0 && c.a < numPts && c.b >= 0 && c.b < numPts && c.a !== c.b
    );
    for (const c of genome.constraints) {
        c.stiffness = clamp(c.stiffness, L.stiffness.min, L.stiffness.max);
    }

    // Ensure connectivity: at minimum a chain
    if (genome.constraints.length < L.minConstraints) {
        for (let i = 1; i < numPts && genome.constraints.length < L.minConstraints; i++) {
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
