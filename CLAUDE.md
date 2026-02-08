# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Genetic-walker evolves virtual stick creatures that learn to walk across procedural terrain, using a genetic algorithm with Verlet integration physics. No tests or linter configured.

## Build & Development Commands

```bash
npm install          # install dependencies
npm run dev          # Vite dev server with auto-reload
npm run build        # production build
npm run preview      # preview production build
```

No bundler/transpiler in dev mode — native ES6 modules loaded by the browser via `<script type="module">`.

## Architecture

### Flow

`js/app.js` → `ConfigScreen` (DOM overlay for settings) → `SimulationManager` (GA lifecycle) → `requestAnimationFrame` render loop + `HUD` (canvas-rendered stats).

User configures population size, eval time, mutation rate, etc. on the config screen, then the simulation runs generations autonomously: spawn bodies → evaluate fitness (distance traveled) → breed next generation.

### Physics (`js/verlet/`)

- **World.js** — Module-level singleton: shared canvas (800x400), simulation constants (`dt: 1/60`, `gravity: 600` px/s², `damping: 0.99`, `groundFriction: 0.7`), `simSteps: 15` solver iterations, `speedMultiplier: 1-5`, scrolling camera.
- **Verlet.js** — `VerletBody` built from a genome. Three subsystems: point masses (Verlet integration + terrain collision), point constraints (rigid distance), point muscles (sin-based oscillation between min/max length). `frozen` flag stops updates for finished creatures.
- **Terrain.js** — Deterministic procedural terrain from hash-based noise. Progressive difficulty (amplitude grows, wavelength shrinks with distance). Flat starting zone (first 200px). Segment width 20px with O(1) edge lookup.

### Genetic Algorithm (`js/ga/`)

- **Genome.js** — Schema: `{ bodyWidth, bodyHeight, points[], constraints[], muscles[] }`. Random creation, clone (JSON deep copy), validation with clamping to `LIMITS`.
- **Mutation.js** — Parametric mutations (tweak numeric values with Gaussian noise) + structural mutations (add/remove points, constraints, muscles). Rates scale with stagnation.
- **Crossover.js** — Topology from fitter parent, blended numeric params, circular lerp for phase values.
- **Selection.js** — Tournament selection (size 3), elitism (top 2), `nextGeneration()` orchestrates the full breed pipeline.
- **SimulationManager.js** — State machine (`IDLE→RUNNING→BREEDING`), per-creature stall/backward detection, auto-save to localStorage after each generation.

### UI (`js/ui/`)

- **ConfigScreen.js** — DOM overlay for configuring GA params. Supports resume from localStorage and JSON import.
- **HUD.js** — Canvas-rendered overlay: generation number, alive count, elapsed time, fitness stats, fitness history sparkline chart.
- **Persistence.js** — localStorage save/load + JSON file export/import of full simulation state.

### Utilities

- **`js/utils/random.js`** — Seeded PRNG (mulberry32) with `getState()`/`setState()` for deterministic replay.
- **`js/creator.js`** — Legacy interactive creature editor (hidden, not connected to GA flow).
