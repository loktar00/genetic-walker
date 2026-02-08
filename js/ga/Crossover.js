import { cloneGenome } from './Genome.js';
import { mutate } from './Mutation.js';

function lerp(a, b, t) {
    return a + (b - a) * t;
}

// Circular interpolation for phase values (shortest arc)
function circularLerp(a, b, t) {
    const TAU = Math.PI * 2;
    let diff = ((b - a) % TAU + TAU) % TAU;
    if (diff > Math.PI) {diff -= TAU;}
    return ((a + diff * t) % TAU + TAU) % TAU;
}

export function crossover(parentA, parentB, fitA, fitB, rng, structuralRate) {
    // Topology from fitter parent, parameters blended
    const fitter = fitA >= fitB ? parentA : parentB;
    const other  = fitA >= fitB ? parentB : parentA;

    const child = cloneGenome(fitter);

    // Blend body dimensions
    const t = rng.range(0.2, 0.8);
    child.bodyWidth  = lerp(parentA.bodyWidth,  parentB.bodyWidth,  t);
    child.bodyHeight = lerp(parentA.bodyHeight, parentB.bodyHeight, t);

    // Blend overlapping point positions
    const overlapPts = Math.min(child.points.length, other.points.length);
    for (let i = 0; i < overlapPts; i++) {
        const pt = rng.range(0.2, 0.8);
        child.points[i].rx = lerp(child.points[i].rx, other.points[i].rx, pt);
        child.points[i].ry = lerp(child.points[i].ry, other.points[i].ry, pt);
    }

    // Blend overlapping constraint stiffness
    const overlapCon = Math.min(child.constraints.length, other.constraints.length);
    for (let i = 0; i < overlapCon; i++) {
        const ct = rng.range(0.2, 0.8);
        child.constraints[i].stiffness = lerp(
            child.constraints[i].stiffness,
            other.constraints[i].stiffness,
            ct
        );
    }

    // Blend overlapping muscle parameters
    const overlapMus = Math.min(child.muscles.length, other.muscles.length);
    for (let i = 0; i < overlapMus; i++) {
        const mt = rng.range(0.2, 0.8);
        const cm = child.muscles[i];
        const om = other.muscles[i];
        cm.extensionFactor   = lerp(cm.extensionFactor,   om.extensionFactor,   mt);
        cm.contractionFactor = lerp(cm.contractionFactor, om.contractionFactor, mt);
        cm.frequency         = lerp(cm.frequency,         om.frequency,         mt);
        cm.phase             = circularLerp(cm.phase,     om.phase,             mt);
        cm.strength          = lerp(cm.strength,          om.strength,          mt);
    }

    // Apply mutation to child
    return mutate(child, rng, structuralRate);
}
