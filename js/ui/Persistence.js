const STORAGE_KEY = 'genetic-walker-save';

// Config needs special handling: Infinity can't be JSON-serialized
function serializeConfig(config) {
    return {
        ...config,
        evalTime: config.evalTime === Infinity ? null : config.evalTime
    };
}

function deserializeConfig(config) {
    if (!config) {return config;}
    return {
        ...config,
        evalTime: (config.evalMode === 'unlimited' || config.evalTime === null) ? Infinity : config.evalTime
    };
}

export function saveState(state) {
    try {
        const data = {
            version: 1,
            config: serializeConfig(state.config),
            generation: state.generation,
            genomes: state.genomes,
            bestGenome: state.bestGenome,
            bestFitness: state.bestFitness,
            history: state.history,
            rngState: state.rngState,
            enemyMilestones: state.enemyMilestones || []
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Failed to save state:', e);
    }
}

export function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {return null;}
        const data = JSON.parse(raw);
        if (data.version !== 1) {return null;}
        data.config = deserializeConfig(data.config);
        data.enemyMilestones = data.enemyMilestones || [];
        return data;
    } catch (e) {
        console.warn('Failed to load state:', e);
        return null;
    }
}

export function clearState() {
    localStorage.removeItem(STORAGE_KEY);
}

export function exportJSON(state) {
    const data = {
        version: 1,
        config: serializeConfig(state.config),
        generation: state.generation,
        genomes: state.genomes,
        bestGenome: state.bestGenome,
        bestFitness: state.bestFitness,
        history: state.history,
        rngState: state.rngState,
        enemyMilestones: state.enemyMilestones || []
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `genetic-walker-gen${state.generation}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function importJSON(jsonString) {
    const data = JSON.parse(jsonString);
    if (data.version !== 1) {throw new Error('Unknown save version');}
    data.config = deserializeConfig(data.config);
    data.enemyMilestones = data.enemyMilestones || [];
    return data;
}
