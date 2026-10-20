/**
 * Daily Block
 *
 * One Rare-or-better block per calendar day, taken from the schedule written
 * by scripts/build-daily.js, so every device gets the same block on the same
 * date. The run is timed from a countdown until the block is on screen; each
 * revealed step of the quickest route adds a time penalty.
 *
 * States: ready -> countdown -> running -> finished | gaveup
 */

const STORAGE_KEY = 'mcfractal.daily';
const DAY_MS = 86400000;
export const STEP_PENALTY = 30000;

/**
 * Days since 1970-01-01 for the local calendar date
 */
function dayNumber(date = new Date()) {
    return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

export class DailyChallenge {
    /**
     * @param {object} deps
     * @param {import('./ScavengerHunt.js').ScavengerHunt} deps.hunt
     * @param {import('./ZoomPanController.js').ZoomPanController} deps.zoomController
     * @param {import('./DiscoveryOutlines.js').DiscoveryOutlines} deps.outlines
     * @param {{ start: string, blocks: string[] }} deps.schedule - Contents of daily.json
     */
    constructor({ hunt, zoomController, outlines, schedule }) {
        this.hunt = hunt;
        this.graph = hunt.graph;
        this.lut = hunt.lut;
        this.zoomController = zoomController;
        this.outlines = outlines;

        this.startDay = Math.floor(Date.parse(schedule.start) / DAY_MS);
        this.schedule = schedule.blocks
            .map((name) => this.lut.blockToId.get(name))
            .filter((id) => id !== undefined && this.graph.isReachable(id));

        this.run = null;     // { day, target, state, startedAt, revealed, time }
        this.history = {};   // day -> { time, revealed } or { gaveUp: true }
        this.listeners = {};
        this.load();

        hunt.on('seen', (id) => {
            if (this.state === 'running' && id === this.run.target) this.finish();
        });
        if (this.state === 'running') hunt.watch(this.run.target);
    }

    on(event, fn) {
        (this.listeners[event] ??= []).push(fn);
    }

    emit(event, ...args) {
        for (const fn of this.listeners[event] ?? []) fn(...args);
    }

    /**
     * The current run, if it belongs to today or is still in progress
     */
    activeRun() {
        if (!this.run) return null;
        if (this.run.day === dayNumber() || this.run.state === 'running' || this.run.state === 'countdown') {
            return this.run;
        }
        return null;
    }

    get state() {
        return this.activeRun()?.state ?? 'ready';
    }

    /**
     * Puzzle for the active run, or for today
     * @returns {{ day: number, number: number, target: number }}
     */
    puzzle() {
        const run = this.activeRun();
        const day = run ? run.day : dayNumber();
        const offset = day - this.startDay;
        const n = this.schedule.length;
        const target = run ? run.target : this.schedule[((offset % n) + n) % n];
        return { day, number: offset + 1, target };
    }

    /**
     * Quickest route from the root to today's block (same for every player)
     */
    route() {
        return this.graph.route(this.puzzle().target);
    }

    /**
     * Number of intermediate route steps that can be revealed
     */
    get stepCount() {
        return this.route().length - 2;
    }

    get revealed() {
        return this.activeRun()?.revealed ?? 0;
    }

    get penalty() {
        return this.revealed * STEP_PENALTY;
    }

    /**
     * Milliseconds on the clock, including penalties
     */
    elapsed() {
        const run = this.activeRun();
        if (!run) return 0;
        if (run.state === 'running') return Date.now() - run.startedAt + this.penalty;
        if (run.state === 'finished') return run.time;
        return 0;
    }

    msUntilTomorrow() {
        const now = new Date();
        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        return midnight - now;
    }

    /**
     * Consecutive days finished, counting back from today (or yesterday if
     * today isn't done yet)
     */
    streak() {
        let day = dayNumber();
        if (!this.history[day]?.time) day--;
        let streak = 0;
        while (this.history[day]?.time) {
            streak++;
            day--;
        }
        return streak;
    }

    /**
     * Reset the view and begin the countdown; the UI calls begin() when it ends
     */
    start() {
        if (this.state !== 'ready') return;
        const { day, target } = this.puzzle();
        this.run = { day, target, state: 'countdown', startedAt: 0, revealed: 0, time: 0 };
        this.zoomController.reset();
        this.emit('state', 'countdown');
    }

    begin() {
        if (this.state !== 'countdown') return;
        this.run.state = 'running';
        this.run.startedAt = Date.now();
        this.hunt.watch(this.run.target);
        this.save();
        this.emit('state', 'running');
    }

    revealStep() {
        if (this.state !== 'running' || this.run.revealed >= this.stepCount) return;
        this.run.revealed++;
        this.save();
        this.emit('reveal', this.run.revealed);
    }

    giveUp() {
        if (this.state !== 'running') return;
        this.run.state = 'gaveup';
        this.history[this.run.day] = { gaveUp: true };
        this.hunt.watch(-1);
        this.save();
        this.emit('state', 'gaveup');
    }

    finish() {
        const run = this.run;
        run.time = this.elapsed();
        run.state = 'finished';
        this.history[run.day] = { time: run.time, revealed: run.revealed };
        this.hunt.watch(-1);
        this.save();

        const color = parseInt(this.graph.rarity(run.target).color.slice(1), 16);
        this.outlines.flash(run.target, color);
        this.emit('state', 'finished');
        this.emit('finish', this.result());
    }

    result() {
        const { number, target } = this.puzzle();
        const run = this.activeRun();
        return {
            number,
            target,
            time: run?.time ?? 0,
            revealed: run?.revealed ?? 0,
            steps: this.stepCount,
            penalty: this.penalty,
            streak: this.streak(),
        };
    }

    save() {
        const run = this.run && this.run.state !== 'countdown'
            ? { ...this.run, target: this.lut.getBlockName(this.run.target) }
            : null;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ run, history: this.history }));
    }

    load() {
        let saved;
        try {
            saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        } catch {
            saved = null;
        }
        if (!saved) return;
        this.history = saved.history ?? {};
        const target = saved.run && this.lut.blockToId.get(saved.run.target);
        if (target !== undefined && target !== null) this.run = { ...saved.run, target };
    }
}
