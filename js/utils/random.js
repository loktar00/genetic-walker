// Mulberry32 seeded PRNG with state serialization
export function createRNG(seed) {
    let state = seed | 0;

    function next() {
        state |= 0;
        state = state + 0x6D2B79F5 | 0;
        let t = Math.imul(state ^ state >>> 15, 1 | state);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }

    return {
        random() { return next(); },
        range(min, max) { return min + next() * (max - min); },
        int(min, max) { return Math.floor(min + next() * (max - min)); },
        getState() { return state; },
        setState(s) { state = s | 0; }
    };
}
