/**
 * Fractal Layer Manager
 *
 * Manages two layers for smooth crossfade transitions during zoom.
 * Coordinates are received in "current depth" space from the controller.
 */

import { FractalLayer } from './FractalLayer.js';
import { CONFIG } from './config.js';

export class FractalLayerManager {
    constructor(stage, spritesheet, lut, atlasMeta) {
        this.stage = stage;
        this.spritesheet = spritesheet;
        this.lut = lut;
        this.meta = atlasMeta;

        // Two layers for crossfade
        this.layerA = new FractalLayer(spritesheet, lut, atlasMeta);
        this.layerB = new FractalLayer(spritesheet, lut, atlasMeta);

        // Current and next layer references
        this.currentLayer = this.layerA;
        this.nextLayer = this.layerB;

        // Add to stage
        stage.addChild(this.currentLayer.container);
        stage.addChild(this.nextLayer.container);

        // Initial state
        this.nextLayer.container.alpha = 0;

        // Root block ID
        this.rootBlockId = lut.getBlockId(CONFIG.rootBlock);

        // Track current depth for layer swapping
        this.currentDepth = 0;

        // Screen dimensions
        this.screenWidth = 800;
        this.screenHeight = 600;
    }

    setScreenSize(width, height) {
        this.screenWidth = width;
        this.screenHeight = height;
    }

    /**
     * Update the fractal view
     * @param {object} state - State from ZoomPanController
     */
    update(state) {
        const { depth, subZoom, centerX, centerY, layerStack } = state;

        // Handle depth change (swap layers)
        if (depth !== this.currentDepth) {
            this.onDepthChange(depth);
        }

        const threshold = CONFIG.zoomThreshold;

        if (subZoom >= threshold && depth >= 0) {
            // Transitioning: crossfade between layers
            const progress = (subZoom - threshold) / (1 - threshold);

            this.currentLayer.container.alpha = 1;
            this.nextLayer.container.alpha = progress;

            // Render current layer
            this.currentLayer.render(
                centerX,
                centerY,
                depth,
                subZoom,
                this.screenWidth,
                this.screenHeight,
                this.rootBlockId,
                layerStack
            );

            // Render next layer (depth + 1)
            // Compute next layer's local coordinates (scaled from current fractional position)
            const fracX = (centerX - Math.floor(centerX)) * 16;
            const fracY = (centerY - Math.floor(centerY)) * 16;

            // Create temporary extended stack for next layer
            const nextLayerStack = [
                ...layerStack,
                {
                    parentBlockX: Math.floor(centerX),
                    parentBlockY: Math.floor(centerY),
                    x: fracX,
                    y: fracY,
                },
            ];

            this.nextLayer.render(
                fracX,
                fracY,
                depth + 1,
                subZoom - 1, // Negative subZoom = zoomed out from this level
                this.screenWidth,
                this.screenHeight,
                this.rootBlockId,
                nextLayerStack
            );
        } else {
            // Not transitioning
            this.currentLayer.container.alpha = 1;
            this.nextLayer.container.alpha = 0;

            this.currentLayer.render(
                centerX,
                centerY,
                Math.max(0, depth),
                subZoom,
                this.screenWidth,
                this.screenHeight,
                this.rootBlockId,
                layerStack
            );
        }

        this.currentDepth = depth;
    }

    /**
     * Handle depth level change
     */
    onDepthChange(newDepth) {
        // Swap layers
        const temp = this.currentLayer;
        this.currentLayer = this.nextLayer;
        this.nextLayer = temp;

        // Re-order in stage
        this.stage.removeChild(this.currentLayer.container);
        this.stage.removeChild(this.nextLayer.container);
        this.stage.addChild(this.currentLayer.container);
        this.stage.addChild(this.nextLayer.container);

        if (CONFIG.debug) {
            console.log(`Layer swap at depth ${newDepth}`);
        }
    }

    setRootBlock(blockName) {
        const id = this.lut.getBlockId(blockName);
        if (id !== undefined) {
            this.rootBlockId = id;
            this.currentLayer.clearCache();
            this.nextLayer.clearCache();
        }
    }
}
