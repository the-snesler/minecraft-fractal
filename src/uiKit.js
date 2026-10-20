/**
 * UI Kit
 *
 * Small DOM helpers shared by the collection and daily block UIs:
 * element builder, icons, time formatting, block art, and modals.
 */

export const ATLAS_URL = './dist/atlas.png';

const ICONS = {
    close: '<svg viewBox="0 0 16 16"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2.5" fill="none"/></svg>',
    check: '<svg viewBox="0 0 16 16"><path d="M2.5 8.5l3.5 3.5 7.5-8" stroke="currentColor" stroke-width="2.5" fill="none"/></svg>',
    hint: '<svg viewBox="0 0 16 16"><path d="M8 1.5a4.5 4.5 0 0 0-2.6 8.2c.4.3.6.7.6 1.2V12h4v-1.1c0-.5.2-.9.6-1.2A4.5 4.5 0 0 0 8 1.5zM6 13.5h4V15H6z" fill="currentColor"/></svg>',
    sound: '<svg viewBox="0 0 16 16"><path d="M2 6h3l4-3v10L5 10H2z" fill="currentColor"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>',
    muted: '<svg viewBox="0 0 16 16"><path d="M2 6h3l4-3v10L5 10H2z" fill="currentColor"/><path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" stroke-width="1.5"/></svg>',
    grid: '<svg viewBox="0 0 16 16"><path d="M1 1h6v6H1zM9 1h6v6H9zM1 9h6v6H1zM9 9h6v6H9z" fill="currentColor"/></svg>',
    search: '<svg viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="2" fill="none"/><path d="M10 10l4.5 4.5" stroke="currentColor" stroke-width="2"/></svg>',
    calendar: '<svg viewBox="0 0 16 16"><path d="M1.5 3h13v11.5h-13z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M1.5 3h13v3h-13zM4 1v3M12 1v3" stroke="currentColor" stroke-width="1.5" fill="currentColor"/><path d="M4 8.5h2v2H4zM7 8.5h2v2H7zM10 8.5h2v2h-2z" fill="currentColor"/></svg>',
    flag: '<svg viewBox="0 0 16 16"><path d="M3 1.5v13" stroke="currentColor" stroke-width="1.5"/><path d="M3.5 2h9l-2 3 2 3h-9z" fill="currentColor"/></svg>',
};

/**
 * Tiny element builder: h('div', { class: 'x', onclick }, child, 'text', [more])
 */
export function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs ?? {})) {
        if (value == null || value === false) continue;
        if (key === 'class') el.className = value;
        else if (key === 'style') {
            for (const [prop, v] of Object.entries(value)) {
                if (prop.startsWith('--')) el.style.setProperty(prop, v);
                else el.style[prop] = v;
            }
        }
        else if (key === 'html') el.innerHTML = value;
        else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
        else el.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat(Infinity)) {
        if (child == null || child === false) continue;
        el.append(child instanceof Node ? child : String(child));
    }
    return el;
}

export const svg = (name) => h('span', { class: 'svg-icon', html: ICONS[name] });
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Stopwatch format: 83456 -> "1:23.4", 3723456 -> "1:02:03.4"
 */
