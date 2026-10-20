/**
 * Block Graph Report
 *
 * Prints every block reachable from the root block, grouped by how many
 * zoom levels deep it first appears, plus the blocks that can never appear.
 * Uses the same graph code as the in-game block hunt.
 *
 * Usage: node scripts/block-graph.js [--json]
 */

import fs from 'fs';
import { LUTDecoder } from '../src/LUTDecoder.js';
import { BlockGraph, rarityForDistance } from '../src/BlockGraph.js';
import { displayName } from '../src/blockNames.js';
import { CONFIG } from '../src/config.js';

const LUT_PATH = './dist/blockLUT.bin';

const file = fs.readFileSync(LUT_PATH);
const lut = new LUTDecoder();
lut.parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

const graph = new BlockGraph(lut, lut.getBlockId(CONFIG.rootBlock));
const name = (id) => lut.getBlockName(id);

function printJson() {
    const blocks = graph.reachable.map((id) => ({
        name: name(id),
        displayName: displayName(name(id)),
        distance: graph.distance[id],
        rarity: graph.rarity(id).key,
        sources: graph.sources(id).map((s) => ({ name: name(s.id), pixels: s.pixels })),
    }));
    console.log(JSON.stringify({ root: CONFIG.rootBlock, blocks, unreachable: graph.unreachable.map(name) }, null, 2));
}

function printReport() {
    console.log(`Root: ${CONFIG.rootBlock}`);
    console.log(`${graph.reachable.length} of ${lut.blockCount} blocks reachable, up to ${graph.maxDistance} zooms deep\n`);

    for (let d = 0; d <= graph.maxDistance; d++) {
        const ids = graph.reachable.filter((id) => graph.distance[id] === d);
        console.log(`Depth ${d} - ${rarityForDistance(d).label} (${ids.length})`);
        for (const id of ids) {
            const via = graph.sources(id)
                .filter((s) => graph.distance[s.id] === d - 1)
                .slice(0, 3)
                .map((s) => name(s.id));
            console.log(`  ${displayName(name(id)).padEnd(44)} ${name(id).padEnd(44)} ${via.length ? 'via ' + via.join(', ') : ''}`);
        }
        console.log('');
    }

    console.log(`Unreachable (${graph.unreachable.length})`);
    for (const id of graph.unreachable) {
        console.log(`  ${displayName(name(id)).padEnd(44)} ${name(id)}`);
    }
}

if (process.argv.includes('--json')) {
    printJson();
} else {
    printReport();
}
