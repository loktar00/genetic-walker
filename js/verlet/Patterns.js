// Procedural creature body patterns clipped to convex hull
import { hash } from '../utils/hash.js';

// Compute pattern type and params from genome topology (stable across mutations)
export function computePatternParams(genome) {
    // Hash from structural topology: point count + constraint count + bodyWidth
    const topoSeed = genome.points.length * 1000 + genome.constraints.length * 100 + Math.round(genome.bodyWidth);
    const h = hash(topoSeed, 7919);

    let type;
    if (h < 0.25) type = 'stripes';
    else if (h < 0.45) type = 'dots';
    else if (h < 0.65) type = 'chevrons';
    else if (h < 0.85) type = 'scales';
    else type = 'solid';

    // Derive pattern parameters from genome hash
    const angle = hash(topoSeed, 1013) * Math.PI; // 0 to PI
    const spacing = 6 + hash(topoSeed, 2027) * 10; // 6-16 px
    const dotRadius = 1.5 + hash(topoSeed, 3041) * 2; // 1.5-3.5 px

    return { type, angle, spacing, dotRadius, seed: topoSeed };
}

// Render pattern inside a hull path. Hull is [{x,y}, ...].
export function renderPattern(ctx, hull, params, baseColor) {
    if (!params || params.type === 'solid' || hull.length < 3) return;

    // Compute bounding box of hull
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < hull.length; i++) {
        if (hull[i].x < minX) minX = hull[i].x;
        if (hull[i].y < minY) minY = hull[i].y;
        if (hull[i].x > maxX) maxX = hull[i].x;
        if (hull[i].y > maxY) maxY = hull[i].y;
    }

    // Parse base color to derive pattern color (shift hue slightly)
    const patternColor = _derivePatternColor(baseColor);

    ctx.save();

    // Clip to hull
    ctx.beginPath();
    ctx.moveTo(hull[0].x, hull[0].y);
    for (let i = 1; i < hull.length; i++) {
        ctx.lineTo(hull[i].x, hull[i].y);
    }
    ctx.closePath();
    ctx.clip();

    ctx.strokeStyle = patternColor;
    ctx.fillStyle = patternColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.35;

    switch (params.type) {
        case 'stripes':
            _renderStripes(ctx, minX, minY, maxX, maxY, params);
            break;
        case 'dots':
            _renderDots(ctx, minX, minY, maxX, maxY, params);
            break;
        case 'chevrons':
            _renderChevrons(ctx, minX, minY, maxX, maxY, params);
            break;
        case 'scales':
            _renderScales(ctx, minX, minY, maxX, maxY, params);
            break;
    }

    ctx.globalAlpha = 1.0;
    ctx.restore();
}

function _renderStripes(ctx, minX, minY, maxX, maxY, params) {
    const { angle, spacing } = params;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const diag = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2);
    const halfDiag = diag / 2 + spacing;
    const count = Math.ceil(diag / spacing);

    ctx.beginPath();
    for (let i = -count; i <= count; i++) {
        const offset = i * spacing;
        // Line perpendicular to angle, offset along angle normal
        const ox = cx + cos * offset;
        const oy = cy + sin * offset;
        ctx.moveTo(ox - sin * halfDiag, oy + cos * halfDiag);
        ctx.lineTo(ox + sin * halfDiag, oy - cos * halfDiag);
    }
    ctx.stroke();
}

function _renderDots(ctx, minX, minY, maxX, maxY, params) {
    const { spacing, dotRadius } = params;
    const rowH = spacing * 0.866; // hex grid vertical spacing
    let row = 0;
    for (let y = minY; y <= maxY + spacing; y += rowH) {
        const xOff = (row % 2) * spacing * 0.5;
        for (let x = minX + xOff; x <= maxX + spacing; x += spacing) {
            ctx.beginPath();
            ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
            ctx.fill();
        }
        row++;
    }
}

function _renderChevrons(ctx, minX, minY, maxX, maxY, params) {
    const { spacing } = params;
    const chevH = spacing * 0.8;
    const chevW = spacing * 1.2;

    ctx.beginPath();
    for (let y = minY; y <= maxY + spacing; y += spacing) {
        for (let x = minX; x <= maxX + chevW; x += chevW) {
            ctx.moveTo(x, y);
            ctx.lineTo(x + chevW * 0.5, y - chevH * 0.5);
            ctx.lineTo(x + chevW, y);
        }
    }
    ctx.stroke();
}

function _renderScales(ctx, minX, minY, maxX, maxY, params) {
    const { spacing } = params;
    const scaleW = spacing * 1.2;
    const scaleH = spacing * 0.7;
    let row = 0;

    ctx.beginPath();
    for (let y = minY; y <= maxY + spacing; y += scaleH * 0.8) {
        const xOff = (row % 2) * scaleW * 0.5;
        for (let x = minX + xOff - scaleW; x <= maxX + scaleW; x += scaleW) {
            ctx.moveTo(x + scaleW, y);
            ctx.arc(x + scaleW * 0.5, y, scaleW * 0.5, 0, Math.PI);
        }
        row++;
    }
    ctx.stroke();
}

function _derivePatternColor(baseColor) {
    // Parse rgb/hsl string; fallback to a slightly brighter version
    const m = baseColor.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) {
        const r = Math.min(255, parseInt(m[1]) + 40);
        const g = Math.min(255, parseInt(m[2]) + 40);
        const b = Math.min(255, parseInt(m[3]) + 40);
        return `rgb(${r},${g},${b})`;
    }
    return 'rgba(200,200,200,0.5)';
}
