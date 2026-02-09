// Modular body building blocks for creature creation
// Modules are a creation-time concept only — they generate standard flat genomes.
// After creation, crossover and mutation work on the flat genome unchanged.

const TWO_PI = Math.PI * 2;

// --- Module generators ---
// Each returns a fragment: { points, constraints, muscles, attach, width, height }
// Points use normalized 0-1 positions within module local space.
// Constraints/muscles use local point indices.

function legPair(rng) {
    // Hip bar + 2 dangling feet with alternating-phase muscles
    const hipWidth = rng.range(0.4, 0.9);
    const legLen = rng.range(0.5, 0.9);
    const freq = rng.range(0.8, 2.5);
    const phase = rng.range(0, TWO_PI);

    const points = [
        { rx: 0.5 - hipWidth / 2, ry: 0.0, mass: 2.0 },   // 0: left hip
        { rx: 0.5 + hipWidth / 2, ry: 0.0, mass: 2.0 },   // 1: right hip
        { rx: 0.5 - hipWidth / 2, ry: legLen, mass: 0.7 },  // 2: left foot
        { rx: 0.5 + hipWidth / 2, ry: legLen, mass: 0.7 },  // 3: right foot
    ];

    const constraints = [
        { a: 0, b: 1, stiffness: rng.range(2.0, 4.0) },  // hip bar
        { a: 0, b: 2, stiffness: rng.range(1.0, 2.5) },  // left leg
        { a: 1, b: 3, stiffness: rng.range(1.0, 2.5) },  // right leg
        { a: 0, b: 3, stiffness: rng.range(1.0, 2.0) },  // cross-brace
    ];

    const muscles = [
        {
            a: 0, b: 2,
            extensionFactor: rng.range(0.1, 0.35),
            contractionFactor: rng.range(0.1, 0.35),
            frequency: freq,
            phase: phase,
            strength: rng.range(0.02, 0.06),
            waveform: 0,
            activationMode: 0,
        },
        {
            a: 1, b: 3,
            extensionFactor: rng.range(0.1, 0.35),
            contractionFactor: rng.range(0.1, 0.35),
            frequency: freq,
            phase: (phase + Math.PI) % TWO_PI, // alternating
            strength: rng.range(0.02, 0.06),
            waveform: 0,
            activationMode: 0,
        },
    ];

    return {
        points, constraints, muscles,
        attach: {
            top: [0, 1],
            bottom: [2, 3],
            left: [0, 2],
            right: [1, 3],
        },
        width: 1.0,
        height: 1.0,
    };
}

function segment(rng) {
    // Horizontal chain of 2-3 points with muscle between endpoints
    const count = rng.int(2, 4); // 2 or 3
    const points = [];
    for (let i = 0; i < count; i++) {
        points.push({ rx: i / Math.max(1, count - 1), ry: 0.5, mass: 1.0 });
    }

    const constraints = [];
    for (let i = 1; i < count; i++) {
        constraints.push({ a: i - 1, b: i, stiffness: rng.range(1.5, 3.5) });
    }

    const muscles = [{
        a: 0, b: count - 1,
        extensionFactor: rng.range(0.1, 0.4),
        contractionFactor: rng.range(0.1, 0.4),
        frequency: rng.range(0.5, 2.5),
        phase: rng.range(0, TWO_PI),
        strength: rng.range(0.02, 0.05),
        waveform: 0,
        activationMode: 0,
    }];

    return {
        points, constraints, muscles,
        attach: {
            top: [0, count - 1],
            bottom: [0, count - 1],
            left: [0],
            right: [count - 1],
        },
        width: 1.0,
        height: 0.3,
    };
}

