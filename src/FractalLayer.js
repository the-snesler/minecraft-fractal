/**
 * Fractal Layer
 *
 * Renders a single fractal level using sprite pooling.
 * Coordinates are in "current depth" space.
 */

import * as PIXI from 'pixi.js';
import { CONFIG } from './config.js';
import { getBlockFromCache, setBlockInCache } from './BlockCache.js';

export class FractalLayer {
    constructor(spritesheet, lut, atlasMeta) {
        this.lut = lut;
        this.meta = atlasMeta;

        // Main container
        this.container = new PIXI.Container();

        // Texture cache (block ID -> PIXI.Texture)
        this.textureCache = new Map();
        for (const [name, info] of Object.entries(atlasMeta.blocks)) {
            this.textureCache.set(info.id, spritesheet.textures[name]);
        }

        // Sprite pool
        this.sprites = [];
        this.activeCount = 0;
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
     * Resolve which block appears at position (x, y) at given depth using layer stack
     * Handles positions outside 0-15 by adjusting ancestry (carrying overflow)
     */
    resolveBlock(localX, localY, depth, rootBlockId, layerStack) {
        // Build ancestry array from layer stack
        const ancestryX = [];
        const ancestryY = [];
        for (let d = 1; d <= depth && d < layerStack.length; d++) {
            ancestryX.push(layerStack[d].parentBlockX);
            ancestryY.push(layerStack[d].parentBlockY);
        }

        // Final pixel position
        let finalX = Math.floor(localX);
        let finalY = Math.floor(localY);

        // Handle positions outside 0-15 by carrying to ancestry
        // e.g., localX=17 becomes finalX=1 with carry=1 to parent
        let carryX = Math.floor(finalX / 16);
        let carryY = Math.floor(finalY / 16);
        finalX = ((finalX % 16) + 16) % 16;
        finalY = ((finalY % 16) + 16) % 16;

        // Propagate carry up through ancestry (bottom to top)
        for (let d = ancestryX.length - 1; d >= 0; d--) {
            ancestryX[d] += carryX;
            ancestryY[d] += carryY;

            // Compute new carry for next level
            carryX = Math.floor(ancestryX[d] / 16);
            carryY = Math.floor(ancestryY[d] / 16);

            // Normalize to 0-15
            ancestryX[d] = ((ancestryX[d] % 16) + 16) % 16;
            ancestryY[d] = ((ancestryY[d] % 16) + 16) % 16;
        }

        // Build cache key from adjusted ancestry
        const cacheKey = `${ancestryX.join(',')}|${ancestryY.join(',')}:${finalX},${finalY}`;
        const cacheCheck = getBlockFromCache(cacheKey);
        if (cacheCheck !== null) {
            return cacheCheck;
        }

        const parentKey = `${ancestryX.slice(0, -1).join(',')}|${ancestryY.slice(0, -1).join(',')}:${ancestryX.slice(-1)[0]},${ancestryY.slice(-1)[0]}`;

        let blockId;
        const parentCacheCheck = getBlockFromCache(parentKey);
        if (parentCacheCheck !== null) {
            // If parent block is cached, we can skip directly to final lookup
            blockId = parentCacheCheck;
        }
        if (!blockId) {
            // Compute blockId using adjusted ancestry
            blockId = rootBlockId;
            for (let d = 1; d < ancestryX.length; d++) {
                blockId = this.lut.getPixelBlock(blockId, ancestryX[d], ancestryY[d]);
            }
        }

        // Final lookup
        if (ancestryX.length > 0) {
            blockId = this.lut.getPixelBlock(blockId, finalX, finalY);
        }

        setBlockInCache(cacheKey, blockId);
        return blockId;
    }

    /**
     * Render visible blocks
     * @param {number} centerX - Center X in current-depth local coordinates (0-16 range)
     * @param {number} centerY - Center Y in current-depth local coordinates (0-16 range)
     * @param {number} depth - Fractal depth (integer)
     * @param {number} subZoom - Sub-zoom within level (-1 to 1)
     * @param {number} screenWidth - Screen width in pixels
     * @param {number} screenHeight - Screen height in pixels
     * @param {number} rootBlockId - Root block ID
     * @param {Array} layerStack - Stack of layer positions for block ancestry
     */
    render(centerX, centerY, depth, subZoom, screenWidth, screenHeight, rootBlockId, layerStack) {
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

                // Resolve block at this position using layer stack
                const blockId = this.resolveBlock(blockX, blockY, depth, rootBlockId, layerStack);

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
