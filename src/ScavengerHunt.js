/**
 * Scavenger Hunt
 *
 * Always-on collection of every block reachable from the root block.
 * A block counts as found once the center of any copy of it is on screen
 * in a layer that is at least half opaque.
 *
 * Progress is saved to localStorage by block name (IDs change between builds).
 * The clock starts at the first find and is only shown once everything is found.
 */

import { RARITIES } from './BlockGraph.js';

const STORAGE_KEY = 'mcfractal.collection';
const OUTLINES_KEY = 'mcfractal.outlines';

// A crossfading layer must be at least this opaque before its blocks count
const MIN_LAYER_ALPHA = 0.5;

export class ScavengerHunt {
    /**
     * @param {object} deps
     * @param {import('./BlockGraph.js').BlockGraph} deps.graph
     * @param {import('./LUTDecoder.js').LUTDecoder} deps.lut
     * @param {import('./FractalLayerManager.js').FractalLayerManager} deps.layerManager
     * @param {import('./DiscoveryOutlines.js').DiscoveryOutlines} deps.outlines
     */
    constructor({ graph, lut, layerManager, outlines }) {
        this.graph = graph;
        this.lut = lut;
        this.layerManager = layerManager;
        this.outlines = outlines;

        this.total = graph.reachable.length;
        this.tierTotals = Object.fromEntries(RARITIES.map((r) => [r.key, 0]));
        for (const id of graph.reachable) this.tierTotals[graph.rarity(id).key]++;

        this.outlinesEnabled = localStorage.getItem(OUTLINES_KEY) === '1';

        // Screen area hidden behind UI (e.g. the collection panel); blocks there don't count
        this.occludedRight = 0;

        // Block that emits 'seen' whenever it's visible (used by the daily block)
        this.watchedId = -1;

        this.listeners = {};
        this.clear();
        this.load();
    }

    clear() {
        this.foundAt = new Float64Array(this.lut.blockCount).fill(-1); // ms after the first find
        this.foundCount = 0;
        this.tierFound = Object.fromEntries(RARITIES.map((r) => [r.key, 0]));
        this.sourceHints = new Set(); // blocks whose containing blocks were revealed
        this.routeHints = new Set();  // blocks whose quickest route was revealed
        this.startedAt = 0;
        this.completedAt = 0;
        this.dirty = false;
    }

    on(event, fn) {
        (this.listeners[event] ??= []).push(fn);
    }

    emit(event, ...args) {
        for (const fn of this.listeners[event] ?? []) fn(...args);
    }

    get complete() {
        return this.completedAt > 0;
    }

    get hintCount() {
        return this.sourceHints.size + this.routeHints.size;
    }

    /**
     * Milliseconds from the first find to the last one (or to now)
     */
    elapsed() {
        if (!this.startedAt) return 0;
        return (this.completedAt || Date.now()) - this.startedAt;
    }

    isFound(id) {
        return this.foundAt[id] >= 0;
    }

    hasSourceHint(id) {
        return this.sourceHints.has(id);
    }

    hasRouteHint(id) {
        return this.routeHints.has(id);
    }

    revealSources(id) {
        if (this.isFound(id) || this.sourceHints.has(id)) return;
        this.sourceHints.add(id);
        this.save();
        this.emit('hint', id);
    }

    revealRoute(id) {
        if (this.isFound(id) || this.routeHints.has(id)) return;
        this.routeHints.add(id);
        this.save();
        this.emit('hint', id);
    }

    setOutlinesEnabled(enabled) {
        this.outlinesEnabled = enabled;
        localStorage.setItem(OUTLINES_KEY, enabled ? '1' : '0');
        if (!enabled) this.outlines.clear();
    }

    watch(id) {
        this.watchedId = id;
    }

    /**
     * Forget all progress
     */
    reset() {
        this.clear();
        this.outlines.clear();
        localStorage.removeItem(STORAGE_KEY);
        this.emit('reset');
    }

