/**
 * Zoom/Pan Controller
 *
 * Handles mouse wheel, drag, and touch input for smooth zoom and pan.
 * Coordinates are maintained in "current depth" space and transformed
 * when crossing depth boundaries.
 */

import { CONFIG } from './config.js';

export class ZoomPanController {
    constructor(canvas, onUpdate) {
        this.canvas = canvas;
        this.onUpdate = onUpdate;

        // Zoom state
        this.targetZoom = 0;
        this.currentZoom = 0;

        // Layer stack: each entry has local coordinates (0-16 range) for that depth
        // This prevents coordinate explosion at deep zoom levels
        this.layerStack = [{ x: 8, y: 8, parentBlockX: 0, parentBlockY: 0 }];

        // Track current integer depth for layer management
        this.currentDepth = 0;

        // Drag state
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Touch state
        this.lastTouchDistance = 0;
        this.lastTouchCenter = { x: 0, y: 0 };

        this.bindEvents();
    }

    bindEvents() {
        this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.onMouseUp.bind(this));
        this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.onTouchEnd.bind(this));
    }

    /**
     * Get the current (topmost) layer
     */
    getCurrentLayer() {
        return this.layerStack[this.layerStack.length - 1];
    }

    /**
     * Get current visual scale (pixels per block on screen)
     */
    getVisualScale() {
        const subZoom = this.currentZoom - Math.floor(this.currentZoom);
        // At subZoom=0, each block is blockSize pixels
        // At subZoom=1, each block is blockSize*16 pixels (about to transition)
        return CONFIG.blockSize * Math.pow(16, subZoom);
    }

    onWheel(e) {
        e.preventDefault();

        const zoomDelta = -e.deltaY * CONFIG.zoomSpeed;
        const newZoom = this.targetZoom + zoomDelta;

        // Apply min zoom limit
        this.targetZoom = Math.max(CONFIG.minZoom, newZoom);

        // Zoom towards cursor
        this.zoomTowards(e.clientX, e.clientY, zoomDelta);
    }

    zoomTowards(screenX, screenY, delta) {
        const rect = this.canvas.getBoundingClientRect();
        const centerScreenX = rect.width / 2;
        const centerScreenY = rect.height / 2;

        // Offset from center in screen pixels
        const offsetX = screenX - rect.left - centerScreenX;
        const offsetY = screenY - rect.top - centerScreenY;

        // Current visual scale
        const scale = this.getVisualScale();

        // Convert screen offset to block offset
        const blockOffsetX = offsetX / scale;
        const blockOffsetY = offsetY / scale;

        // Adjust center to zoom towards cursor
        const zoomFactor = Math.pow(16, delta);
        const adjustment = 1 - 1 / zoomFactor;

        const current = this.getCurrentLayer();
        current.x += blockOffsetX * adjustment;
        current.y += blockOffsetY * adjustment;
    }

    onMouseDown(e) {
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.canvas.style.cursor = 'grabbing';
    }

    onMouseMove(e) {
        if (!this.isDragging) return;

        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;

        this.pan(-dx, -dy);

        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    }

    onMouseUp() {
        this.isDragging = false;
        this.canvas.style.cursor = 'grab';
    }

    pan(screenDx, screenDy) {
        // Convert screen delta to block delta using VISUAL scale only
        const scale = this.getVisualScale();

        const current = this.getCurrentLayer();
        current.x += screenDx / scale;
        current.y += screenDy / scale;

        this.clampCenter();
    }

    clampCenter() {
        // Clamp current layer to stay within reasonable bounds
        // Each layer is relative to its parent block, so 0-16 is the "home" range
        // Allow some buffer for smooth edge handling
        const current = this.getCurrentLayer();
        const buffer = CONFIG.gridBuffer;
        current.x = Math.max(-buffer, Math.min(16 + buffer, current.x));
        current.y = Math.max(-buffer, Math.min(16 + buffer, current.y));
    }

    // Touch handlers
    onTouchStart(e) {
        e.preventDefault();

        if (e.touches.length === 1) {
            this.isDragging = true;
            this.lastMouseX = e.touches[0].clientX;
            this.lastMouseY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            this.isDragging = false;
            this.lastTouchDistance = this.getTouchDistance(e.touches);
            this.lastTouchCenter = this.getTouchCenter(e.touches);
        }
    }

    onTouchMove(e) {
        e.preventDefault();

        if (e.touches.length === 1 && this.isDragging) {
            const dx = e.touches[0].clientX - this.lastMouseX;
            const dy = e.touches[0].clientY - this.lastMouseY;

            this.pan(-dx, -dy);

            this.lastMouseX = e.touches[0].clientX;
            this.lastMouseY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            const distance = this.getTouchDistance(e.touches);
            const center = this.getTouchCenter(e.touches);

            const zoomDelta = Math.log(distance / this.lastTouchDistance) / Math.log(16);
            this.targetZoom = Math.max(CONFIG.minZoom, this.targetZoom + zoomDelta);

            const dx = center.x - this.lastTouchCenter.x;
            const dy = center.y - this.lastTouchCenter.y;
            this.pan(-dx, -dy);

            this.lastTouchDistance = distance;
            this.lastTouchCenter = center;
        }
    }

    onTouchEnd(e) {
        if (e.touches.length === 0) {
            this.isDragging = false;
        } else if (e.touches.length === 1) {
            this.isDragging = true;
            this.lastMouseX = e.touches[0].clientX;
            this.lastMouseY = e.touches[0].clientY;
        }
    }

    getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getTouchCenter(touches) {
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2,
        };
    }

    /**
     * Update zoom smoothing and handle depth transitions
     */
    update() {
        // Smooth zoom interpolation
        const diff = this.targetZoom - this.currentZoom;
        if (Math.abs(diff) > 0.0001) {
            this.currentZoom += diff * CONFIG.zoomSmoothness;
        } else {
            this.currentZoom = this.targetZoom;
        }

        // Check for depth change and transform coordinates
        const newDepth = Math.max(0, Math.floor(this.currentZoom));
        if (newDepth !== this.currentDepth) {
            this.onDepthChange(newDepth);
        }
    }

    /**
     * Handle depth transition - push/pop layer stack
     */
    onDepthChange(newDepth) {
        const depthDelta = newDepth - this.currentDepth;

        if (depthDelta > 0) {
            // Zooming in: push new layer(s)
            for (let i = 0; i < depthDelta; i++) {
                const current = this.getCurrentLayer();
                // New layer starts at the fractional position within current block
                const fracX = (current.x - Math.floor(current.x)) * 16;
                const fracY = (current.y - Math.floor(current.y)) * 16;
                this.layerStack.push({
                    parentBlockX: Math.floor(current.x),
                    parentBlockY: Math.floor(current.y),
                    x: fracX,
                    y: fracY,
                });
            }
        } else if (depthDelta < 0) {
            // Zooming out: pop layer(s) and restore parent position
            for (let i = 0; i < -depthDelta && this.layerStack.length > 1; i++) {
                const popped = this.layerStack.pop();
                const parent = this.getCurrentLayer();
                // Restore parent position from the block we came from
                parent.x = popped.parentBlockX + (popped.x / 16);
                parent.y = popped.parentBlockY + (popped.y / 16);
            }
        }

        this.currentDepth = newDepth;

        if (CONFIG.debug) {
            const current = this.getCurrentLayer();
            console.log(`Depth changed to ${newDepth}, layer ${this.layerStack.length}, pos: (${current.x.toFixed(2)}, ${current.y.toFixed(2)})`);
        }
    }

    /**
     * Get current state for rendering
     */
    getState() {
        const depth = Math.max(0, Math.floor(this.currentZoom));
        const subZoom = this.currentZoom > 0 ? this.currentZoom - Math.floor(this.currentZoom) : this.currentZoom;
        const current = this.getCurrentLayer();

        return {
            zoom: this.currentZoom,
            depth,
            subZoom: subZoom,
            centerX: current.x,
            centerY: current.y,
            layerStack: this.layerStack, // Pass full stack for block ancestry
        };
    }
}
