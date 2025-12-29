/**
 * Fractal Layer Manager
 *
 * Manages two layers for smooth crossfade transitions during zoom.
 * Coordinates are received in "current depth" space from the controller.
 */

import { FractalLayer } from './FractalLayer.js';
import { CONFIG } from './config.js';

export class FractalLayerManager {
    constructor(stage, atlas, lut, atlasMeta) {
        this.stage = stage;
        this.atlas = atlas;
        this.lut = lut;
        this.meta = atlasMeta;

        // Two layers for crossfade
        this.layerA = new FractalLayer(atlas, lut, atlasMeta);
        this.layerB = new FractalLayer(atlas, lut, atlasMeta);

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
        const { depth, subZoom, centerX, centerY } = state;

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
                this.rootBlockId
            );

            // Render next layer (depth + 1)
            // Next layer coordinates are scaled up by 16
            this.nextLayer.render(
                centerX * 16,
                centerY * 16,
                depth + 1,
                subZoom - 1, // Negative subZoom = zoomed out from this level
                this.screenWidth,
                this.screenHeight,
                this.rootBlockId
            );
        } else {
            // Not transitioning
            this.currentLayer.container.alpha = 1;
            this.nextLayer.container.alpha = 0;

            this.currentLayer.render(
                centerX,
                centerY,
                Math.max(0, depth),
                Math.max(0, subZoom),
                this.screenWidth,
                this.screenHeight,
                this.rootBlockId
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

        // Clear the recycled layer's cache
        this.nextLayer.clearCache();

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