    /**
     * Per-frame: mark on-screen blocks as found and draw discovery outlines.
     * Must run after the layer manager has rendered this frame.
     */
    update() {
        const { screenWidth, screenHeight } = this.layerManager;
        const right = screenWidth - this.occludedRight;
        const outlines = this.outlines;
        outlines.beginFrame(performance.now());

        let watchedSeen = false;
        const visit = (id, x, y, size) => {
            if (this.foundAt[id] < 0 && this.graph.isReachable(id)) this.discover(id);
            if (id === this.watchedId) watchedSeen = true;
            if (outlines.isFlashing(id)) outlines.draw(id, x, y, size);
        };

        for (const { layer, alpha } of this.layerManager.visibleLayers) {
            if (alpha < MIN_LAYER_ALPHA) continue;
            layer.forEachInRect(0, 0, right, screenHeight, visit);
        }
        outlines.endFrame();

        if (watchedSeen) this.emit('seen', this.watchedId);
        if (this.dirty) this.save();
    }

    discover(id) {
        if (!this.startedAt) this.startedAt = Date.now();
        const time = Date.now() - this.startedAt;
        const rarity = this.graph.rarity(id);
        this.foundAt[id] = time;
        this.foundCount++;
        this.tierFound[rarity.key]++;
        this.dirty = true;

        if (this.outlinesEnabled) this.outlines.flash(id, parseInt(rarity.color.slice(1), 16));
        this.emit('discover', id, time);

        if (this.tierFound[rarity.key] === this.tierTotals[rarity.key]) {
            this.emit('tier', rarity, time);
        }
        if (this.foundCount === this.total) {
            this.completedAt = Date.now();
            this.emit('complete', this.results());
        }
    }

    results() {
        // Time at which each rarity tier was completed
        const splits = RARITIES.map((rarity) => {
            let time = 0;
            for (const id of this.graph.reachable) {
                if (this.graph.rarity(id) === rarity) time = Math.max(time, this.foundAt[id]);
            }
            return { rarity, time, total: this.tierTotals[rarity.key] };
        }).filter((split) => split.total > 0);

        let lastFound = this.graph.rootId;
        for (const id of this.graph.reachable) {
            if (this.foundAt[id] > this.foundAt[lastFound]) lastFound = id;
        }

        return { time: this.elapsed(), hints: this.hintCount, total: this.total, splits, lastFound };
    }

    save() {
        this.dirty = false;
        const found = [];
        for (const id of this.graph.reachable) {
            if (this.foundAt[id] >= 0) found.push([this.lut.getBlockName(id), this.foundAt[id]]);
        }
        const names = (ids) => [...ids].map((id) => this.lut.getBlockName(id));
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            startedAt: this.startedAt,
            completedAt: this.completedAt,
            found,
            sourceHints: names(this.sourceHints),
            routeHints: names(this.routeHints),
        }));
    }

    /**
     * Restore saved progress. Blocks that no longer exist in this build are
     * dropped, so progress carries over when the textures change.
     */
    load() {
        let saved;
        try {
            saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        } catch {
            saved = null;
        }
        if (!saved) return;

        const idOf = (name) => {
            const id = this.lut.blockToId.get(name);
            return id !== undefined && this.graph.isReachable(id) ? id : undefined;
        };

        this.startedAt = saved.startedAt ?? 0;
        for (const [name, time] of saved.found ?? []) {
            const id = idOf(name);
            if (id === undefined || this.foundAt[id] >= 0) continue;
            this.foundAt[id] = time;
            this.foundCount++;
            this.tierFound[this.graph.rarity(id).key]++;
        }
        for (const name of saved.sourceHints ?? []) {
            const id = idOf(name);
            if (id !== undefined) this.sourceHints.add(id);
        }
        for (const name of saved.routeHints ?? []) {
            const id = idOf(name);
            if (id !== undefined) this.routeHints.add(id);
        }
        // A new build may have added blocks to a finished collection
        this.completedAt = this.foundCount === this.total ? (saved.completedAt || Date.now()) : 0;
    }
}
