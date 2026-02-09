// Hand-crafted genome presets with tuned biomechanics
// Each function returns a standard genome object compatible with Genome.js

const PI = Math.PI;
const TAU = PI * 2;

function bipedal() {
    return {
        version: 1,
        bodyWidth: 60,
        bodyHeight: 120,
        points: [
            { rx: 0.3, ry: 0.9, mass: 3.0 },  // 0: left hip
            { rx: 0.7, ry: 0.9, mass: 3.0 },  // 1: right hip
            { rx: 0.5, ry: 0.5, mass: 2.5 },  // 2: torso center
            { rx: 0.2, ry: 0.0, mass: 0.7 },  // 3: left foot
            { rx: 0.8, ry: 0.0, mass: 0.7 },  // 4: right foot
        ],
        constraints: [
            { a: 0, b: 1, stiffness: 3.0 },  // hip bar
            { a: 0, b: 2, stiffness: 2.5 },  // left hip to torso
            { a: 1, b: 2, stiffness: 2.5 },  // right hip to torso
            { a: 0, b: 3, stiffness: 2.0 },  // left leg
            { a: 1, b: 4, stiffness: 2.0 },  // right leg
        ],
        muscles: [
            // Alternating leg swing — offset by PI for walking gait
            { a: 0, b: 3, extensionFactor: 0.35, contractionFactor: 0.3, frequency: 1.5, phase: 0, strength: 0.04, waveform: 0, activationMode: 0 },
            { a: 1, b: 4, extensionFactor: 0.35, contractionFactor: 0.3, frequency: 1.5, phase: PI, strength: 0.04, waveform: 0, activationMode: 0 },
            // Core stability — slow torso oscillation
            { a: 2, b: 3, extensionFactor: 0.2, contractionFactor: 0.2, frequency: 1.5, phase: PI * 0.5, strength: 0.03, waveform: 0, activationMode: 0 },
            { a: 2, b: 4, extensionFactor: 0.2, contractionFactor: 0.2, frequency: 1.5, phase: PI * 1.5, strength: 0.03, waveform: 0, activationMode: 0 },
        ]
    };
}

function arachnoid() {
    return {
        version: 1,
        bodyWidth: 140,
        bodyHeight: 100,
        points: [
            { rx: 0.5, ry: 0.7, mass: 4.0 },  // 0: central hub
            { rx: 0.0, ry: 0.0, mass: 0.6 },  // 1: leg 1 (front-left)
            { rx: 0.2, ry: 0.0, mass: 0.6 },  // 2: leg 2 (mid-left)
            { rx: 0.4, ry: 0.0, mass: 0.6 },  // 3: leg 3 (back-left)
            { rx: 1.0, ry: 0.0, mass: 0.6 },  // 4: leg 4 (front-right)
            { rx: 0.8, ry: 0.0, mass: 0.6 },  // 5: leg 5 (mid-right)
            { rx: 0.6, ry: 0.0, mass: 0.6 },  // 6: leg 6 (back-right)
        ],
        constraints: [
            // Hub to all legs
            { a: 0, b: 1, stiffness: 2.0 },
            { a: 0, b: 2, stiffness: 2.0 },
            { a: 0, b: 3, stiffness: 2.0 },
            { a: 0, b: 4, stiffness: 2.0 },
            { a: 0, b: 5, stiffness: 2.0 },
            { a: 0, b: 6, stiffness: 2.0 },
            // Cross-braces for stability
            { a: 1, b: 4, stiffness: 1.5 },
            { a: 3, b: 6, stiffness: 1.5 },
        ],
        muscles: [
            // Sequential phase offsets for wave-like leg motion
            { a: 0, b: 1, extensionFactor: 0.3, contractionFactor: 0.3, frequency: 2.0, phase: 0 * PI / 3, strength: 0.04, waveform: 0, activationMode: 0 },
            { a: 0, b: 2, extensionFactor: 0.3, contractionFactor: 0.3, frequency: 2.0, phase: 1 * PI / 3, strength: 0.04, waveform: 0, activationMode: 0 },
            { a: 0, b: 3, extensionFactor: 0.3, contractionFactor: 0.3, frequency: 2.0, phase: 2 * PI / 3, strength: 0.04, waveform: 0, activationMode: 0 },
            { a: 0, b: 4, extensionFactor: 0.3, contractionFactor: 0.3, frequency: 2.0, phase: 3 * PI / 3, strength: 0.04, waveform: 0, activationMode: 0 },
            { a: 0, b: 5, extensionFactor: 0.3, contractionFactor: 0.3, frequency: 2.0, phase: 4 * PI / 3, strength: 0.04, waveform: 0, activationMode: 0 },
            { a: 0, b: 6, extensionFactor: 0.3, contractionFactor: 0.3, frequency: 2.0, phase: 5 * PI / 3, strength: 0.04, waveform: 0, activationMode: 0 },
        ]
    };
}

