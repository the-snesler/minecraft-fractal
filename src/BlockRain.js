/**
 * Block Rain
 *
 * Celebration effect: block textures tumble down the screen.
 */

const SPAWN_TIME = 2500; // ms during which new blocks spawn
const PARTICLES = 160;

export class BlockRain {
    /**
     * @param {HTMLImageElement} atlasImage
     * @param {Array<{x: number, y: number}>} frames - Atlas frames to rain
     */
    constructor(atlasImage, frames) {
        this.atlas = atlasImage;
        this.frames = frames;
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'block-rain';
        this.particles = [];
        this.running = false;
    }

    play() {
        if (!this.frames.length) return;
        document.body.appendChild(this.canvas);
        this.resize();
        this.start = performance.now();
        this.spawned = 0;
        this.particles = [];
        this.running = true;
        this.last = this.start;
        requestAnimationFrame(this.frame.bind(this));
    }

    stop() {
        this.running = false;
        this.canvas.remove();
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx = this.canvas.getContext('2d');
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.ctx.imageSmoothingEnabled = false;
    }

    spawn() {
        const size = 16 * (1 + Math.floor(Math.random() * 3));
        this.particles.push({
            frame: this.frames[Math.floor(Math.random() * this.frames.length)],
            x: Math.random() * this.width,
            y: -size - Math.random() * 80,
            vx: (Math.random() - 0.5) * 120,
            vy: 120 + Math.random() * 260,
            angle: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 6,
            size,
        });
    }

    frame(now) {
        if (!this.running) return;
        const dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;

        const due = Math.min(PARTICLES, Math.floor(((now - this.start) / SPAWN_TIME) * PARTICLES));
        while (this.spawned < due) {
            this.spawn();
            this.spawned++;
        }

        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);
        for (const p of this.particles) {
            p.vy += 500 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.angle += p.spin * dt;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.drawImage(this.atlas, p.frame.x, p.frame.y, 16, 16, -p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
        }
        this.particles = this.particles.filter((p) => p.y < this.height + p.size);

        if (this.spawned >= PARTICLES && this.particles.length === 0) {
            this.stop();
            return;
        }
        requestAnimationFrame(this.frame.bind(this));
    }
}
