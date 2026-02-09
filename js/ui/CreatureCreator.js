// Full-screen visual genome editor
// 3-column layout: toolbar | canvas | properties

import { LIMITS, cloneGenome, validateGenome } from '../ga/Genome.js';
import { getPresetNames, createPresetGenome } from '../ga/Presets.js';
import {
    listCreatures, saveCreature, loadCreature, deleteCreature,
    exportCreatureFile, importCreatureFile
} from './CreatureLibrary.js';

const GRID_DIVISIONS = 4;       // grid lines at 0.25 intervals
const POINT_RADIUS = 8;
const HIT_RADIUS = 14;          // click detection radius
const MAX_UNDO = 50;

function defaultGenome() {
    return {
        version: 1,
        bodyWidth: 80,
        bodyHeight: 80,
        points: [
            { rx: 0.2, ry: 0.8, mass: 2.0 },
            { rx: 0.8, ry: 0.8, mass: 2.0 },
            { rx: 0.5, ry: 0.2, mass: 0.8 },
        ],
        constraints: [
            { a: 0, b: 1, stiffness: 2.0 },
            { a: 1, b: 2, stiffness: 2.0 },
            { a: 0, b: 2, stiffness: 2.0 },
        ],
        muscles: [
            { a: 0, b: 1, extensionFactor: 0.3, contractionFactor: 0.3, frequency: 1.5, phase: 0, strength: 0.03 },
        ]
    };
}

export default class CreatureCreator {
    constructor(onClose) {
        this.onClose = onClose;
        this.genome = defaultGenome();
        this.name = 'Untitled';
        this.tool = 'select';       // select, addPoint, addConstraint, addMuscle, delete
        this.selected = null;        // { type: 'point'|'constraint'|'muscle', index }
        this.pendingEndpoint = null; // first point index for constraint/muscle creation
        this.dragging = false;
        this.dragIdx = -1;

        // Undo/redo
        this.undoStack = [];
        this.redoStack = [];

        this._build();
        this._pushUndo();
    }

    // ---- DOM construction ----

