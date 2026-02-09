import { loadState } from './Persistence.js';
import { listCreatures, loadCreature } from './CreatureLibrary.js';
import { getPresetNames, createPresetGenome } from '../ga/Presets.js';

const DEFAULTS = {
    populationSize: 12,
    evalMode: 'unlimited',  // 'timed' or 'unlimited'
    evalTime: 30,
    stallTimeout: 3,
    backwardThreshold: 30,  // px behind maxX to trigger backward stall
    energyWeight: 0,            // 0=disabled, higher=more penalty for energy use
    speedBonus: 0,              // 0=disabled, higher=more reward for speed
    structuralMutationRate: 1,  // multiplier: 0=off, 1=normal, 5=aggressive
    worldType: 'hills',
    terrainSeed: Math.floor(Math.random() * 100000)
};

export default class ConfigScreen {
    constructor(onStart, onOpenCreator) {
        this.onStart = onStart;
        this.onOpenCreator = onOpenCreator;
        this.container = document.getElementById('config-screen');
        this.savedState = loadState();
        this._build();
    }

    _build() {
        const saved = this.savedState;
        const d = DEFAULTS;

        // Collect all seedable creatures: library + presets
        const libCreatures = listCreatures();
        const presetNames = getPresetNames();

        this.container.innerHTML = `
            <div class="config-panel">
                <h2>Genetic Walker</h2>
                <div class="config-fields">
                    <label>
                        <span>Population Size</span>
                        <input type="number" id="cfg-pop" value="${d.populationSize}" min="4" max="50">
                    </label>
                    <label>
                        <span>Eval Mode</span>
                        <select id="cfg-eval-mode">
                            <option value="unlimited" ${d.evalMode === 'unlimited' ? 'selected' : ''}>Unlimited (stall only)</option>
                            <option value="timed" ${d.evalMode === 'timed' ? 'selected' : ''}>Timed</option>
                        </select>
                    </label>
                    <label id="eval-time-row" style="display:${d.evalMode === 'timed' ? 'flex' : 'none'}">
                        <span>Eval Time (sec)</span>
                        <input type="number" id="cfg-eval" value="${d.evalTime}" min="5" max="300">
                    </label>
                    <label>
                        <span>Stall Timeout (sec)</span>
                        <input type="number" id="cfg-stall" value="${d.stallTimeout}" min="1" max="30">
                    </label>
                    <label>
                        <span>Backward Threshold (px)</span>
                        <input type="number" id="cfg-backward" value="${d.backwardThreshold}" min="0" max="200">
                    </label>
                    <label>
                        <span>Energy Penalty</span>
                        <div class="slider-group">
                            <input type="range" id="cfg-energy" value="${d.energyWeight}" min="0" max="1" step="0.05">
                            <span id="cfg-energy-val">${d.energyWeight}</span>
                        </div>
                    </label>
                    <label>
                        <span>Speed Bonus</span>
                        <div class="slider-group">
                            <input type="range" id="cfg-speed" value="${d.speedBonus}" min="0" max="1" step="0.1">
                            <span id="cfg-speed-val">${d.speedBonus}</span>
                        </div>
                    </label>
                    <label>
                        <span>Structural Mutation</span>
                        <div class="slider-group">
                            <input type="range" id="cfg-structural" value="${d.structuralMutationRate}" min="0" max="5" step="0.5">
                            <span id="cfg-structural-val">${d.structuralMutationRate}x</span>
                        </div>
                    </label>
                    <label>
                        <span>World Type</span>
                        <select id="cfg-world-type">
                            <option value="hills" ${d.worldType === 'hills' ? 'selected' : ''}>Rolling Hills</option>
                            <option value="mountains" ${d.worldType === 'mountains' ? 'selected' : ''}>Mountains</option>
                            <option value="rugged" ${d.worldType === 'rugged' ? 'selected' : ''}>Rugged</option>
                            <option value="flat" ${d.worldType === 'flat' ? 'selected' : ''}>Flat</option>
                        </select>
                    </label>
                    <label>
                        <span>Terrain Seed</span>
                        <input type="number" id="cfg-seed" value="${d.terrainSeed}">
                    </label>
                    <label>
                        <span>Food (Berries)</span>
                        <select id="cfg-food">
                            <option value="on" selected>On</option>
                            <option value="off">Off</option>
                        </select>
                    </label>
                    <label>
                        <span>Combat [Beta]</span>
                        <select id="cfg-combat">
                            <option value="off" selected>Off</option>
                            <option value="on">On</option>
                        </select>
                    </label>
                    <label id="enemy-diff-row">
                        <span>Enemy Difficulty</span>
                        <select id="cfg-enemy-diff">
                            <option value="easy">Easy</option>
                            <option value="normal" selected>Normal</option>
                            <option value="hard">Hard</option>
                        </select>
                    </label>
                    <label class="file-label">
                        <span>Import JSON</span>
                        <input type="file" id="cfg-import" accept=".json">
                    </label>
                </div>
                ${this._buildSeedSection(libCreatures, presetNames)}
                <div class="config-buttons">
                    <button id="cfg-creator">Creature Creator</button>
                    <button id="cfg-start">Start New</button>
                    ${saved ? `<button id="cfg-resume">Resume (Gen ${saved.generation})</button>` : ''}
                </div>
            </div>
        `;

        this.container.style.display = 'flex';

        document.getElementById('cfg-start').addEventListener('click', () => {
            this._startNew();
        });

        if (saved) {
            document.getElementById('cfg-resume').addEventListener('click', () => {
                this._resume();
            });
        }

        document.getElementById('cfg-import').addEventListener('change', (e) => {
            this._handleImport(e);
        });

        document.getElementById('cfg-creator').addEventListener('click', () => {
            this.hide();
            if (this.onOpenCreator) this.onOpenCreator();
        });

        // Toggle eval time visibility based on mode
        document.getElementById('cfg-eval-mode').addEventListener('change', (e) => {
            document.getElementById('eval-time-row').style.display =
                e.target.value === 'timed' ? 'flex' : 'none';
        });

        // Live slider value display
        document.getElementById('cfg-energy').addEventListener('input', (e) => {
            document.getElementById('cfg-energy-val').textContent = e.target.value;
        });
        document.getElementById('cfg-speed').addEventListener('input', (e) => {
            document.getElementById('cfg-speed-val').textContent = e.target.value;
        });
        document.getElementById('cfg-structural').addEventListener('input', (e) => {
            document.getElementById('cfg-structural-val').textContent = `${e.target.value}x`;
        });
    }

