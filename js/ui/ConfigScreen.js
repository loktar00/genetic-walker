import { loadState } from './Persistence.js';

const DEFAULTS = {
    populationSize: 12,
    evalMode: 'unlimited',  // 'timed' or 'unlimited'
    evalTime: 30,
    stallTimeout: 3,
    backwardThreshold: 30,  // px behind maxX to trigger backward stall
    energyWeight: 0,            // 0=disabled, higher=more penalty for energy use
    structuralMutationRate: 1,  // multiplier: 0=off, 1=normal, 5=aggressive
    worldType: 'hills',
    terrainSeed: Math.floor(Math.random() * 100000)
};

export default class ConfigScreen {
    constructor(onStart) {
        this.onStart = onStart;
        this.container = document.getElementById('config-screen');
        this.savedState = loadState();
        this._build();
    }

    _build() {
        const saved = this.savedState;
        const d = DEFAULTS;

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
                    <label class="file-label">
                        <span>Import JSON</span>
                        <input type="file" id="cfg-import" accept=".json">
                    </label>
                </div>
                <div class="config-buttons">
                    <button id="cfg-start">Start New</button>
                    ${saved ? `<button id="cfg-resume">Resume (Gen ${  saved.generation  })</button>` : ''}
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

        // Toggle eval time visibility based on mode
        document.getElementById('cfg-eval-mode').addEventListener('change', (e) => {
            document.getElementById('eval-time-row').style.display =
                e.target.value === 'timed' ? 'flex' : 'none';
        });

        // Live slider value display
        document.getElementById('cfg-energy').addEventListener('input', (e) => {
            document.getElementById('cfg-energy-val').textContent = e.target.value;
        });
        document.getElementById('cfg-structural').addEventListener('input', (e) => {
            document.getElementById('cfg-structural-val').textContent = `${e.target.value}x`;
        });
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
            structuralMutationRate: parseFloat(document.getElementById('cfg-structural').value),
            worldType: document.getElementById('cfg-world-type').value || DEFAULTS.worldType,
            terrainSeed: parseInt(document.getElementById('cfg-seed').value, 10) || DEFAULTS.terrainSeed
        };
    }

    _startNew() {
        const config = this._getConfig();
        this.hide();
        this.onStart({ mode: 'new', config });
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
                alert(`Invalid JSON file: ${  err.message}`);
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
