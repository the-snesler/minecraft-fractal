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

    // Calculate grid size (18px cells = 16px block + 1px padding on each side)
    const CELL_SIZE = 16;
    const PADDING = 1;
    const PADDED_CELL = CELL_SIZE + PADDING * 2;
    const gridWidth = Math.ceil(Math.sqrt(blockCount));
    const gridHeight = Math.ceil(blockCount / gridWidth);
    const atlasWidth = nextPowerOfTwo(gridWidth * PADDED_CELL);
    const atlasHeight = nextPowerOfTwo(gridHeight * PADDED_CELL);

    console.log(`Atlas size: ${atlasWidth}x${atlasHeight} (${gridWidth}x${gridHeight} grid, ${PADDING}px padding)`);

    // Create composite operations
    // Each block gets 1px padding filled by clamping (repeating edge pixels)
    const composites = [];
    const blocks = {};

    for (let i = 0; i < blockNames.length; i++) {
        const name = blockNames[i];
        const cellX = (i % gridWidth) * PADDED_CELL;
        const cellY = Math.floor(i / gridWidth) * PADDED_CELL;
        const blockFile = path.join(BLOCK_DIR, `${name}.png`);

        // Extend the block by 1px on each side using sharp's extend with edge clamping
        const padded = await sharp(blockFile)
            .extend({
                top: PADDING,
                bottom: PADDING,
                left: PADDING,
                right: PADDING,
                extendWith: 'copy',
            })
            .toBuffer();

        composites.push({
            input: padded,
            left: cellX,
            top: cellY,
        });

        // The actual frame starts inside the padding
        const x = cellX + PADDING;
        const y = cellY + PADDING;
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

    // Write metadata in PixiJS Spritesheet format
    const frames = {};
    for (const [name, info] of Object.entries(blocks)) {
        frames[name] = {
            frame: { x: info.x, y: info.y, w: 16, h: 16 },
            sourceSize: { w: 16, h: 16 },
            spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
        };
    }

    const metadata = {
        frames,
        meta: {
            image: 'atlas.png',
            size: { w: atlasWidth, h: atlasHeight },
            scale: 1,
        },
        // Custom fields for our app
        blockCount,
        blocks,
    };

    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(metadata, null, 2));
    console.log(`Written ${OUTPUT_JSON}`);

    console.log('Atlas generation complete!');
}

main().catch(console.error);
