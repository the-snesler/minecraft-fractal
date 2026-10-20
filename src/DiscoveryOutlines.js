/**
 * Discovery Outlines
 *
 * Draws an animated outline around every on-screen copy of a block for a few
 * seconds after it is discovered, so new finds are easy to spot. Each outline
 * is a ring of four tinted edge sprites plus a 1px dark halo, taken from a
 * sprite pool, which stays cheap even when a new block covers the screen.
 */

import * as PIXI from 'pixi.js';

const DURATION = 3500; // ms an outline stays up
const POP_IN = 350;    // ms of the initial shrink-to-fit animation
const FADE_OUT = 800;  // ms of the closing fade

export class DiscoveryOutlines {
    constructor() {
        this.container = new PIXI.Container();
        this.sprites = [];
        this.used = 0;
        this.flashes = new Map(); // block ID -> { start, color }
        this.now = 0;
    }

    /**
     * Start outlining a block
     * @param {number} blockId
     * @param {number} color - 0xRRGGBB
     */
    flash(blockId, color) {
        this.flashes.set(blockId, { start: performance.now(), color });
    }

    clear() {
        this.flashes.clear();
        this.hideUnused(0);
    }

    isFlashing(blockId) {
        return this.flashes.has(blockId);
    }

    beginFrame(now) {
        this.now = now;
        this.used = 0;
        for (const [id, flash] of this.flashes) {
            if (now - flash.start > DURATION) this.flashes.delete(id);
        }
    }

    /**
     * Outline one on-screen copy of a flashing block
     */
    draw(blockId, x, y, size) {
        const flash = this.flashes.get(blockId);
        const t = this.now - flash.start;

        // Pop in from slightly larger, pulse, then fade out
        const pop = 1 - Math.pow(1 - Math.min(1, t / POP_IN), 3);
        const fade = Math.min(1, (DURATION - t) / FADE_OUT);
        const pulse = 0.8 + 0.2 * Math.cos(t / 140);
        const alpha = pop * fade;

        // Snap to whole pixels so edges stay crisp
        const grow = (1 - pop) * size * 0.5;
        const left = Math.round(x - grow);
        const top = Math.round(y - grow);
        const right = Math.round(x + size + grow);
        const bottom = Math.round(y + size + grow);
        const ring = Math.round(Math.max(2, Math.min(4, size * 0.12)));

        // Ring just outside the block, then a dark halo just outside the ring
        this.frame(left, top, right, bottom, ring, flash.color, alpha * pulse);
        this.frame(left - ring, top - ring, right + ring, bottom + ring, 1, 0x000000, alpha * 0.7);
    }

    /**
     * Hollow rectangle of `width` drawn outside the box (left, top)-(right, bottom)
     */
    frame(left, top, right, bottom, width, color, alpha) {
        const outerWidth = right - left + width * 2;
        this.rect(left - width, top - width, outerWidth, width, color, alpha);
        this.rect(left - width, bottom, outerWidth, width, color, alpha);
        this.rect(left - width, top, width, bottom - top, color, alpha);
        this.rect(right, top, width, bottom - top, color, alpha);
    }

    rect(x, y, width, height, color, alpha) {
        if (this.used === this.sprites.length) {
            const sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
            this.container.addChild(sprite);
            this.sprites.push(sprite);
        }
        const sprite = this.sprites[this.used++];
        sprite.visible = true;
        sprite.tint = color;
        sprite.alpha = alpha;
        sprite.x = x;
        sprite.y = y;
        sprite.width = width;
        sprite.height = height;
    }

    endFrame() {
        this.hideUnused(this.used);
    }

    hideUnused(from) {
        for (let i = from; i < this.sprites.length; i++) {
            this.sprites[i].visible = false;
        }
    }
}
