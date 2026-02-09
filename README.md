# Genetic Walker

**[Live Demo](https://loktar00.github.io/genetic-walker/)**

Evolves virtual stick creatures that learn to walk across procedural terrain using a genetic algorithm with Verlet integration physics.

## Quick Start

```bash
npm install
npm run dev
```

Open the local URL and configure your simulation parameters, then hit **Start New**.

## How It Works

**Physics**: Creatures are built from point masses connected by rigid constraints and oscillating muscles. A Verlet integrator handles motion, with elastic ground collisions and terrain friction.

**Genetics**: Each generation, creatures are evaluated on distance traveled. The best are kept (elitism), bred within topology-compatible species (speciation by point count), and mutated. Stagnation triggers gentle parametric exploration rather than destructive topology changes.

**Muscles**: Three waveforms (sine, sawtooth, square) and three activation modes (always, grounded-only, airborne-only) give evolution a rich palette of locomotion strategies.

## Features

- **Procedural terrain** with configurable world types (hills, mountains, rugged, flat)
- **Speciation** by body topology — prevents dominant species from crowding out alternatives
- **Creature Creator** — visual genome editor for hand-designing creatures
- **Preset library** — bipedal, arachnoid, snake, quadruped, roller, inchworm
- **Modular body assembly** — creatures built from composable modules (leg pairs, hubs, wheels, etc.)
- **Seed creatures** — inject hand-designed or preset creatures into the initial population
- **Speed bonus** — optional fitness component rewarding faster movement
- **Combat mode** [Beta] — enemies spawn from milestone generations, per-creature independent encounters
- **Split view** — grid of mini-viewports showing each creature simultaneously
- **Replay mode** — watch the best creature from the last generation in isolation
- **Save/load** — auto-saves to localStorage, import/export as JSON
- **Speed controls** — 1x to 1000x simulation speed

## Controls

| Key | Action |
|-----|--------|
| Space | Pause/resume |
| 1-5, 0 | Speed multiplier |
| Arrow Left/Right | Cycle creatures |
| C | Auto camera |
| S | Toggle split view |
| ESC | Exit replay mode |

## Build

```bash
npm run build      # production build
npm run preview    # preview production build
```
