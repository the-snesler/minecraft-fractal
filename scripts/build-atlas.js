/**
 * Texture Atlas Builder
 *
 * Combines all block textures into a single texture atlas
 * for efficient GPU rendering with PixiJS.
 *
 * Output: dist/atlas.png + dist/atlas.json
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const BLOCK_DIR = './block';
const BLOCK_DATA_PATH = './dist/blockData.json';
const OUTPUT_DIR = './dist';
const OUTPUT_PNG = path.join(OUTPUT_DIR, 'atlas.png');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'atlas.json');

// Round up to next power of 2
function nextPowerOfTwo(n) {
    return Math.pow(2, Math.ceil(Math.log2(n)));
}

async function main() {
    console.log('Loading block data...');
    const blockData = JSON.parse(fs.readFileSync(BLOCK_DATA_PATH, 'utf-8'));
    const blockNames = Object.keys(blockData);
    const blockCount = blockNames.length;

    console.log(`Found ${blockCount} blocks`);

    // Calculate grid size
    const gridWidth = Math.ceil(Math.sqrt(blockCount));
    const gridHeight = Math.ceil(blockCount / gridWidth);
    const atlasWidth = nextPowerOfTwo(gridWidth * 16);
    const atlasHeight = nextPowerOfTwo(gridHeight * 16);

    console.log(`Atlas size: ${atlasWidth}x${atlasHeight} (${gridWidth}x${gridHeight} grid)`);

    // Create composite operations
    const composites = [];
    const blocks = {};

    for (let i = 0; i < blockNames.length; i++) {
        const name = blockNames[i];
        const x = (i % gridWidth) * 16;
        const y = Math.floor(i / gridWidth) * 16;

        composites.push({
            input: path.join(BLOCK_DIR, `${name}.png`),
            left: x,
            top: y,
        });

        blocks[name] = { x, y, id: i };
    }

    // Create output directory
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Create atlas
    console.log('Compositing atlas...');
    await sharp({
        create: {
            width: atlasWidth,
            height: atlasHeight,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    })
        .composite(composites)
        .png()
        .toFile(OUTPUT_PNG);

    console.log(`Written ${OUTPUT_PNG}`);

    // Write metadata
    const metadata = {
        size: { width: atlasWidth, height: atlasHeight },
        cellSize: 16,
        gridWidth,
        gridHeight,
        blockCount,
        blocks,
    };

    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(metadata, null, 2));
    console.log(`Written ${OUTPUT_JSON}`);

    console.log('Atlas generation complete!');
}

main().catch(console.error);
