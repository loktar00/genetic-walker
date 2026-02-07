import { cloneGenome, validateGenome, LIMITS } from './Genome.js';

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function wrapPhase(val) {
    return ((val % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

export function mutate(genome, rng, structuralRate) {
    structuralRate = structuralRate || 1;
    const g = cloneGenome(genome);
    const L = LIMITS;

    // --- Parametric mutations ---

    // Body dimensions
    if (rng.random() < 0.15) {
        g.bodyWidth = clamp(g.bodyWidth + rng.range(-20, 20), L.bodyWidth.min, L.bodyWidth.max);
    }
    if (rng.random() < 0.15) {
        g.bodyHeight = clamp(g.bodyHeight + rng.range(-20, 20), L.bodyHeight.min, L.bodyHeight.max);
    }

    // Point positions
    for (const p of g.points) {
        if (rng.random() < 0.20) {
            p.rx = clamp(p.rx + rng.range(-0.15, 0.15), L.pointRx.min, L.pointRx.max);
        }
        if (rng.random() < 0.20) {
            p.ry = clamp(p.ry + rng.range(-0.15, 0.15), L.pointRy.min, L.pointRy.max);
        }
    }

    // Constraint stiffness
    for (const c of g.constraints) {
        if (rng.random() < 0.15) {
            c.stiffness = clamp(c.stiffness + rng.range(-0.5, 0.5), L.stiffness.min, L.stiffness.max);
        }
    }

    // Muscle parameters
    for (const m of g.muscles) {
        if (rng.random() < 0.20) {
            m.extensionFactor = clamp(m.extensionFactor + rng.range(-0.1, 0.1), L.extensionFactor.min, L.extensionFactor.max);
        }
        if (rng.random() < 0.20) {
            m.contractionFactor = clamp(m.contractionFactor + rng.range(-0.1, 0.1), L.contractionFactor.min, L.contractionFactor.max);
        }
        if (rng.random() < 0.20) {
            m.frequency = clamp(m.frequency + rng.range(-0.3, 0.3), L.frequency.min, L.frequency.max);
        }
        if (rng.random() < 0.25) {
            m.phase = wrapPhase(m.phase + rng.range(-0.5, 0.5));
        }
        if (rng.random() < 0.15) {
            m.strength = clamp(m.strength + rng.range(-0.01, 0.01), L.strength.min, L.strength.max);
        }
    }

    // --- Structural mutations (scaled by structuralRate) ---

    const numPts = g.points.length;

    // Add point
    if (rng.random() < 0.05 * structuralRate) {
        const newIdx = g.points.length;
        g.points.push({ rx: rng.random(), ry: rng.random() });
        // Connect to a random existing point
        const target = rng.int(0, newIdx);
        g.constraints.push({ a: newIdx, b: target, stiffness: rng.range(1, 3) });
    }

    // Remove point (only if > minPoints)
    if (rng.random() < 0.03 * structuralRate && g.points.length > L.minPoints) {
        const removeIdx = rng.int(0, g.points.length);
        g.points.splice(removeIdx, 1);
        // Re-index constraints
        g.constraints = g.constraints
            .filter(c => c.a !== removeIdx && c.b !== removeIdx)
            .map(c => ({
                ...c,
                a: c.a > removeIdx ? c.a - 1 : c.a,
                b: c.b > removeIdx ? c.b - 1 : c.b
            }));
        // Re-index muscles
        g.muscles = g.muscles
            .filter(m => m.a !== removeIdx && m.b !== removeIdx)
            .map(m => ({
                ...m,
                a: m.a > removeIdx ? m.a - 1 : m.a,
                b: m.b > removeIdx ? m.b - 1 : m.b
            }));
    }

    // Add constraint
    if (rng.random() < 0.05 * structuralRate && g.points.length >= 2) {
        const a = rng.int(0, g.points.length);
        let b = rng.int(0, g.points.length);
        if (b === a) b = (a + 1) % g.points.length;
        const exists = g.constraints.some(c =>
            (c.a === a && c.b === b) || (c.a === b && c.b === a)
        );
        if (!exists) {
            g.constraints.push({ a, b, stiffness: rng.range(1, 3) });
        }
    }

    // Remove constraint (check doesn't orphan a point)
    if (rng.random() < 0.03 * structuralRate && g.constraints.length > L.minConstraints) {
        const idx = rng.int(0, g.constraints.length);
        const candidate = g.constraints[idx];
        // Check both points still have at least one other constraint
        const aOther = g.constraints.some((c, i) =>
            i !== idx && (c.a === candidate.a || c.b === candidate.a)
        );
        const bOther = g.constraints.some((c, i) =>
            i !== idx && (c.a === candidate.b || c.b === candidate.b)
        );
        if (aOther && bOther) {
            g.constraints.splice(idx, 1);
        }
    }

    // Add muscle
    if (rng.random() < 0.05 * structuralRate && g.points.length >= 2) {
        const a = rng.int(0, g.points.length);
        let b = rng.int(0, g.points.length);
        if (b === a) b = (a + 1) % g.points.length;
        const exists = g.muscles.some(m =>
            (m.a === a && m.b === b) || (m.a === b && m.b === a)
        );
        if (!exists) {
            g.muscles.push({
                a, b,
                extensionFactor: rng.range(0.1, 0.5),
                contractionFactor: rng.range(0.1, 0.5),
                frequency: rng.range(0.5, 3.0),
                phase: rng.range(0, Math.PI * 2),
                strength: rng.range(0.01, 0.05)
            });
        }
    }

    // Remove muscle (only if > minMuscles)
    if (rng.random() < 0.03 * structuralRate && g.muscles.length > L.minMuscles) {
        const idx = rng.int(0, g.muscles.length);
        g.muscles.splice(idx, 1);
    }

    return validateGenome(g);
}