function hub(rng) {
    // Central point with 2-4 radial spokes, muscles between adjacent spokes
    const spokeCount = rng.int(2, 5); // 2-4
    const points = [{ rx: 0.5, ry: 0.5, mass: 3.0 }]; // center
    const constraints = [];
    const muscles = [];

    for (let i = 0; i < spokeCount; i++) {
        const angle = (i / spokeCount) * TWO_PI + rng.range(-0.3, 0.3);
        const radius = rng.range(0.3, 0.5);
        points.push({
            rx: 0.5 + Math.cos(angle) * radius,
            ry: 0.5 + Math.sin(angle) * radius,
            mass: 0.8,
        });
        constraints.push({ a: 0, b: i + 1, stiffness: rng.range(1.5, 3.0) });
    }

    // Muscles between adjacent spokes
    const freq = rng.range(0.5, 2.5);
    for (let i = 0; i < spokeCount; i++) {
        const next = (i + 1) % spokeCount;
        muscles.push({
            a: i + 1, b: next + 1,
            extensionFactor: rng.range(0.1, 0.35),
            contractionFactor: rng.range(0.1, 0.35),
            frequency: freq,
            phase: (i / spokeCount) * TWO_PI,
            strength: rng.range(0.02, 0.05),
            waveform: 0,
            activationMode: 0,
        });
    }

    // All outer points are attachment candidates
    const outerIndices = [];
    for (let i = 1; i <= spokeCount; i++) outerIndices.push(i);

    return {
        points, constraints, muscles,
        attach: {
            top: outerIndices.filter(i => points[i].ry < 0.5),
            bottom: outerIndices.filter(i => points[i].ry >= 0.5),
            left: outerIndices.filter(i => points[i].rx < 0.5),
            right: outerIndices.filter(i => points[i].rx >= 0.5),
        },
        width: 1.0,
        height: 1.0,
    };
}

function triangle(rng) {
    // Rigid triangle with 3 constraints and 1 muscle on base
    const spread = rng.range(0.3, 0.8);
    const apex = rng.range(0.1, 0.4);

    const points = [
        { rx: 0.5 - spread / 2, ry: 1.0, mass: 0.8 },  // 0: bottom-left
        { rx: 0.5 + spread / 2, ry: 1.0, mass: 0.8 },  // 1: bottom-right
        { rx: 0.5, ry: apex, mass: 2.0 },               // 2: apex
    ];

    const constraints = [
        { a: 0, b: 1, stiffness: rng.range(2.0, 4.0) },  // base
        { a: 0, b: 2, stiffness: rng.range(2.0, 4.0) },  // left side
        { a: 1, b: 2, stiffness: rng.range(2.0, 4.0) },  // right side
    ];

    const muscles = [{
        a: 0, b: 1,
        extensionFactor: rng.range(0.05, 0.25),
        contractionFactor: rng.range(0.05, 0.25),
        frequency: rng.range(0.5, 2.0),
        phase: rng.range(0, TWO_PI),
        strength: rng.range(0.02, 0.05),
        waveform: 0,
        activationMode: 0,
    }];

    return {
        points, constraints, muscles,
        attach: {
            top: [2],
            bottom: [0, 1],
            left: [0, 2],
            right: [1, 2],
        },
        width: 1.0,
        height: 1.0,
    };
}

