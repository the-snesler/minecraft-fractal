/**
 * Sounds
 *
 * Tiny synthesized effects for the block hunt (no audio assets needed).
 * The AudioContext is created lazily on first use, which happens after a click.
 */

const MUTE_KEY = 'mcfractal.hunt.muted';

let context = null;
let muted = localStorage.getItem(MUTE_KEY) === '1';

export function isMuted() {
    return muted;
}

export function setMuted(value) {
    muted = value;
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
}

function audio() {
    if (muted) return null;
    if (!context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        context = new AudioContext();
    }
    if (context.state === 'suspended') context.resume();
    return context;
}

/**
 * Play a single enveloped note
 * @param {number} freq - Hz
 * @param {number} delay - Seconds from now
 * @param {number} duration - Seconds
 */
function note(freq, delay, duration, { type = 'triangle', volume = 0.08 } = {}) {
    const ctx = audio();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.05);
}

const semitone = (base, steps) => base * Math.pow(2, steps / 12);

export function countdownTick() {
    note(523, 0, 0.15, { type: 'square', volume: 0.04 });
}

export function countdownGo() {
    note(1047, 0, 0.45, { type: 'square', volume: 0.05 });
}

/**
 * Discovery chime; rarer tiers ring higher and play longer arpeggios
 * @param {number} tier - Index into RARITIES
 */
export function discover(tier) {
    const base = semitone(880, tier * 2 + Math.random() * 1.5);
    const steps = [[0], [0, 7], [0, 4, 7], [0, 4, 7, 12], [0, 4, 7, 12, 16]][tier] ?? [0];
    steps.forEach((step, i) => note(semitone(base, step), i * 0.06, 0.35, { volume: 0.06 }));
}

export function tierComplete() {
    [0, 4, 7, 12, 7, 12].forEach((step, i) => note(semitone(659, step), i * 0.09, 0.4, { volume: 0.06 }));
}

export function finish() {
    [0, 4, 7, 12, 16, 19, 24].forEach((step, i) => note(semitone(523, step), i * 0.1, 0.6, { type: 'square', volume: 0.035 }));
}
