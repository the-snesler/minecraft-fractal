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

        // Pan state (in current-depth block coordinates)
        // At depth 0: centered on root block
        // At depth 1: coordinates are in 16x16 pixel space of root block
        // etc.
        this.centerX = 8; // Start at center of root block
        this.centerY = 8;

        // Track current integer depth for coordinate transforms
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

        this.centerX += blockOffsetX * adjustment;
        this.centerY += blockOffsetY * adjustment;
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

        this.centerX += screenDx / scale;
        this.centerY += screenDy / scale;

        this.clampCenter();
    }

    clampCenter() {
        // Limit pan range in current-depth coordinates
        const maxPan = CONFIG.maxPanDistance;
        if (maxPan !== Infinity) {
            // At each depth, valid range is 0 to 16 (within parent block)
            // But we allow some overflow for smooth edge handling
            const limit = 16 + maxPan;
            this.centerX = Math.max(-maxPan, Math.min(limit, this.centerX));
            this.centerY = Math.max(-maxPan, Math.min(limit, this.centerY));
        }
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
     * Handle depth transition - transform coordinates
     */
    onDepthChange(newDepth) {
        const depthDelta = newDepth - this.currentDepth;

        if (depthDelta > 0) {
            // Zooming in: coordinates scale up by 16
            // centerX=8 at depth 0 becomes centerX=128 at depth 1
            for (let i = 0; i < depthDelta; i++) {
                this.centerX *= 16;
                this.centerY *= 16;
            }
        } else {
            // Zooming out: coordinates scale down by 16
            for (let i = 0; i < -depthDelta; i++) {
                this.centerX /= 16;
                this.centerY /= 16;
            }
        }

        this.currentDepth = newDepth;

        if (CONFIG.debug) {
            console.log(`Depth changed to ${newDepth}, center: (${this.centerX.toFixed(2)}, ${this.centerY.toFixed(2)})`);
        }
    }

    /**
     * Get current state for rendering
     */
    getState() {
        const depth = Math.max(0, Math.floor(this.currentZoom));
        const subZoom = this.currentZoom - Math.floor(this.currentZoom);

        return {
            zoom: this.currentZoom,
            depth,
            subZoom: Math.max(0, subZoom),
            centerX: this.centerX,
            centerY: this.centerY,
        };
    }
}
