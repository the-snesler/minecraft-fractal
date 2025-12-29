/**
 * Fractal Layer
 *
 * Renders a single fractal level using sprite pooling.
 * Coordinates are in "current depth" space.
 */

import * as PIXI from 'pixi.js';
import { CONFIG } from './config.js';

export class FractalLayer {
    constructor(atlas, lut, atlasMeta) {
        this.atlas = atlas;
        this.lut = lut;
        this.meta = atlasMeta;

        // Main container
        this.container = new PIXI.Container();

        // Texture cache (block ID -> PIXI.Texture)
        this.textureCache = new Map();
        this.buildTextureCache();

        // Sprite pool
        this.sprites = [];
        this.activeCount = 0;

        // Block resolution cache
        this.blockCache = new Map();
        this.maxCacheSize = 50000;
    }

    buildTextureCache() {
        const { blocks } = this.meta;
        for (const [name, info] of Object.entries(blocks)) {
            const rect = new PIXI.Rectangle(info.x, info.y, 16, 16);
            const texture = new PIXI.Texture({ source: this.atlas.source, frame: rect });
            this.textureCache.set(info.id, texture);
        }
    }

    getTexture(blockId) {
        return this.textureCache.get(blockId) ?? this.textureCache.get(0);
    }

    ensurePoolSize(count) {
        while (this.sprites.length < count) {
            const sprite = new PIXI.Sprite();
            sprite.visible = false;
            this.container.addChild(sprite);
            this.sprites.push(sprite);
        }
    }

    /**
     * Resolve which block appears at position (x, y) at given depth
     */
    resolveBlock(x, y, depth, rootBlockId) {
        // Handle coordinates outside 0-16 range by wrapping
        const size = Math.pow(16, depth);
        x = ((x % size) + size) % size;
        y = ((y % size) + size) % size;

        // Check cache
        const cacheKey = `${Math.floor(x)},${Math.floor(y)},${depth}`;
        if (this.blockCache.has(cacheKey)) {
            return this.blockCache.get(cacheKey);
        }

        let blockId = rootBlockId;

        // Walk down the fractal tree
        for (let d = 0; d < depth; d++) {
            const scale = Math.pow(16, depth - d - 1);
            const px = Math.floor(x / scale) % 16;
            const py = Math.floor(y / scale) % 16;
            blockId = this.lut.getPixelBlock(blockId, px, py);
        }

        // Cache with LRU eviction
        if (this.blockCache.size >= this.maxCacheSize) {
            const firstKey = this.blockCache.keys().next().value;
            this.blockCache.delete(firstKey);
        }
        this.blockCache.set(cacheKey, blockId);

        return blockId;
    }

    /**
     * Render visible blocks
     * @param {number} centerX - Center X in current-depth block coordinates
     * @param {number} centerY - Center Y in current-depth block coordinates
     * @param {number} depth - Fractal depth (integer)
     * @param {number} subZoom - Sub-zoom within level (-1 to 1)
     * @param {number} screenWidth - Screen width in pixels
     * @param {number} screenHeight - Screen height in pixels
     * @param {number} rootBlockId - Root block ID
     */
    render(centerX, centerY, depth, subZoom, screenWidth, screenHeight, rootBlockId) {
        const blockSize = CONFIG.blockSize;

        // Visual scale based on subZoom
        // subZoom=0: blocks are blockSize pixels
        // subZoom=1: blocks are blockSize*16 pixels
        // subZoom=-1: blocks are blockSize/16 pixels (for next layer during transition)
        const scale = blockSize * Math.pow(16, subZoom);

        // Calculate visible range
        const buffer = CONFIG.gridBuffer;
        const visibleX = Math.ceil(screenWidth / scale) + buffer * 2;
        const visibleY = Math.ceil(screenHeight / scale) + buffer * 2;

        // Ensure pool is large enough
        const totalSprites = visibleX * visibleY;
        this.ensurePoolSize(totalSprites);

        // Calculate starting block position (integer part)
        const startBlockX = Math.floor(centerX) - Math.floor(visibleX / 2);
        const startBlockY = Math.floor(centerY) - Math.floor(visibleY / 2);

        // Sub-pixel offset for smooth panning
        const fracX = centerX - Math.floor(centerX);
        const fracY = centerY - Math.floor(centerY);

        let spriteIndex = 0;

        for (let dy = 0; dy < visibleY; dy++) {
            for (let dx = 0; dx < visibleX; dx++) {
                const blockX = startBlockX + dx;
                const blockY = startBlockY + dy;

                // Resolve block at this position
                const blockId = this.resolveBlock(blockX, blockY, depth, rootBlockId);

                // Get sprite from pool
                const sprite = this.sprites[spriteIndex++];

                // Set texture
                sprite.texture = this.getTexture(blockId);

                // Position: offset from center of screen
                const offsetFromCenterX = dx - Math.floor(visibleX / 2) - fracX;
                const offsetFromCenterY = dy - Math.floor(visibleY / 2) - fracY;

                sprite.x = screenWidth / 2 + offsetFromCenterX * scale;
                sprite.y = screenHeight / 2 + offsetFromCenterY * scale;
                sprite.width = scale + 0.5; // Slight overlap to prevent seams
                sprite.height = scale + 0.5;
                sprite.visible = true;
            }
        }

        // Hide unused sprites
        this.activeCount = spriteIndex;
        for (let i = spriteIndex; i < this.sprites.length; i++) {
            this.sprites[i].visible = false;
        }
    }

    clearCache() {
        this.blockCache.clear();
    }
}
