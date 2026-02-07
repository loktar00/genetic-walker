import World from '../verlet/World.js';

export default class HUD {
    constructor(simManager) {
        this.sim = simManager;
        this.paused = false;
    }

    render() {
        const ctx = World.ctx;
        const w = World.bounds.width;
        const sim = this.sim;

        ctx.save();
        ctx.font = '13px monospace';

        // Semi-transparent background bar at top
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, w, 28);

        // Top-left: Gen | Alive | Time
        const alive = sim.bodies.filter((_, i) => !sim.bodyStates[i].finished).length;
        const total = sim.bodies.length;
        const timeStr = sim.elapsedTime.toFixed(1);
        const timeDisplay = sim.config.evalTime === Infinity
            ? `Time: ${timeStr}s`
            : `Time: ${timeStr}s/${sim.config.evalTime}s`;

        ctx.fillStyle = '#0f0';
        ctx.textAlign = 'left';
        ctx.fillText(
            `Gen: ${sim.generation}  |  Alive: ${alive}/${total}  |  ${timeDisplay}`,
            8, 18
        );

        // Top-right: Speed + Pause
        ctx.textAlign = 'right';
        const speedLabel = this.paused ? 'PAUSED' : `${World.speedMultiplier}x`;
        ctx.fillStyle = this.paused ? '#f55' : '#0f0';
        ctx.fillText(`[${speedLabel}]`, w - 8, 18);

        // Bottom bar background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, World.bounds.height - 50, w, 50);

        // Bottom-left: Current best + All-time best + stagnation
        const genBest = sim.getGenBestFitness();
        const allTimeBest = sim.bestFitness;
        const stag = sim.stagnationGen;
        ctx.textAlign = 'left';
        ctx.fillStyle = stag >= 5 ? '#f55' : '#ff0';
        let bottomText = `Gen best: ${Math.round(genBest)}px  |  All-time: ${Math.round(allTimeBest)}px`;
        if (stag > 0) bottomText += `  |  Stag: ${stag}`;
        if (stag >= 5) bottomText += ' (boosted)';
        ctx.fillText(bottomText, 8, World.bounds.height - 30);

        // Bottom-right: Mini fitness history bar chart
        this._renderHistoryChart(ctx, w - 160, World.bounds.height - 45, 150, 35);

        // Center: stall countdowns for active creatures
        this._renderStallCountdowns(ctx);

        ctx.restore();
    }

    _renderHistoryChart(ctx, x, y, w, h) {
        const history = this.sim.history;
        if (history.length === 0) return;

        // Show last 20 generations
        const show = history.slice(-20);
        const maxFit = Math.max(...show.map(h => h.best), 1);
        const barW = w / show.length;

        ctx.fillStyle = '#333';
        ctx.fillRect(x, y, w, h);

        for (let i = 0; i < show.length; i++) {
            const barH = (show[i].best / maxFit) * (h - 4);
            ctx.fillStyle = `hsl(${120 * (show[i].best / maxFit)}, 80%, 50%)`;
            ctx.fillRect(
                x + i * barW + 1,
                y + h - barH - 2,
                Math.max(barW - 2, 1),
                barH
            );
        }

        ctx.fillStyle = '#aaa';
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('fitness/gen', x + 2, y + 10);
    }

    _renderStallCountdowns(ctx) {
        const sim = this.sim;
        for (let i = 0; i < sim.bodies.length; i++) {
            const state = sim.bodyStates[i];
            if (state.stallCountdown !== null && !state.finished) {
                const body = sim.bodies[i];
                const com = body.getCOM();
                // Convert to screen space
                const sx = com.x - World.cameraX;
                const sy = com.y - 20;

                ctx.save();
                ctx.font = 'bold 16px monospace';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#f55';
                ctx.fillText(Math.ceil(state.stallCountdown).toString(), sx, sy);
                ctx.restore();
            }
        }
    }

    handleClick(x, y) {
        const w = World.bounds.width;
        // Check if clicking speed/pause area (top-right)
        if (y < 28 && x > w - 100) {
            this.paused = !this.paused;
            return true;
        }
        return false;
    }
}