export function formatTime(ms) {
    const tenths = Math.max(0, Math.floor(ms / 100));
    const seconds = Math.floor(tenths / 10) % 60;
    const minutes = Math.floor(tenths / 600) % 60;
    const hours = Math.floor(tenths / 36000);
    const ss = String(seconds).padStart(2, '0');
    const head = hours ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`;
    return `${head}.${tenths % 10}`;
}

/**
 * Long spans: stopwatch format under a day, then "2d 4h 12m"
 */
export function formatDuration(ms) {
    if (ms < 86400000) return formatTime(ms);
    const minutes = Math.floor(ms / 60000);
    return `${Math.floor(minutes / 1440)}d ${Math.floor(minutes / 60) % 24}h ${minutes % 60}m`;
}

export function depthText(distance) {
    if (distance === 0) return 'Starting block';
    return `${plural(distance, 'zoom')} deep`;
}

/**
 * Block textures from the atlas, as CSS sprites and canvases
 */
export class BlockArt {
    /**
     * @param {object} atlasMeta - Contents of atlas.json
     * @param {import('./LUTDecoder.js').LUTDecoder} lut
     * @param {import('./BlockGraph.js').BlockGraph} graph
     */
    constructor(atlasMeta, lut, graph) {
        this.atlas = atlasMeta;
        this.lut = lut;
        this.graph = graph;
        this.image = new Image();
        this.image.src = ATLAS_URL;
    }

    frame(id) {
        return this.atlas.blocks[this.lut.getBlockName(id)];
    }

    /**
     * @param {number} id - Block ID
     * @param {number} size - Multiple of 16 for crisp pixels
     */
    icon(id, size = 32) {
        const frame = this.frame(id);
        const k = size / 16;
        const { w, h: atlasH } = this.atlas.meta.size;
        return h('span', {
            class: 'block-icon',
            style: {
                width: `${size}px`,
                height: `${size}px`,
                backgroundImage: `url(${ATLAS_URL})`,
                backgroundSize: `${w * k}px ${atlasH * k}px`,
                backgroundPosition: frame ? `-${frame.x * k}px -${frame.y * k}px` : '0 0',
            },
        });
    }

    /**
     * Parent texture with the pixels that turn into `child` highlighted
     */
    pixelMap(parent, child) {
        const SCALE = 4;
        const canvas = h('canvas', { class: 'pixel-map', width: 16 * SCALE, height: 16 * SCALE });
        const frame = this.frame(parent);
        if (!frame || !this.image.complete) return canvas;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.image, frame.x, frame.y, 16, 16, 0, 0, 16 * SCALE, 16 * SCALE);

        const mask = this.graph.pixelMask(parent, child);
        const at = (x, y) => x >= 0 && x < 16 && y >= 0 && y < 16 && mask[y * 16 + x];
        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                if (!at(x, y)) ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
            }
        }
        // Trace the edges of the matching pixels
        ctx.fillStyle = '#FFFFFF';
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                if (!at(x, y)) continue;
                const px = x * SCALE;
                const py = y * SCALE;
                if (!at(x, y - 1)) ctx.fillRect(px, py, SCALE, 1);
                if (!at(x, y + 1)) ctx.fillRect(px, py + SCALE - 1, SCALE, 1);
                if (!at(x - 1, y)) ctx.fillRect(px, py, 1, SCALE);
                if (!at(x + 1, y)) ctx.fillRect(px + SCALE - 1, py, 1, SCALE);
            }
        }
        return canvas;
    }
}

// Modals: one at a time

let modal = null;

/**
 * @param {Node|Node[]} content
 * @param {object} [options]
 * @param {boolean} [options.dismissable] - Close on backdrop click / Escape
 * @param {string} [options.className]
 * @param {() => void} [options.onClose]
 */
export function openModal(content, { dismissable = true, className = '', onClose } = {}) {
    closeModal();
    const backdrop = h('div', { class: 'hunt-modal-backdrop' },
        h('div', { class: `hunt-modal mc-panel ${className}`, role: 'dialog', 'aria-modal': 'true' }, content));
    if (dismissable) {
        backdrop.addEventListener('mousedown', (e) => {
            if (e.target === backdrop) closeModal();
        });
    }
    document.body.append(backdrop);
    modal = { backdrop, dismissable, onClose };
    backdrop.querySelector('.primary')?.focus();
}

export function closeModal() {
    if (!modal) return;
    const { backdrop, onClose } = modal;
    modal = null;
    backdrop.remove();
    onClose?.();
}

export function isModalOpen() {
    return modal !== null;
}

export function isModalDismissable() {
    return modal?.dismissable ?? false;
}
