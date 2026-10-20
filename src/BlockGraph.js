/**
 * Block Graph
 *
 * Derives the "which block contains which" graph from the LUT.
 * An edge A -> B exists when at least one pixel of A maps to B, i.e. B
 * appears when zooming into A. Distance is the minimum number of zoom
 * levels needed to reach a block from the root.
 */

// Rarity tiers by distance from the root block (Minecraft item rarity colors)
export const RARITIES = [
    { key: 'common', label: 'Common', color: '#FFFFFF', maxDistance: 2 },
    { key: 'uncommon', label: 'Uncommon', color: '#FFFF55', maxDistance: 4 },
    { key: 'rare', label: 'Rare', color: '#55FFFF', maxDistance: 6 },
    { key: 'epic', label: 'Epic', color: '#FF55FF', maxDistance: 8 },
    { key: 'legendary', label: 'Legendary', color: '#FFAA00', maxDistance: Infinity },
];

export function rarityForDistance(distance) {
    return RARITIES.find((r) => distance <= r.maxDistance);
}

export class BlockGraph {
    /**
     * @param {import('./LUTDecoder.js').LUTDecoder} lut
     * @param {number} rootId - Block the fractal starts from
     */
    constructor(lut, rootId) {
        this.lut = lut;
        this.rootId = rootId;
        const count = lut.blockCount;

        // parents[b] = Map(parentId -> number of parent pixels that become b)
        this.parents = Array.from({ length: count }, () => new Map());
        this.children = Array.from({ length: count }, () => new Set());
        for (let a = 0; a < count; a++) {
            for (let i = 0; i < 256; i++) {
                const b = lut.lut[a * 256 + i];
                this.children[a].add(b);
                this.parents[b].set(a, (this.parents[b].get(a) ?? 0) + 1);
            }
        }

        // BFS from the root
        this.distance = new Int16Array(count).fill(-1);
        this.distance[rootId] = 0;
        const queue = [rootId];
        for (let head = 0; head < queue.length; head++) {
            const a = queue[head];
            for (const b of this.children[a]) {
                if (this.distance[b] === -1) {
                    this.distance[b] = this.distance[a] + 1;
                    queue.push(b);
                }
            }
        }

        const byDistanceThenName = (a, b) =>
            this.distance[a] - this.distance[b] || lut.getBlockName(a).localeCompare(lut.getBlockName(b));
        const all = Array.from({ length: count }, (_, i) => i);
        this.reachable = all.filter((id) => this.distance[id] >= 0).sort(byDistanceThenName);
        this.unreachable = all.filter((id) => this.distance[id] < 0)
            .sort((a, b) => lut.getBlockName(a).localeCompare(lut.getBlockName(b)));
        this.maxDistance = this.distance[this.reachable[this.reachable.length - 1]];
    }

    isReachable(id) {
        return this.distance[id] >= 0;
    }

    rarity(id) {
        return rarityForDistance(this.distance[id]);
    }

    /**
     * Reachable blocks that contain `id`, best leads first: blocks the player has
     * already found, then those closer to the root, then those with more matching pixels.
     * @param {number} id
     * @param {(id: number) => boolean} isFound
     */
    sources(id, isFound = () => false) {
        return [...this.parents[id]]
            .filter(([parent]) => parent !== id && this.isReachable(parent))
            .map(([parent, pixels]) => ({ id: parent, pixels, found: isFound(parent) }))
            .sort((a, b) =>
                (b.found - a.found) ||
                (this.distance[a.id] - this.distance[b.id]) ||
                (b.pixels - a.pixels));
    }

    /**
     * Shortest zoom route from the root to `id`, preferring blocks already found.
     * @returns {number[]} Block IDs from root to target (inclusive)
     */
    route(id, isFound = () => false) {
        if (!this.isReachable(id)) return [];
        const path = [id];
        let current = id;
        while (current !== this.rootId) {
            const want = this.distance[current] - 1;
            let best = -1;
            let bestScore = -Infinity;
            for (const [parent, pixels] of this.parents[current]) {
                if (this.distance[parent] !== want) continue;
                const score = (isFound(parent) ? 1000 : 0) + pixels;
                if (score > bestScore) {
                    bestScore = score;
                    best = parent;
                }
            }
            current = best;
            path.push(current);
        }
        return path.reverse();
    }

    /**
     * Which of `parent`'s 256 pixels become `child` (row-major booleans)
     */
    pixelMask(parent, child) {
        const mask = new Array(256);
        for (let i = 0; i < 256; i++) {
            mask[i] = this.lut.lut[parent * 256 + i] === child;
        }
        return mask;
    }
}
