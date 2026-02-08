import { cloneGenome, validateGenome, LIMITS } from './Genome.js';

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function wrapPhase(val) {
    return ((val % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

export function mutate(genome, rng, rawStructuralRate, parametricBoost) {
    const structuralRate = rawStructuralRate || 1;
    const pb = Math.max(1, parametricBoost || 1);
    // Probability caps at 3x (avoid guaranteed mutation on every gene)
    const probScale = Math.min(pb, 3);
    // Magnitude scales with sqrt (gentler — avoids destroying good solutions)
    const magScale = Math.sqrt(pb);
    const g = cloneGenome(genome);
    const L = LIMITS;

    // --- Parametric mutations (scaled by stagnation boost) ---

    // Body dimensions
    if (rng.random() < 0.15 * probScale) {
        g.bodyWidth = clamp(g.bodyWidth + rng.range(-20 * magScale, 20 * magScale), L.bodyWidth.min, L.bodyWidth.max);
    }
    if (rng.random() < 0.15 * probScale) {
        g.bodyHeight = clamp(g.bodyHeight + rng.range(-20 * magScale, 20 * magScale), L.bodyHeight.min, L.bodyHeight.max);
    }

    // Point positions
    for (const p of g.points) {
        if (rng.random() < 0.20 * probScale) {
            p.rx = clamp(p.rx + rng.range(-0.15 * magScale, 0.15 * magScale), L.pointRx.min, L.pointRx.max);
        }
        if (rng.random() < 0.20 * probScale) {
            p.ry = clamp(p.ry + rng.range(-0.15 * magScale, 0.15 * magScale), L.pointRy.min, L.pointRy.max);
        }
    }

    // Constraint stiffness
    for (const c of g.constraints) {
        if (rng.random() < 0.15 * probScale) {
            c.stiffness = clamp(c.stiffness + rng.range(-0.5 * magScale, 0.5 * magScale), L.stiffness.min, L.stiffness.max);
        }
    }

    // Muscle parameters
    for (const m of g.muscles) {
        if (rng.random() < 0.20 * probScale) {
            m.extensionFactor = clamp(m.extensionFactor + rng.range(-0.1 * magScale, 0.1 * magScale), L.extensionFactor.min, L.extensionFactor.max);
        }
        if (rng.random() < 0.20 * probScale) {
            m.contractionFactor = clamp(m.contractionFactor + rng.range(-0.1 * magScale, 0.1 * magScale), L.contractionFactor.min, L.contractionFactor.max);
        }
        if (rng.random() < 0.20 * probScale) {
            m.frequency = clamp(m.frequency + rng.range(-0.3 * magScale, 0.3 * magScale), L.frequency.min, L.frequency.max);
        }
        if (rng.random() < 0.25 * probScale) {
            m.phase = wrapPhase(m.phase + rng.range(-0.5 * magScale, 0.5 * magScale));
        }
        if (rng.random() < 0.15 * probScale) {
            m.strength = clamp(m.strength + rng.range(-0.01 * magScale, 0.01 * magScale), L.strength.min, L.strength.max);
        }
    }

    // --- Structural mutations (scaled by structuralRate) ---

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
        if (b === a) {b = (a + 1) % g.points.length;}
        const exists = g.constraints.some(c =>
            (c.a === a && c.b === b) || (c.a === b && c.b === a)
        );
        if (!exists) {
            g.constraints.push({ a, b, stiffness: rng.range(1, 3) });
        }
    }

    // Remove constraint (check doesn't orphan a point)
    if (rng.random() < 0.03 * structuralRate && g.constraints.length > Math.max(L.minConstraints, g.points.length - 1)) {
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
        if (b === a) {b = (a + 1) % g.points.length;}
        const exists = g.muscles.some(m =>
            (m.a === a && m.b === b) || (m.a === b && m.b === a)
        );
        if (!exists) {
            g.muscles.push({
                a, b,
                extensionFactor: rng.range(0.1, 0.35),
                contractionFactor: rng.range(0.1, 0.35),
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