function quadBox(rng) {
    // Rectangle + diagonals, muscles on opposite edges for rocking/crawling
    const w = rng.range(0.5, 0.9);
    const h = rng.range(0.4, 0.8);
    const cx = 0.5, cy = 0.5;

    const points = [
        { rx: cx - w / 2, ry: cy - h / 2, mass: 1.5 },  // 0: top-left
        { rx: cx + w / 2, ry: cy - h / 2, mass: 1.5 },  // 1: top-right
        { rx: cx + w / 2, ry: cy + h / 2, mass: 1.5 },  // 2: bottom-right
        { rx: cx - w / 2, ry: cy + h / 2, mass: 1.5 },  // 3: bottom-left
    ];

    const constraints = [
        { a: 0, b: 1, stiffness: rng.range(2.0, 3.5) },  // top
        { a: 1, b: 2, stiffness: rng.range(2.0, 3.5) },  // right
        { a: 2, b: 3, stiffness: rng.range(2.0, 3.5) },  // bottom
        { a: 3, b: 0, stiffness: rng.range(2.0, 3.5) },  // left
        { a: 0, b: 2, stiffness: rng.range(1.5, 2.5) },  // diagonal
        { a: 1, b: 3, stiffness: rng.range(1.5, 2.5) },  // diagonal
    ];

    const freq = rng.range(0.5, 2.0);
    const phase = rng.range(0, TWO_PI);
    const muscles = [
        {
            a: 0, b: 1,  // top edge
            extensionFactor: rng.range(0.1, 0.3),
            contractionFactor: rng.range(0.1, 0.3),
            frequency: freq,
            phase: phase,
            strength: rng.range(0.02, 0.05),
            waveform: 0,
            activationMode: 0,
        },
        {
            a: 2, b: 3,  // bottom edge
            extensionFactor: rng.range(0.1, 0.3),
            contractionFactor: rng.range(0.1, 0.3),
            frequency: freq,
            phase: (phase + Math.PI) % TWO_PI, // opposite phase
            strength: rng.range(0.02, 0.05),
            waveform: 0,
            activationMode: 0,
        },
    ];

    return {
        points, constraints, muscles,
        attach: {
            top: [0, 1],
            bottom: [2, 3],
            left: [0, 3],
            right: [1, 2],
        },
        width: 1.0,
        height: 1.0,
    };
}

function tail(rng) {
    // Vertical/diagonal chain of 2-3 points, high-frequency muscles
    const count = rng.int(2, 4); // 2 or 3
    const angle = rng.range(-0.3, 0.3); // slight diagonal
    const points = [];
    for (let i = 0; i < count; i++) {
        const t = i / Math.max(1, count - 1);
        // Base heavy (1.5), tip light (0.5), lerp between
        const mass = 1.5 - t * 1.0;
        points.push({
            rx: 0.5 + angle * t,
            ry: t,
            mass,
        });
    }

    const constraints = [];
    for (let i = 1; i < count; i++) {
        constraints.push({ a: i - 1, b: i, stiffness: rng.range(1.0, 2.0) });
    }

    const muscles = [{
        a: 0, b: count - 1,
        extensionFactor: rng.range(0.15, 0.4),
        contractionFactor: rng.range(0.15, 0.4),
        frequency: rng.range(1.5, 4.0), // high frequency
        phase: rng.range(0, TWO_PI),
        strength: rng.range(0.02, 0.06),
        waveform: 0,
        activationMode: 0,
    }];

    return {
        points, constraints, muscles,
        attach: {
            top: [0],
            bottom: [count - 1],
            left: [0],
            right: [0],
        },
        width: 0.3,
        height: 1.0,
    };
}

function wheel(rng) {
    // Points in a circle with sequential-phase muscles on all edges
    const count = rng.int(4, 6); // 4 or 5
    const radius = 0.4;
    const points = [];
    const constraints = [];
    const muscles = [];

    for (let i = 0; i < count; i++) {
        const angle = (i / count) * TWO_PI;
        points.push({
            rx: 0.5 + Math.cos(angle) * radius,
            ry: 0.5 + Math.sin(angle) * radius,
            mass: 1.0,
        });
    }

    // Sequential edge constraints and muscles
    const freq = rng.range(0.5, 2.0);
    for (let i = 0; i < count; i++) {
        const next = (i + 1) % count;
        constraints.push({ a: i, b: next, stiffness: rng.range(1.5, 3.0) });
        muscles.push({
            a: i, b: next,
            extensionFactor: rng.range(0.1, 0.3),
            contractionFactor: rng.range(0.1, 0.3),
            frequency: freq,
            phase: (i / count) * TWO_PI, // sequential phase offset
            strength: rng.range(0.02, 0.05),
            waveform: 0,
            activationMode: 0,
        });
    }

    // Cross-brace constraints for structure
    for (let i = 0; i < Math.floor(count / 2); i++) {
        constraints.push({ a: i, b: (i + Math.floor(count / 2)) % count, stiffness: rng.range(1.0, 2.0) });
    }

    const allIndices = [];
    for (let i = 0; i < count; i++) allIndices.push(i);

    return {
        points, constraints, muscles,
        attach: {
            top: allIndices.filter(i => points[i].ry < 0.5),
            bottom: allIndices.filter(i => points[i].ry >= 0.5),
            left: allIndices.filter(i => points[i].rx < 0.5),
            right: allIndices.filter(i => points[i].rx >= 0.5),
        },
        width: 1.0,
        height: 1.0,
    };
}