    _build() {
        this.root = document.createElement('div');
        this.root.id = 'creature-creator';
        this.root.innerHTML = `
            <div class="creator-layout">
                <div class="creator-toolbar">
                    <h3>Tools</h3>
                    <button class="tool-btn active" data-tool="select">Select / Move</button>
                    <button class="tool-btn" data-tool="addPoint">Add Point</button>
                    <button class="tool-btn" data-tool="addConstraint">Add Constraint</button>
                    <button class="tool-btn" data-tool="addMuscle">Add Muscle</button>
                    <button class="tool-btn" data-tool="delete">Delete</button>

                    <h3>Presets</h3>
                    <select id="cc-preset">
                        <option value="">-- Load Preset --</option>
                        ${getPresetNames().map(n => `<option value="${n}">${n}</option>`).join('')}
                    </select>

                    <h3>Library</h3>
                    <select id="cc-library">
                        <option value="">-- Load Saved --</option>
                    </select>
                    <button id="cc-save">Save</button>
                    <button id="cc-delete-saved">Delete Saved</button>

                    <h3>File</h3>
                    <button id="cc-export">Export JSON</button>
                    <label class="cc-import-label">
                        Import JSON
                        <input type="file" id="cc-import" accept=".json">
                    </label>

                    <h3>Edit</h3>
                    <button id="cc-undo">Undo</button>
                    <button id="cc-redo">Redo</button>

                    <div class="creator-toolbar-spacer"></div>
                    <button id="cc-back" class="cc-back-btn">Back</button>
                </div>

                <div class="creator-canvas-wrap">
                    <canvas id="cc-canvas"></canvas>
                    <div class="cc-hint" id="cc-hint"></div>
                </div>

                <div class="creator-properties">
                    <h3>Body</h3>
                    <label>Name <input type="text" id="cc-name" value="Untitled"></label>
                    <label>Width <input type="range" id="cc-bw" min="20" max="200" value="80"><span id="cc-bw-val">80</span></label>
                    <label>Height <input type="range" id="cc-bh" min="20" max="200" value="80"><span id="cc-bh-val">80</span></label>

                    <div id="cc-sel-props"></div>

                    <div class="cc-stats" id="cc-stats"></div>
                </div>
            </div>
        `;

        document.body.appendChild(this.root);

        this.canvas = this.root.querySelector('#cc-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.hint = this.root.querySelector('#cc-hint');

        this._bindEvents();
        this._refreshLibraryList();
        this._resizeCanvas();
        this._updateStats();
        this._render();
    }

    _bindEvents() {
        // Tool buttons
        this.root.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.tool = btn.dataset.tool;
                this.pendingEndpoint = null;
                this.selected = null;
                this.root.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._updateHint();
                this._updateSelectionPanel();
                this._render();
            });
        });

        // Preset loading
        this.root.querySelector('#cc-preset').addEventListener('change', (e) => {
            if (!e.target.value) return;
            this._pushUndo();
            this.genome = createPresetGenome(e.target.value);
            this.name = e.target.value;
            this.selected = null;
            this.pendingEndpoint = null;
            this._syncBodyInputs();
            this._updateStats();
            this._updateSelectionPanel();
            this._render();
            e.target.value = '';
        });

        // Library loading
        this.root.querySelector('#cc-library').addEventListener('change', (e) => {
            if (!e.target.value) return;
            const genome = loadCreature(e.target.value);
            if (genome) {
                this._pushUndo();
                this.genome = genome;
                this.name = e.target.value;
                this.selected = null;
                this.pendingEndpoint = null;
                this._syncBodyInputs();
                this._updateStats();
                this._updateSelectionPanel();
                this._render();
            }
            e.target.value = '';
        });

        // Save
        this.root.querySelector('#cc-save').addEventListener('click', () => {
            this.name = this.root.querySelector('#cc-name').value.trim() || 'Untitled';
            const validated = validateGenome(cloneGenome(this.genome));
            saveCreature(this.name, validated);
            this._refreshLibraryList();
            this._flashHint(`Saved "${this.name}"`);
        });

        // Delete saved
        this.root.querySelector('#cc-delete-saved').addEventListener('click', () => {
            const sel = this.root.querySelector('#cc-library');
            const list = listCreatures();
            if (list.length === 0) return;
            const name = prompt('Enter creature name to delete:');
            if (name) {
                deleteCreature(name);
                this._refreshLibraryList();
                this._flashHint(`Deleted "${name}"`);
            }
        });

        // Export
        this.root.querySelector('#cc-export').addEventListener('click', () => {
            this.name = this.root.querySelector('#cc-name').value.trim() || 'Untitled';
            exportCreatureFile(this.name, validateGenome(cloneGenome(this.genome)));
        });

        // Import
        this.root.querySelector('#cc-import').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const { name, genome } = await importCreatureFile(file);
                this._pushUndo();
                this.genome = genome;
                this.name = name;
                this.selected = null;
                this._syncBodyInputs();
                this._updateStats();
                this._updateSelectionPanel();
                this._render();
                this._flashHint(`Imported "${name}"`);
            } catch (err) {
                alert(`Import failed: ${err.message}`);
            }
            e.target.value = '';
        });

        // Undo / Redo
        this.root.querySelector('#cc-undo').addEventListener('click', () => this._undo());
        this.root.querySelector('#cc-redo').addEventListener('click', () => this._redo());

        // Back
        this.root.querySelector('#cc-back').addEventListener('click', () => this.close());

        // Body sliders
        this.root.querySelector('#cc-bw').addEventListener('input', (e) => {
            this.genome.bodyWidth = parseInt(e.target.value, 10);
            this.root.querySelector('#cc-bw-val').textContent = e.target.value;
            this._render();
        });
        this.root.querySelector('#cc-bw').addEventListener('change', () => this._pushUndo());

        this.root.querySelector('#cc-bh').addEventListener('input', (e) => {
            this.genome.bodyHeight = parseInt(e.target.value, 10);
            this.root.querySelector('#cc-bh-val').textContent = e.target.value;
            this._render();
        });
        this.root.querySelector('#cc-bh').addEventListener('change', () => this._pushUndo());

        // Name
        this.root.querySelector('#cc-name').addEventListener('change', (e) => {
            this.name = e.target.value.trim() || 'Untitled';
        });

        // Canvas interactions
        this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this._onMouseUp());
        this.canvas.addEventListener('mouseleave', () => this._onMouseUp());

        // Keyboard shortcuts
        this._keyHandler = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this._undo(); }
            if (e.ctrlKey && e.key === 'y') { e.preventDefault(); this._redo(); }
            if (e.key === 'Escape') { this.selected = null; this.pendingEndpoint = null; this._updateSelectionPanel(); this._render(); }
            if (e.key === 'Delete' && this.selected) { this._deleteSelected(); }
        };
        document.addEventListener('keydown', this._keyHandler);

        // Resize
        this._resizeHandler = () => { this._resizeCanvas(); this._render(); };
        window.addEventListener('resize', this._resizeHandler);

        this._updateHint();
    }

    // ---- Canvas coordinate mapping ----

    _resizeCanvas() {
        const wrap = this.root.querySelector('.creator-canvas-wrap');
        const w = wrap.clientWidth;
        const h = wrap.clientHeight - 24; // hint bar
        this.canvas.width = w;
        this.canvas.height = h;

        // Editing area: centered with margin, maintaining aspect ratio
        const margin = 40;
        const areaW = w - margin * 2;
        const areaH = h - margin * 2;
        this.editArea = { x: margin, y: margin, w: areaW, h: areaH };
    }

    _genomeToCanvas(rx, ry) {
        const ea = this.editArea;
        // Map rx (0-1) to edit area X, ry (0=bottom, 1=top) to Y (flipped)
        return {
            x: ea.x + rx * ea.w,
            y: ea.y + (1 - ry) * ea.h
        };
    }

    _canvasToGenome(cx, cy) {
        const ea = this.editArea;
        return {
            rx: Math.max(0, Math.min(1, (cx - ea.x) / ea.w)),
            ry: Math.max(0, Math.min(1, 1 - (cy - ea.y) / ea.h))
        };
    }

    _getCanvasXY(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
            y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
        };
    }

    // ---- Hit testing ----

    _hitTestPoint(cx, cy) {
        for (let i = 0; i < this.genome.points.length; i++) {
            const p = this._genomeToCanvas(this.genome.points[i].rx, this.genome.points[i].ry);
            const dx = cx - p.x, dy = cy - p.y;
            if (dx * dx + dy * dy < HIT_RADIUS * HIT_RADIUS) return i;
        }
        return -1;
    }

    _hitTestLine(cx, cy, arr) {
        for (let i = 0; i < arr.length; i++) {
            const el = arr[i];
            const p1 = this._genomeToCanvas(this.genome.points[el.a].rx, this.genome.points[el.a].ry);
            const p2 = this._genomeToCanvas(this.genome.points[el.b].rx, this.genome.points[el.b].ry);
            const dist = this._pointToSegmentDist(cx, cy, p1.x, p1.y, p2.x, p2.y);
            if (dist < HIT_RADIUS) return i;
        }
        return -1;
    }

    _pointToSegmentDist(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    // ---- Mouse handlers ----

    _onMouseDown(e) {
        const { x, y } = this._getCanvasXY(e);

        switch (this.tool) {
            case 'select': {
                const ptIdx = this._hitTestPoint(x, y);
                if (ptIdx >= 0) {
                    this.selected = { type: 'point', index: ptIdx };
                    this.dragging = true;
                    this.dragIdx = ptIdx;
                } else {
                    const cIdx = this._hitTestLine(x, y, this.genome.constraints);
                    if (cIdx >= 0) {
                        this.selected = { type: 'constraint', index: cIdx };
                    } else {
                        const mIdx = this._hitTestLine(x, y, this.genome.muscles);
                        if (mIdx >= 0) {
                            this.selected = { type: 'muscle', index: mIdx };
                        } else {
                            this.selected = null;
                        }
                    }
                }
                this._updateSelectionPanel();
                this._render();
                break;
            }
            case 'addPoint': {
                const { rx, ry } = this._canvasToGenome(x, y);
                this._pushUndo();
                this.genome.points.push({ rx, ry, mass: 1.0 });
                this.selected = { type: 'point', index: this.genome.points.length - 1 };
                this._updateStats();
                this._updateSelectionPanel();
                this._render();
                break;
            }
            case 'addConstraint':
            case 'addMuscle': {
                const ptIdx = this._hitTestPoint(x, y);
                if (ptIdx < 0) break;
                if (this.pendingEndpoint === null) {
                    this.pendingEndpoint = ptIdx;
                    this._updateHint();
                    this._render();
                } else {
                    if (ptIdx === this.pendingEndpoint) break;
                    this._pushUndo();
                    const a = this.pendingEndpoint;
                    const b = ptIdx;
                    if (this.tool === 'addConstraint') {
                        const exists = this.genome.constraints.some(c =>
                            (c.a === a && c.b === b) || (c.a === b && c.b === a));
                        if (!exists) {
                            this.genome.constraints.push({ a, b, stiffness: 2.0 });
                            this.selected = { type: 'constraint', index: this.genome.constraints.length - 1 };
                        }
                    } else {
                        const exists = this.genome.muscles.some(m =>
                            (m.a === a && m.b === b) || (m.a === b && m.b === a));
                        if (!exists) {
                            this.genome.muscles.push({
                                a, b,
                                extensionFactor: 0.3, contractionFactor: 0.3,
                                frequency: 1.5, phase: 0, strength: 0.03
                            });
                            this.selected = { type: 'muscle', index: this.genome.muscles.length - 1 };
                        }
                    }
                    this.pendingEndpoint = null;
                    this._updateHint();
                    this._updateStats();
                    this._updateSelectionPanel();
                    this._render();
                }
                break;
            }
            case 'delete': {
                const ptIdx = this._hitTestPoint(x, y);
                if (ptIdx >= 0 && this.genome.points.length > LIMITS.minPoints) {
                    this._pushUndo();
                    this._removePoint(ptIdx);
                    this._updateStats();
                    this._render();
                    break;
                }
                const cIdx = this._hitTestLine(x, y, this.genome.constraints);
                if (cIdx >= 0) {
                    this._pushUndo();
                    this.genome.constraints.splice(cIdx, 1);
                    this.selected = null;
                    this._updateStats();
                    this._updateSelectionPanel();
                    this._render();
                    break;
                }
                const mIdx = this._hitTestLine(x, y, this.genome.muscles);
                if (mIdx >= 0) {
                    this._pushUndo();
                    this.genome.muscles.splice(mIdx, 1);
                    this.selected = null;
                    this._updateStats();
                    this._updateSelectionPanel();
                    this._render();
                    break;
                }
                break;
            }
        }
    }

    _onMouseMove(e) {
        if (!this.dragging || this.dragIdx < 0) return;
        const { x, y } = this._getCanvasXY(e);
        const { rx, ry } = this._canvasToGenome(x, y);
        this.genome.points[this.dragIdx].rx = rx;
        this.genome.points[this.dragIdx].ry = ry;
        this._updateSelectionPanel();
        this._render();
    }

    _onMouseUp() {
        if (this.dragging) {
            this._pushUndo();
            this.dragging = false;
            this.dragIdx = -1;
        }
    }

    // ---- Point removal with reindexing (mirrors Mutation.js:90-108) ----

    _removePoint(idx) {
        this.genome.points.splice(idx, 1);
        this.genome.constraints = this.genome.constraints
            .filter(c => c.a !== idx && c.b !== idx)
            .map(c => ({
                ...c,
                a: c.a > idx ? c.a - 1 : c.a,
                b: c.b > idx ? c.b - 1 : c.b
            }));
        this.genome.muscles = this.genome.muscles
            .filter(m => m.a !== idx && m.b !== idx)
            .map(m => ({
                ...m,
                a: m.a > idx ? m.a - 1 : m.a,
                b: m.b > idx ? m.b - 1 : m.b
            }));
        this.selected = null;
        this._updateSelectionPanel();
    }

    _deleteSelected() {
        if (!this.selected) return;
        this._pushUndo();
        const { type, index } = this.selected;
        if (type === 'point' && this.genome.points.length > LIMITS.minPoints) {
            this._removePoint(index);
        } else if (type === 'constraint') {
            this.genome.constraints.splice(index, 1);
            this.selected = null;
        } else if (type === 'muscle') {
            this.genome.muscles.splice(index, 1);
            this.selected = null;
        }
        this._updateStats();
        this._updateSelectionPanel();
        this._render();
    }

    // ---- Undo / Redo ----

    _pushUndo() {
        this.undoStack.push(cloneGenome(this.genome));
        if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
        this.redoStack = [];
    }

    _undo() {
        if (this.undoStack.length <= 1) return;
        this.redoStack.push(this.undoStack.pop());
        this.genome = cloneGenome(this.undoStack[this.undoStack.length - 1]);
        this.selected = null;
        this._syncBodyInputs();
        this._updateStats();
        this._updateSelectionPanel();
        this._render();
    }

    _redo() {
        if (this.redoStack.length === 0) return;
        const state = this.redoStack.pop();
        this.undoStack.push(state);
        this.genome = cloneGenome(state);
        this.selected = null;
        this._syncBodyInputs();
        this._updateStats();
        this._updateSelectionPanel();
        this._render();
    }

    // ---- UI helpers ----

    _syncBodyInputs() {
        this.root.querySelector('#cc-name').value = this.name;
        this.root.querySelector('#cc-bw').value = this.genome.bodyWidth;
        this.root.querySelector('#cc-bw-val').textContent = this.genome.bodyWidth;
        this.root.querySelector('#cc-bh').value = this.genome.bodyHeight;
        this.root.querySelector('#cc-bh-val').textContent = this.genome.bodyHeight;
    }

    _refreshLibraryList() {
        const sel = this.root.querySelector('#cc-library');
        const creatures = listCreatures();
        sel.innerHTML = '<option value="">-- Load Saved --</option>' +
            creatures.map(c => `<option value="${c.name}">${c.name} (${c.pointCount}pt/${c.muscleCount}m)</option>`).join('');
    }

    _updateStats() {
        const g = this.genome;
        const el = this.root.querySelector('#cc-stats');
        el.textContent = `${g.points.length} points, ${g.constraints.length} constraints, ${g.muscles.length} muscles`;
    }

    _updateHint() {
        const hints = {
            select: 'Click to select. Drag points to move.',
            addPoint: 'Click canvas to place a point.',
            addConstraint: this.pendingEndpoint !== null
                ? `Click second point (first: #${this.pendingEndpoint})`
                : 'Click first point for constraint.',
            addMuscle: this.pendingEndpoint !== null
                ? `Click second point (first: #${this.pendingEndpoint})`
                : 'Click first point for muscle.',
            delete: 'Click element to delete.'
        };
        this.hint.textContent = hints[this.tool] || '';
    }

    _flashHint(msg) {
        this.hint.textContent = msg;
        setTimeout(() => this._updateHint(), 2000);
    }

    _updateSelectionPanel() {
        const panel = this.root.querySelector('#cc-sel-props');
        if (!this.selected) {
            panel.innerHTML = '';
            return;
        }

        const { type, index } = this.selected;
        const L = LIMITS;

        if (type === 'point') {
            const pt = this.genome.points[index];
            if (!pt) { panel.innerHTML = ''; return; }
            const mass = pt.mass !== undefined ? pt.mass : 1.0;
            panel.innerHTML = `
                <h3>Point #${index}</h3>
                <label>X (rx) <input type="range" id="cc-p-rx" min="0" max="1" step="0.01" value="${pt.rx}"><span id="cc-p-rx-val">${pt.rx.toFixed(2)}</span></label>
                <label>Y (ry) <input type="range" id="cc-p-ry" min="0" max="1" step="0.01" value="${pt.ry}"><span id="cc-p-ry-val">${pt.ry.toFixed(2)}</span></label>
                <label>Mass <input type="range" id="cc-p-mass" min="${LIMITS.pointMass.min}" max="${LIMITS.pointMass.max}" step="0.1" value="${mass}"><span id="cc-p-mass-val">${mass.toFixed(1)}</span></label>
            `;
            this._bindSlider('cc-p-rx', v => { pt.rx = v; this._render(); });
            this._bindSlider('cc-p-ry', v => { pt.ry = v; this._render(); });
            this._bindSlider('cc-p-mass', v => { pt.mass = v; this._render(); });
        } else if (type === 'constraint') {
            const c = this.genome.constraints[index];
            if (!c) { panel.innerHTML = ''; return; }
            panel.innerHTML = `
                <h3>Constraint #${index} (${c.a}-${c.b})</h3>
                <label>Stiffness <input type="range" id="cc-c-st" min="${L.stiffness.min}" max="${L.stiffness.max}" step="0.1" value="${c.stiffness}"><span id="cc-c-st-val">${c.stiffness.toFixed(1)}</span></label>
            `;
            this._bindSlider('cc-c-st', v => { c.stiffness = v; });
        } else if (type === 'muscle') {
            const m = this.genome.muscles[index];
            if (!m) { panel.innerHTML = ''; return; }
            const waveformNames = ['Sine', 'Sawtooth', 'Square'];
            const activationNames = ['Always', 'Grounded', 'Airborne'];
            panel.innerHTML = `
                <h3>Muscle #${index} (${m.a}-${m.b})</h3>
                <label>Extension <input type="range" id="cc-m-ext" min="${L.extensionFactor.min}" max="${L.extensionFactor.max}" step="0.01" value="${m.extensionFactor}"><span id="cc-m-ext-val">${m.extensionFactor.toFixed(2)}</span></label>
                <label>Contraction <input type="range" id="cc-m-con" min="${L.contractionFactor.min}" max="${L.contractionFactor.max}" step="0.01" value="${m.contractionFactor}"><span id="cc-m-con-val">${m.contractionFactor.toFixed(2)}</span></label>
                <label>Frequency <input type="range" id="cc-m-freq" min="${L.frequency.min}" max="${L.frequency.max}" step="0.1" value="${m.frequency}"><span id="cc-m-freq-val">${m.frequency.toFixed(1)}</span></label>
                <label>Phase <input type="range" id="cc-m-phase" min="0" max="${(Math.PI * 2).toFixed(2)}" step="0.1" value="${m.phase}"><span id="cc-m-phase-val">${m.phase.toFixed(1)}</span></label>
                <label>Strength <input type="range" id="cc-m-str" min="${L.strength.min}" max="${L.strength.max}" step="0.001" value="${m.strength}"><span id="cc-m-str-val">${m.strength.toFixed(3)}</span></label>
                <label>Waveform <select id="cc-m-wave">${waveformNames.map((n, i) => `<option value="${i}" ${(m.waveform || 0) === i ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
                <label>Activation <select id="cc-m-activ">${activationNames.map((n, i) => `<option value="${i}" ${(m.activationMode || 0) === i ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            `;
            this._bindSlider('cc-m-ext', v => { m.extensionFactor = v; });
            this._bindSlider('cc-m-con', v => { m.contractionFactor = v; });
            this._bindSlider('cc-m-freq', v => { m.frequency = v; });
            this._bindSlider('cc-m-phase', v => { m.phase = v; });
            this._bindSlider('cc-m-str', v => { m.strength = v; });
            this.root.querySelector('#cc-m-wave').addEventListener('change', (e) => {
                this._pushUndo();
                m.waveform = parseInt(e.target.value, 10);
            });
            this.root.querySelector('#cc-m-activ').addEventListener('change', (e) => {
                this._pushUndo();
                m.activationMode = parseInt(e.target.value, 10);
            });
        }
    }

    _bindSlider(id, onChange) {
        const el = this.root.querySelector(`#${id}`);
        const valEl = this.root.querySelector(`#${id}-val`);
        if (!el) return;
        el.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            if (valEl) valEl.textContent = v % 1 === 0 ? v : v.toFixed(v < 1 ? 3 : v < 10 ? 2 : 1);
            onChange(v);
        });
        el.addEventListener('change', () => this._pushUndo());
    }

    // ---- Rendering ----

    _render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const ea = this.editArea;

        ctx.clearRect(0, 0, w, h);

        // Background
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, w, h);

        // Edit area background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(ea.x, ea.y, ea.w, ea.h);

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= GRID_DIVISIONS; i++) {
            const frac = i / GRID_DIVISIONS;
            // Vertical
            const gx = ea.x + frac * ea.w;
            ctx.beginPath(); ctx.moveTo(gx, ea.y); ctx.lineTo(gx, ea.y + ea.h); ctx.stroke();
            // Horizontal
            const gy = ea.y + frac * ea.h;
            ctx.beginPath(); ctx.moveTo(ea.x, gy); ctx.lineTo(ea.x + ea.w, gy); ctx.stroke();
        }

        // Body boundary rectangle
        ctx.strokeStyle = 'rgba(0,255,0,0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(ea.x, ea.y, ea.w, ea.h);
        ctx.setLineDash([]);

        // Ground line at bottom
        ctx.strokeStyle = 'rgba(139,69,19,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ea.x, ea.y + ea.h);
        ctx.lineTo(ea.x + ea.w, ea.y + ea.h);
        ctx.stroke();
        ctx.fillStyle = 'rgba(139,69,19,0.15)';
        ctx.fillRect(ea.x, ea.y + ea.h, ea.w, h - ea.y - ea.h);

        // Draw constraints
        ctx.lineWidth = 2;
        for (let i = 0; i < this.genome.constraints.length; i++) {
            const c = this.genome.constraints[i];
            const p1 = this._genomeToCanvas(this.genome.points[c.a].rx, this.genome.points[c.a].ry);
            const p2 = this._genomeToCanvas(this.genome.points[c.b].rx, this.genome.points[c.b].ry);
            const isSel = this.selected && this.selected.type === 'constraint' && this.selected.index === i;
            ctx.strokeStyle = isSel ? '#fff' : 'rgba(0,200,0,0.7)';
            ctx.lineWidth = isSel ? 3 : 2;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }

        // Draw muscles
        for (let i = 0; i < this.genome.muscles.length; i++) {
            const m = this.genome.muscles[i];
            const p1 = this._genomeToCanvas(this.genome.points[m.a].rx, this.genome.points[m.a].ry);
            const p2 = this._genomeToCanvas(this.genome.points[m.b].rx, this.genome.points[m.b].ry);
            const isSel = this.selected && this.selected.type === 'muscle' && this.selected.index === i;
            ctx.strokeStyle = isSel ? '#fff' : 'rgba(255,60,60,0.8)';
            ctx.lineWidth = isSel ? 3 : 2;
            ctx.setLineDash([6, 3]);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw points (radius scaled by sqrt(mass))
        for (let i = 0; i < this.genome.points.length; i++) {
            const pt = this.genome.points[i];
            const p = this._genomeToCanvas(pt.rx, pt.ry);
            const isSel = this.selected && this.selected.type === 'point' && this.selected.index === i;
            const isPending = this.pendingEndpoint === i;
            const massScale = Math.sqrt(pt.mass || 1.0);
            const r = POINT_RADIUS * massScale;

            ctx.fillStyle = isPending ? '#ff0' : '#0f0';
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();

            if (isSel || isPending) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Point index label
            ctx.fillStyle = '#000';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(i, p.x, p.y);

            // Mass label below point
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '9px monospace';
            ctx.fillText((pt.mass || 1.0).toFixed(1), p.x, p.y + r + 10);
        }

        // Axis labels
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('rx: 0', ea.x, ea.y + ea.h + 4);
        ctx.fillText('rx: 1', ea.x + ea.w, ea.y + ea.h + 4);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('ry:1', ea.x - 4, ea.y);
        ctx.fillText('ry:0', ea.x - 4, ea.y + ea.h);
    }

    // ---- Lifecycle ----

    close() {
        document.removeEventListener('keydown', this._keyHandler);
        window.removeEventListener('resize', this._resizeHandler);
        this.root.remove();
        if (this.onClose) this.onClose();
    }

    getGenome() {
        return validateGenome(cloneGenome(this.genome));
    }
}
