# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Genetic-walker is an experimental genetic algorithm playground for evolving virtual creatures that walk/move, using Verlet integration physics and an interactive canvas-based creature editor.

## Build & Development Commands

```bash
# Install dependencies
npm install

# Run development server (Vite, auto-reload)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

Build toolchain: Vite (dev server only). Source files are native ES6 modules loaded directly by the browser. No bundler or transpiler in dev mode.

## Architecture

**Module system:** ES6 modules (`import`/`export`), loaded natively by the browser via `<script type="module">`.

**Entry point:** `js/app.js` — initializes World, Creator, manages the `requestAnimationFrame` animation loop, and updates/renders all physics bodies.

**Core modules in `js/verlet/`:**

- **World.js** — Module-level singleton providing shared canvas context and simulation constants (800x200 canvas, 15 solver iterations, gravity 0.1, friction 0.8).
- **Verlet.js** — `VerletBody` class with three subsystems:
  - **Point masses** — Vertices with position-based Verlet integration and world boundary collision.
  - **Point constraints** — Rigid distance connections between points (rendered green).
  - **Point muscles** — Oscillating-length connections that expand/contract to produce locomotion (rendered red).

**Creator (`js/creator.js`):** `CreatorCanvas` class — canvas-based interactive editor for designing creature skeletons. Three modes: add/remove points, constraints, and muscles.

**Styling:** Plain CSS in `css/styles.css`.
