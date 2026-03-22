/**
 * Minecraft Fractal Viewer
 *
 * Main application entry point using PixiJS for WebGL rendering.
 */

import * as PIXI from 'pixi.js';
import { LUTDecoder } from './LUTDecoder.js';
import { FractalLayerManager } from './FractalLayerManager.js';
import { ZoomPanController } from './ZoomPanController.js';
import { CONFIG } from './config.js';

class MinecraftFractalApp {
    constructor(containerId) {
        this.containerId = containerId;
        this.app = null;
        this.layerManager = null;
        this.zoomController = null;
        this.lut = null;
    }

    async init() {
        const container = document.getElementById(this.containerId);
        container.innerHTML = '<div class="loading">Loading...</div>';

        try {
            // Initialize PixiJS
            this.app = new PIXI.Application();
            await this.app.init({
                resizeTo: window,
                backgroundColor: CONFIG.backgroundColor,
                antialias: false,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
            });

            PIXI.TextureSource.defaultOptions.scaleMode = 'nearest';

            container.innerHTML = '';
            container.appendChild(this.app.canvas);
            this.app.canvas.style.cursor = 'grab';

            // Load assets
            const [atlasTexture, atlasMeta] = await Promise.all([
                PIXI.Assets.load('./dist/atlas.png'),
                fetch('./dist/atlas.json').then((r) => r.json()),
                this.loadLUT(),
            ]);

            console.log(`Atlas: ${atlasMeta.blockCount} blocks`);

            // Parse spritesheet for proper per-frame texture boundaries
            const spritesheet = new PIXI.Spritesheet(atlasTexture, atlasMeta);
            await spritesheet.parse();

            // Initialize layer manager
            this.layerManager = new FractalLayerManager(
                this.app.stage,
                spritesheet,
                this.lut,
                atlasMeta
            );

            this.layerManager.setScreenSize(this.app.screen.width, this.app.screen.height);

            // Initialize zoom/pan controller
            this.zoomController = new ZoomPanController(this.app.canvas);

            // Handle resize
            window.addEventListener('resize', () => {
                this.layerManager.setScreenSize(this.app.screen.width, this.app.screen.height);
            });

            // Start render loop
            this.app.ticker.add(this.update.bind(this));

            // Initial render
            const initialState = this.zoomController.getState();
            this.layerManager.update(initialState);

        } catch (error) {
            console.error('Failed to initialize:', error);
            container.innerHTML = `<div class="error">Failed to load: ${error.message}</div>`;
        }
    }

    async loadLUT() {
        this.lut = new LUTDecoder();
        await this.lut.load('./dist/blockLUT.bin');
    }

    update() {
        // Update controller (handles smoothing and depth transitions)
        this.zoomController.update();

        // Get state and update renderer
        const state = this.zoomController.getState();
        this.layerManager.update(state);
        // debug
        document.getElementById('info').innerText = JSON.stringify(state, null, 2);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new MinecraftFractalApp('app');
    app.init();
    window.fractalApp = app;
});
