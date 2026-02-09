// Deterministic hash for random-access noise values
// Shared across Terrain, Patterns, Parallax

export function hash(ix, seed) {
    let h = (ix * 374761393 + seed * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    h ^= (h >>> 16);
    return (h >>> 0) / 4294967296;
}