function snake() {
    return {
        version: 1,
        bodyWidth: 200,
        bodyHeight: 40,
        points: [
            { rx: 0.0, ry: 0.5, mass: 0.8 },  // 0: tail
            { rx: 0.2, ry: 0.5, mass: 1.0 },  // 1: segment 1
            { rx: 0.4, ry: 0.5, mass: 1.5 },  // 2: segment 2
            { rx: 0.6, ry: 0.5, mass: 1.5 },  // 3: segment 3
            { rx: 0.8, ry: 0.5, mass: 1.5 },  // 4: segment 4
            { rx: 1.0, ry: 0.5, mass: 2.0 },  // 5: head
        ],
        constraints: [
            // Chain connectivity
            { a: 0, b: 1, stiffness: 2.0 },
            { a: 1, b: 2, stiffness: 2.0 },
            { a: 2, b: 3, stiffness: 2.0 },
            { a: 3, b: 4, stiffness: 2.0 },
            { a: 4, b: 5, stiffness: 2.0 },
        ],
        muscles: [
            // Skip-one muscles create S-wave propagation
            { a: 0, b: 2, extensionFactor: 0.35, contractionFactor: 0.35, frequency: 2.0, phase: 0, strength: 0.05, waveform: 0, activationMode: 0 },
            { a: 1, b: 3, extensionFactor: 0.35, contractionFactor: 0.35, frequency: 2.0, phase: PI * 0.5, strength: 0.05, waveform: 0, activationMode: 0 },
            { a: 2, b: 4, extensionFactor: 0.35, contractionFactor: 0.35, frequency: 2.0, phase: PI, strength: 0.05, waveform: 0, activationMode: 0 },
            { a: 3, b: 5, extensionFactor: 0.35, contractionFactor: 0.35, frequency: 2.0, phase: PI * 1.5, strength: 0.05, waveform: 0, activationMode: 0 },
        ]
    };
}

