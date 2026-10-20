/**
 * Daily Block Schedule
 *
 * Writes a fixed pseudo-random order of every Rare-or-better block. The app
 * indexes into it by calendar day (counted from START), so every device picks
 * the same daily block. The shuffle is seeded and runs over the sorted names,
 * so rebuilding with the same textures gives the same schedule.
 *
 * Output: dist/daily.json
 */

import fs from 'fs';
import path from 'path';
import { LUTDecoder } from '../src/LUTDecoder.js';
import { BlockGraph, RARITIES } from '../src/BlockGraph.js';
import { CONFIG } from '../src/config.js';

const LUT_PATH = './dist/blockLUT.bin';
const OUTPUT_DIR = './dist';
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'daily.json');

// Daily Block #1
const START = '2026-10-20';
const SEED = 0x6d63626b;
const MIN_RARITY = RARITIES.findIndex((r) => r.key === 'rare');

// Small deterministic PRNG (mulberry32)
function mulberry32(seed) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const file = fs.readFileSync(LUT_PATH);
const lut = new LUTDecoder();
lut.parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const graph = new BlockGraph(lut, lut.getBlockId(CONFIG.rootBlock));

const blocks = graph.reachable
    .filter((id) => RARITIES.indexOf(graph.rarity(id)) >= MIN_RARITY)
    .map((id) => lut.getBlockName(id))
    .sort();

// Fisher-Yates
const random = mulberry32(SEED);
for (let i = blocks.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_JSON, JSON.stringify({ start: START, blocks }, null, 2));
console.log(`Written ${OUTPUT_JSON} (${blocks.length} daily blocks, repeating every ${blocks.length} days)`);