const MODULE_GENERATORS = [legPair, segment, hub, triangle, quadBox, tail, wheel];

// --- Assembly ---

function pickAttachPoints(attachList, count) {
    // Return up to count indices from an attachment list, cycling if needed
    if (attachList.length === 0) return [];
    const result = [];
    for (let i = 0; i < count; i++) {
        result.push(attachList[i % attachList.length]);
    }
    return result;
}

function mergeFragment(genome, fragment, offsetX, offsetY, scaleX, scaleY, indexOffset) {
    // Add fragment points with position mapping into global space
    const pointMap = {};
    for (let i = 0; i < fragment.points.length; i++) {
        const p = fragment.points[i];
        const globalIdx = genome.points.length;
        pointMap[i] = globalIdx;
        genome.points.push({
            rx: clampUnit(offsetX + p.rx * scaleX),
            ry: clampUnit(offsetY + p.ry * scaleY),
            mass: p.mass || 1.0,
        });
    }

    // Add constraints with remapped indices
    for (const c of fragment.constraints) {
        genome.constraints.push({
            a: pointMap[c.a],
            b: pointMap[c.b],
            stiffness: c.stiffness,
        });
    }

    // Add muscles with remapped indices
    for (const m of fragment.muscles) {
        genome.muscles.push({
            a: pointMap[m.a],
            b: pointMap[m.b],
            extensionFactor: m.extensionFactor,
            contractionFactor: m.contractionFactor,
            frequency: m.frequency,
            phase: m.phase,
            strength: m.strength,
            waveform: m.waveform || 0,
            activationMode: m.activationMode || 0,
        });
    }

    // Return remapped attachment indices
    const remappedAttach = {};
    for (const side of ['top', 'bottom', 'left', 'right']) {
        remappedAttach[side] = (fragment.attach[side] || []).map(i => pointMap[i]);
    }

    return remappedAttach;
}

function clampUnit(v) {
    return Math.max(0, Math.min(1, v));
}

function addBridgeConstraints(genome, attachA, attachB, rng) {
    // Connect attachment points between two modules
    const countA = attachA.length;
    const countB = attachB.length;
    if (countA === 0 || countB === 0) return;

    const bridgeCount = Math.min(countA, countB, 3);
    for (let i = 0; i < bridgeCount; i++) {
        const a = attachA[i % countA];
        const b = attachB[i % countB];
        if (a === undefined || b === undefined || a === b) continue;
        genome.constraints.push({
            a, b,
            stiffness: rng.range(1.5, 3.0),
        });

        // 30% chance of bridge muscle
        if (rng.random() < 0.3) {
            genome.muscles.push({
                a, b,
                extensionFactor: rng.range(0.1, 0.3),
                contractionFactor: rng.range(0.1, 0.3),
                frequency: rng.range(0.5, 2.0),
                phase: rng.range(0, TWO_PI),
                strength: rng.range(0.02, 0.04),
                waveform: 0,
                activationMode: 0,
            });
        }
    }
}