    _buildSeedSection(libCreatures, presetNames) {
        const allSeeds = [
            ...presetNames.map(n => ({ name: n, source: 'preset' })),
            ...libCreatures.map(c => ({ name: c.name, source: 'library' }))
        ];
        if (allSeeds.length === 0) return '';

        const checkboxes = allSeeds.map(s => {
            const label = s.source === 'preset' ? `${s.name} (preset)` : s.name;
            const val = `${s.source}:${s.name}`;
            return `<label><input type="checkbox" class="seed-cb" value="${val}"> ${label}</label>`;
        }).join('');

        return `
            <div class="config-seed-section">
                <h4>Seed Creatures</h4>
                <div class="seed-creature-list">${checkboxes}</div>
            </div>
        `;
    }

    _getConfig() {
        const evalMode = document.getElementById('cfg-eval-mode').value;
        return {
            populationSize: parseInt(document.getElementById('cfg-pop').value, 10) || DEFAULTS.populationSize,
            evalMode,
            evalTime: evalMode === 'timed' ? (parseInt(document.getElementById('cfg-eval').value, 10) || DEFAULTS.evalTime) : Infinity,
            stallTimeout: parseInt(document.getElementById('cfg-stall').value, 10) || DEFAULTS.stallTimeout,
            backwardThreshold: parseInt(document.getElementById('cfg-backward').value, 10) || DEFAULTS.backwardThreshold,
            energyWeight: parseFloat(document.getElementById('cfg-energy').value),
            speedBonus: parseFloat(document.getElementById('cfg-speed').value),
            structuralMutationRate: parseFloat(document.getElementById('cfg-structural').value),
            worldType: document.getElementById('cfg-world-type').value || DEFAULTS.worldType,
            terrainSeed: parseInt(document.getElementById('cfg-seed').value, 10) || DEFAULTS.terrainSeed,
            foodEnabled: document.getElementById('cfg-food').value === 'on',
            combatEnabled: document.getElementById('cfg-combat').value === 'on',
            enemyDifficulty: document.getElementById('cfg-enemy-diff').value || 'normal'
        };
    }

    _getSelectedSeeds() {
        const checkboxes = this.container.querySelectorAll('.seed-cb:checked');
        const genomes = [];
        for (const cb of checkboxes) {
            const colonIdx = cb.value.indexOf(':');
            const source = cb.value.slice(0, colonIdx);
            const name = cb.value.slice(colonIdx + 1);
            let genome = null;
            if (source === 'preset') {
                genome = createPresetGenome(name);
            } else {
                genome = loadCreature(name);
            }
            if (genome) genomes.push(genome);
        }
        return genomes;
    }

    _startNew() {
        const config = this._getConfig();
        const seedGenomes = this._getSelectedSeeds();
        this.hide();
        this.onStart({ mode: 'new', config, seedGenomes: seedGenomes.length > 0 ? seedGenomes : null });
    }

    _resume() {
        this.hide();
        this.onStart({ mode: 'resume', savedState: this.savedState, config: this.savedState.config });
    }

    _handleImport(e) {
        const file = e.target.files[0];
        if (!file) {return;}
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const imported = JSON.parse(ev.target.result);
                this.hide();
                this.onStart({ mode: 'resume', savedState: imported, config: imported.config });
            } catch (err) {
                alert(`Invalid JSON file: ${err.message}`);
            }
        };
        reader.readAsText(file);
    }

    hide() {
        this.container.style.display = 'none';
    }

    show() {
        this.savedState = loadState();
        this._build();
    }
}
