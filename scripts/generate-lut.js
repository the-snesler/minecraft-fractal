/**
 * LUT (Lookup Table) Generator
 *
 * Pre-computes which block each pixel of every block maps to,
 * based on color matching. This eliminates runtime color matching
 * and enables O(1) fractal lookups.
 *
 * Output: dist/blockLUT.bin (binary) + dist/blockLUT.json (metadata)
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const BLOCK_DIR = './block';
const BLOCK_DATA_PATH = './dist/blockData.json';
const OUTPUT_DIR = './dist';
const OUTPUT_BIN = path.join(OUTPUT_DIR, 'blockLUT.bin');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'blockLUT.json');

// Color distance using Euclidean distance in RGB space
function colorDistance(c1, c2) {
    const dr = c1[0] - c2[0];
    const dg = c1[1] - c2[1];
    const db = c1[2] - c2[2];
    return dr * dr + dg * dg + db * db;
}

// Simple k-d tree for fast nearest neighbor search
class KDTree {
    constructor(points) {
        this.root = this.buildTree(points, 0);
    }

    buildTree(points, depth) {
        if (points.length === 0) return null;
        if (points.length === 1) return { point: points[0], left: null, right: null };

        const axis = depth % 3;
        points.sort((a, b) => a.color[axis] - b.color[axis]);
        const mid = Math.floor(points.length / 2);

        return {
            point: points[mid],
            axis,
            left: this.buildTree(points.slice(0, mid), depth + 1),
            right: this.buildTree(points.slice(mid + 1), depth + 1),
        };
    }

    nearest(target) {
        let best = null;
        let bestDist = Infinity;

        const search = (node, depth) => {
            if (!node) return;

            const dist = colorDistance(node.point.color, target);
            if (dist < bestDist) {
                bestDist = dist;
                best = node.point;
            }

            const axis = depth % 3;
            const diff = target[axis] - node.point.color[axis];
            const first = diff < 0 ? node.left : node.right;
            const second = diff < 0 ? node.right : node.left;

            search(first, depth + 1);

            // Check if we need to search the other side
            if (diff * diff < bestDist) {
                search(second, depth + 1);
            }
        };

        search(this.root, 0);
        return best;
    }
}

async function loadBlockPixels(blockName) {
    const filePath = path.join(BLOCK_DIR, `${blockName}.png`);
    const { data, info } = await sharp(filePath)
        .raw()
        .toBuffer({ resolveWithObject: true });

    const pixels = [];
    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
            const idx = (y * info.width + x) * info.channels;
            pixels.push([data[idx], data[idx + 1], data[idx + 2]]);
        }
    }
    return pixels;
}

async function main() {
    console.log('Loading block data...');
    const blockData = JSON.parse(fs.readFileSync(BLOCK_DATA_PATH, 'utf-8'));
    const blockNames = Object.keys(blockData);
    const blockCount = blockNames.length;

    console.log(`Found ${blockCount} blocks`);

    // Create block ID mapping
    const blockToId = new Map();
    blockNames.forEach((name, id) => blockToId.set(name, id));

    // Build k-d tree for fast color lookup
    console.log('Building color search tree...');
    const colorPoints = blockNames.map((name, id) => ({
        id,
        name,
        color: blockData[name].color,
    }));
    const kdTree = new KDTree(colorPoints);

    // Allocate LUT (blockCount * 256 entries, 2 bytes each)
    const lut = new Uint16Array(blockCount * 256);

    console.log('Generating LUT...');
    let processed = 0;

    for (const blockName of blockNames) {
        const blockId = blockToId.get(blockName);
        const pixels = await loadBlockPixels(blockName);

        for (let i = 0; i < 256; i++) {
            const pixel = pixels[i];
            const nearest = kdTree.nearest(pixel);
            lut[blockId * 256 + i] = nearest.id;
        }

        processed++;
        if (processed % 50 === 0) {
            console.log(`  Processed ${processed}/${blockCount} blocks...`);
        }
    }

    // Create output directory
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Write binary LUT file
    // Format:
    //   Header: "MCLUT" (5 bytes) + version (1 byte) + blockCount (2 bytes LE)
    //   Block names: [length (1 byte) + name (utf8)] for each block
    //   LUT data: Uint16Array (blockCount * 256 * 2 bytes)

    const MAGIC = Buffer.from('MCLUT');
    const VERSION = 1;

    // Calculate block names section size
    let namesSize = 0;
    for (const name of blockNames) {
        namesSize += 1 + Buffer.byteLength(name, 'utf-8');
    }

    const headerSize = 8; // MCLUT(5) + version(1) + count(2)
    const lutDataSize = blockCount * 256 * 2;
    const totalSize = headerSize + namesSize + lutDataSize;

    const buffer = Buffer.alloc(totalSize);
    let offset = 0;

    // Write header
    MAGIC.copy(buffer, offset); offset += 5;
    buffer.writeUInt8(VERSION, offset); offset += 1;
    buffer.writeUInt16LE(blockCount, offset); offset += 2;

    // Write block names
    for (const name of blockNames) {
        const nameBytes = Buffer.from(name, 'utf-8');
        buffer.writeUInt8(nameBytes.length, offset); offset += 1;
        nameBytes.copy(buffer, offset); offset += nameBytes.length;
    }

    // Write LUT data
    Buffer.from(lut.buffer).copy(buffer, offset);

    fs.writeFileSync(OUTPUT_BIN, buffer);
    console.log(`Written ${OUTPUT_BIN} (${(totalSize / 1024).toFixed(1)} KB)`);

    // Also write JSON metadata for debugging/reference
    const metadata = {
        version: VERSION,
        blockCount,
        blocks: blockNames,
        blockToId: Object.fromEntries(blockToId),
    };
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(metadata, null, 2));
    console.log(`Written ${OUTPUT_JSON}`);

    console.log('LUT generation complete!');
}

main().catch(console.error);
