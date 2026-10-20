/**
 * Minecraft Fractal Viewer
 *
 * Main application entry point using PixiJS for WebGL rendering.
 */

import * as PIXI from 'pixi.js';
import { LUTDecoder } from './LUTDecoder.js';
import { FractalLayerManager } from './FractalLayerManager.js';
import { ZoomPanController } from './ZoomPanController.js';
import { BlockGraph } from './BlockGraph.js';
import { DiscoveryOutlines } from './DiscoveryOutlines.js';
import { ScavengerHunt } from './ScavengerHunt.js';
import { HuntUI } from './HuntUI.js';
import { DailyChallenge } from './DailyChallenge.js';
import { DailyUI } from './DailyUI.js';
import { BlockArt } from './uiKit.js';
import { CONFIG } from './config.js';
import './hunt.css';

class MinecraftFractalApp {
    constructor(containerId) {
        this.containerId = containerId;
        this.app = null;
        this.layerManager = null;
        this.zoomController = null;
        this.lut = null;
        this.hunt = null;
        this.huntUI = null;
        this.daily = null;
        this.dailyUI = null;
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
            const [atlasTexture, atlasMeta, , dailySchedule] = await Promise.all([
                PIXI.Assets.load('./dist/atlas.png'),
                fetch('./dist/atlas.json').then((r) => r.json()),
                this.loadLUT(),
                // Optional: older builds have no daily schedule
                fetch('./dist/daily.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
            ]);

            console.log(`Atlas: ${atlasMeta.blockCount} blocks`);

            // Parse spritesheet for proper per-frame texture boundaries
            const spritesheet = new PIXI.Spritesheet(atlasTexture, atlasMeta);
            await spritesheet.parse();

            // Fractal layers get their own container so overlays stay on top when layers swap
            const fractalContainer = new PIXI.Container();
            this.app.stage.addChild(fractalContainer);

            // Initialize layer manager
            this.layerManager = new FractalLayerManager(
                fractalContainer,
                spritesheet,
                this.lut,
                atlasMeta
            );

            this.layerManager.setScreenSize(this.app.screen.width, this.app.screen.height);

            // Initialize zoom/pan controller
            this.zoomController = new ZoomPanController(this.app.canvas);

            // Block collection (outlines drawn above the fractal)
            const graph = new BlockGraph(this.lut, this.layerManager.rootBlockId);
            const outlines = new DiscoveryOutlines();
            const art = new BlockArt(atlasMeta, this.lut, graph);
            this.app.stage.addChild(outlines.container);
            this.hunt = new ScavengerHunt({
                graph,
                lut: this.lut,
                layerManager: this.layerManager,
                outlines,
            });
            this.huntUI = new HuntUI(this.hunt, art);

            // Daily block
            if (dailySchedule) {
                this.daily = new DailyChallenge({
                    hunt: this.hunt,
                    zoomController: this.zoomController,
                    outlines,
                    schedule: dailySchedule,
                });
                this.dailyUI = new DailyUI(this.daily, this.huntUI, art);
            }

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
        this.hunt.update();
        this.huntUI.tick();
        this.dailyUI?.tick();
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
