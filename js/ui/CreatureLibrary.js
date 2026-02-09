// localStorage CRUD for creature designs
// Separate key from sim saves to avoid collisions

const STORAGE_KEY = 'genetic-walker-creatures';

function _readStore() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { creatures: [] };
        return JSON.parse(raw);
    } catch {
        return { creatures: [] };
    }
}

function _writeStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getLibrary() {
    return _readStore();
}

export function listCreatures() {
    const store = _readStore();
    return store.creatures.map(c => ({
        name: c.name,
        pointCount: c.genome.points.length,
        muscleCount: c.genome.muscles.length,
        created: c.created
    }));
}

export function saveCreature(name, genome) {
    const store = _readStore();
    const idx = store.creatures.findIndex(c => c.name === name);
    const entry = { name, genome, created: Date.now() };
    if (idx >= 0) {
        store.creatures[idx] = entry;
    } else {
        store.creatures.push(entry);
    }
    _writeStore(store);
}

export function loadCreature(name) {
    const store = _readStore();
    const entry = store.creatures.find(c => c.name === name);
    return entry ? entry.genome : null;
}

export function deleteCreature(name) {
    const store = _readStore();
    store.creatures = store.creatures.filter(c => c.name !== name);
    _writeStore(store);
}

export function exportCreatureFile(name, genome) {
    const data = { name, genome, version: 1 };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `creature-${name}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function importCreatureFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.genome || !data.genome.points) {
                    reject(new Error('Invalid creature file'));
                    return;
                }
                resolve({ name: data.name || 'Imported', genome: data.genome });
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}