function quadruped() {
    return {
        version: 1,
        bodyWidth: 120,
        bodyHeight: 100,
        points: [
            { rx: 0.2, ry: 0.8, mass: 2.5 },  // 0: front-left shoulder
            { rx: 0.8, ry: 0.8, mass: 2.5 },  // 1: front-right shoulder
            { rx: 0.2, ry: 0.2, mass: 2.0 },  // 2: back-left hip
            { rx: 0.8, ry: 0.2, mass: 2.0 },  // 3: back-right hip
            { rx: 0.1, ry: 0.0, mass: 0.7 },  // 4: front-left foot
            { rx: 0.9, ry: 0.0, mass: 0.7 },  // 5: front-right foot
        ],
        constraints: [
            // Body frame
            { a: 0, b: 1, stiffness: 3.0 },  // front bar
            { a: 2, b: 3, stiffness: 3.0 },  // rear bar
            { a: 0, b: 2, stiffness: 2.5 },  // left side
            { a: 1, b: 3, stiffness: 2.5 },  // right side
            // Diagonal braces
            { a: 0, b: 3, stiffness: 2.0 },
            { a: 1, b: 2, stiffness: 2.0 },
            // Legs
            { a: 2, b: 4, stiffness: 2.0 },
            { a: 3, b: 5, stiffness: 2.0 },
        ],
        muscles: [
            // Diagonal trotting gait: front-left + back-right synced
            { a: 0, b: 4, extensionFactor: 0.3, contractionFactor: 0.25, frequency: 1.8, phase: 0, strength: 0.04, waveform: 0, activationMode: 0 },
            { a: 1, b: 5, extensionFactor: 0.3, contractionFactor: 0.25, frequency: 1.8, phase: PI, strength: 0.04, waveform: 0, activationMode: 0 },
            // Body flexion
            { a: 2, b: 4, extensionFactor: 0.25, contractionFactor: 0.2, frequency: 1.8, phase: PI * 0.5, strength: 0.03, waveform: 0, activationMode: 0 },
            { a: 3, b: 5, extensionFactor: 0.25, contractionFactor: 0.2, frequency: 1.8, phase: PI * 1.5, strength: 0.03, waveform: 0, activationMode: 0 },
        ]
    };
}

function roller() {
    // Pentagon with all-edge muscles — sequential phase creates rolling motion
    const n = 5;
    const points = [];
    for (let i = 0; i < n; i++) {
        const angle = (i / n) * TAU - PI / 2;
        points.push({
            rx: 0.5 + 0.45 * Math.cos(angle),
            ry: 0.5 + 0.45 * Math.sin(angle),
            mass: 1.0
        });
    }

    const constraints = [];
    const muscles = [];
    for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        constraints.push({ a: i, b: next, stiffness: 2.0 });
        muscles.push({
            a: i, b: next,
            extensionFactor: 0.4,
            contractionFactor: 0.4,
            frequency: 2.5,
            phase: (i / n) * TAU,
            strength: 0.05,
            waveform: 0,
            activationMode: 0
        });
    }
    // Cross-braces for structure
    constraints.push({ a: 0, b: 2, stiffness: 1.5 });
    constraints.push({ a: 1, b: 3, stiffness: 1.5 });

    return {
        version: 1,
        bodyWidth: 80,
        bodyHeight: 80,
        points,
        constraints,
        muscles
    };
}

function inchworm() {
    return {
        version: 1,
        bodyWidth: 120,
        bodyHeight: 60,
        points: [
            { rx: 0.0, ry: 0.5, mass: 2.0 },  // 0: rear anchor
            { rx: 0.5, ry: 0.8, mass: 0.8 },  // 1: mid-top (arching body)
            { rx: 1.0, ry: 0.5, mass: 2.0 },  // 2: front anchor
            { rx: 0.0, ry: 0.0, mass: 1.5 },  // 3: rear foot (ground contact)
        ],
        constraints: [
            // Body chain
            { a: 0, b: 1, stiffness: 2.0 },
            { a: 1, b: 2, stiffness: 2.0 },
            // Ground contacts
            { a: 0, b: 3, stiffness: 2.5 },
            { a: 2, b: 3, stiffness: 1.5 },
        ],
        muscles: [
            // Main body-length muscle: arch and extend
            { a: 0, b: 2, extensionFactor: 0.4, contractionFactor: 0.4, frequency: 1.2, phase: 0, strength: 0.05, waveform: 0, activationMode: 0 },
            // Arch lift muscle
            { a: 3, b: 1, extensionFactor: 0.3, contractionFactor: 0.3, frequency: 1.2, phase: PI * 0.5, strength: 0.04, waveform: 0, activationMode: 0 },
        ]
    };
}

export const PRESETS = { bipedal, arachnoid, snake, quadruped, roller, inchworm };

export function getPresetNames() {
    return Object.keys(PRESETS);
}

export function createPresetGenome(name) {
    const fn = PRESETS[name];
    if (!fn) return null;
    return fn();
}