export function assembleModularCreature(rng) {
    // Pick 1-3 modules
    const moduleCount = rng.int(1, 4); // 1, 2, or 3
    const fragments = [];
    for (let i = 0; i < moduleCount; i++) {
        const gen = MODULE_GENERATORS[rng.int(0, MODULE_GENERATORS.length)];
        fragments.push(gen(rng));
    }

    const genome = {
        version: 1,
        bodyWidth: 0,
        bodyHeight: 0,
        points: [],
        constraints: [],
        muscles: [],
    };

    const attachments = []; // remapped attach info per fragment

    if (fragments.length === 1) {
        // Single module — just place it centered
        const attach = mergeFragment(genome, fragments[0], 0, 0, 1.0, 1.0, 0);
        attachments.push(attach);
    } else {
        // Choose layout strategy
        const layoutRoll = rng.random();

        if (layoutRoll < 0.40) {
            // Linear chain: left-to-right
            const slotWidth = 1.0 / fragments.length;
            for (let i = 0; i < fragments.length; i++) {
                const frag = fragments[i];
                const scaleX = slotWidth * 0.9;
                const scaleY = frag.height * 0.8;
                const offsetX = i * slotWidth + slotWidth * 0.05;
                const offsetY = (1.0 - scaleY) * 0.5;
                const attach = mergeFragment(genome, frag, offsetX, offsetY, scaleX, scaleY, 0);
                attachments.push(attach);

                if (i > 0) {
                    addBridgeConstraints(genome, attachments[i - 1].right, attach.left, rng);
                }
            }
        } else if (layoutRoll < 0.70) {
            // Stacked: top-to-bottom
            const slotHeight = 1.0 / fragments.length;
            for (let i = 0; i < fragments.length; i++) {
                const frag = fragments[i];
                const scaleX = frag.width * 0.8;
                const scaleY = slotHeight * 0.9;
                const offsetX = (1.0 - scaleX) * 0.5;
                const offsetY = i * slotHeight + slotHeight * 0.05;
                const attach = mergeFragment(genome, frag, offsetX, offsetY, scaleX, scaleY, 0);
                attachments.push(attach);

                if (i > 0) {
                    addBridgeConstraints(genome, attachments[i - 1].bottom, attach.top, rng);
                }
            }
        } else {
            // Radial: first module center, rest attach to it
            const centerAttach = mergeFragment(genome, fragments[0], 0.2, 0.2, 0.6, 0.6, 0);
            attachments.push(centerAttach);

            const sides = ['top', 'bottom', 'left', 'right'];
            for (let i = 1; i < fragments.length; i++) {
                const side = sides[(i - 1) % sides.length];
                const frag = fragments[i];
                let offsetX, offsetY, scaleX, scaleY;
                const fragScale = 0.35;

                if (side === 'right') {
                    offsetX = 0.65; offsetY = 0.3;
                    scaleX = fragScale; scaleY = fragScale;
                } else if (side === 'left') {
                    offsetX = 0.0; offsetY = 0.3;
                    scaleX = fragScale; scaleY = fragScale;
                } else if (side === 'bottom') {
                    offsetX = 0.3; offsetY = 0.65;
                    scaleX = fragScale; scaleY = fragScale;
                } else { // top
                    offsetX = 0.3; offsetY = 0.0;
                    scaleX = fragScale; scaleY = fragScale;
                }

                const attach = mergeFragment(genome, frag, offsetX, offsetY, scaleX, scaleY, 0);
                attachments.push(attach);

                // Bridge: center's side points → fragment's opposite side
                const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
                addBridgeConstraints(genome, centerAttach[side], attach[opposite[side]], rng);
            }
        }
    }

    // Compute body dimensions from layout
    const shapeRoll = rng.random();
    if (shapeRoll < 0.3) {
        genome.bodyWidth = rng.range(80, 180);
        genome.bodyHeight = rng.range(60, 150);
    } else if (shapeRoll < 0.6) {
        genome.bodyWidth = rng.range(60, 140);
        genome.bodyHeight = rng.range(80, 180);
    } else {
        genome.bodyWidth = rng.range(50, 200);
        genome.bodyHeight = rng.range(50, 200);
    }

    return genome;
}
