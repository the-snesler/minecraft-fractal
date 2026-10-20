/**
 * Daily UI
 *
 * HUD button, intro, countdown, in-run card (timer + route reveals), and the
 * result screens for the daily block.
 */

import { RARITIES } from './BlockGraph.js';
import { displayName } from './blockNames.js';
import { BlockRain } from './BlockRain.js';
import { STEP_PENALTY } from './DailyChallenge.js';
import * as sounds from './sounds.js';
import { h, svg, wait, plural, formatTime, depthText, openModal, closeModal } from './uiKit.js';

const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

function formatWait(ms) {
    const minutes = Math.ceil(ms / 60000);
    const hours = Math.floor(minutes / 60);
    return hours ? `${hours}h ${minutes % 60}m` : plural(minutes, 'minute');
}

export class DailyUI {
    /**
     * @param {import('./DailyChallenge.js').DailyChallenge} daily
     * @param {import('./HuntUI.js').HuntUI} huntUI
     * @param {import('./uiKit.js').BlockArt} art
     */
    constructor(daily, huntUI, art) {
        this.daily = daily;
        this.graph = daily.graph;
        this.lut = daily.lut;
        this.art = art;
        this.lastTimerText = '';
        this.lastButtonKey = '';

        this.buttonLabel = h('span', { class: 'hud-label' });
        this.button = h('button', { class: 'mc-btn hud-daily', title: 'Daily block', onclick: () => this.open() },
            svg('calendar'), this.buttonLabel);
        huntUI.addHudButton(this.button);

        this.timerEl = h('div', { class: 'daily-timer' });
        this.card = h('div', { class: 'daily-card mc-panel' });
        document.body.append(this.card);

        daily.on('state', (state) => this.onState(state));
        daily.on('reveal', () => this.renderCard());
        daily.on('finish', (result) => this.showResult(result, { celebrate: true }));
        this.onState(daily.state);
    }

    name(id) {
        return displayName(this.lut.getBlockName(id));
    }

    onState(state) {
        document.body.dataset.daily = state;
        this.renderCard();
        this.renderButton();
        if (state === 'countdown') this.runCountdown();
    }

    /**
     * Per-frame: timer, and the HUD button when the day rolls over
     */
    tick() {
        if (this.daily.state === 'running') {
            const text = formatTime(this.daily.elapsed());
            if (text !== this.lastTimerText) {
                this.timerEl.textContent = text;
                this.lastTimerText = text;
            }
        }
        this.renderButton();
    }

    renderButton() {
        const state = this.daily.state;
        const { number } = this.daily.puzzle();
        const key = `${state}:${number}`;
        if (key === this.lastButtonKey) return;
        this.lastButtonKey = key;

        this.button.classList.toggle('fresh', state === 'ready');
        this.button.classList.toggle('done', state === 'finished');
        if (state === 'finished') {
            this.buttonLabel.replaceChildren(svg('check'), formatTime(this.daily.elapsed()));
        } else {
            this.buttonLabel.replaceChildren('Daily');
        }
    }

    open() {
        const state = this.daily.state;
        if (state === 'ready') this.showIntro();
        else if (state === 'finished') this.showResult(this.daily.result());
        else if (state === 'gaveup') this.showGaveUp();
    }

    // ---------------------------------------------------------------- run

    async runCountdown() {
        const num = h('div', { class: 'countdown-num' });
        const overlay = h('div', { class: 'countdown' }, num);
        document.body.append(overlay);

        const show = (text, extra) => {
            num.textContent = text;
            num.className = 'countdown-num';
            void num.offsetWidth; // restart the animation
            num.classList.add('animate');
            if (extra) num.classList.add(extra);
        };

        await wait(250);
        for (const n of ['3', '2', '1']) {
            show(n);
            sounds.countdownTick();
            await wait(850);
        }

        show('GO!', 'go');
        sounds.countdownGo();
        overlay.classList.add('done');
        this.daily.begin();
        await wait(900);
        overlay.remove();
    }

    renderCard() {
        const daily = this.daily;
        const state = daily.state;
        this.card.replaceChildren();
        if (state !== 'countdown' && state !== 'running') return;

        const { number, target } = daily.puzzle();
        const running = state === 'running';
        const rarity = this.graph.rarity(target);

        this.timerEl.textContent = formatTime(daily.elapsed());
        this.lastTimerText = '';

        const header = h('div', { class: 'daily-head' },
            h('div', { class: 'daily-kicker' }, `Daily block #${number}`),
            running ? h('button', { class: 'mc-btn icon-btn small', title: 'Give up', onclick: () => this.confirmGiveUp() }, svg('flag')) : null);

        const targetRow = running
            ? h('div', { class: 'daily-target reveal' },
                h('div', { class: 'slot found', 'data-block': target }, this.art.icon(target, 32)),
                h('div', {},
                    h('div', { class: 'daily-name', style: { color: rarity.color } }, this.name(target)),
                    h('div', { class: 'daily-meta' }, `${rarity.label} · ${depthText(this.graph.distance[target])}`)))
            : h('div', { class: 'daily-target' },
                h('div', { class: 'slot mystery' }, '?'),
                h('div', {}, h('div', { class: 'daily-name' }, '???'), h('div', { class: 'daily-meta' }, 'Revealed at GO')));

        this.card.append(header, targetRow, h('div', { class: 'daily-clock' },
            this.timerEl,
            daily.revealed ? h('span', { class: 'daily-penalty' }, `+${formatTime(daily.penalty)}`) : null));

        if (!running) return;

        // Route: start, revealed steps, hidden steps, target
        const route = daily.route();
        const steps = route.map((step, i) => {
            const known = i === 0 || i === route.length - 1 || i <= daily.revealed;
            return [
                i > 0 ? h('span', { class: 'route-arrow' }, '›') : null,
                known
                    ? h('span', { class: 'route-step found', 'data-block': step }, this.art.icon(step, 16))
                    : h('span', { class: 'route-step hidden' }, '?'),
            ];
        });
        const remaining = daily.stepCount - daily.revealed;
        const deepest = route[daily.revealed];
        this.card.append(
            h('div', { class: 'daily-route' }, steps),
            h('div', { class: 'daily-trail' }, daily.revealed
                ? ['Follow the trail, then look inside ', h('b', {}, this.name(deepest))]
                : `Quickest route: ${plural(route.length - 1, 'zoom')}`),
            h('button', {
                class: 'mc-btn reveal-btn',
                disabled: remaining === 0 ? true : null,
                onclick: () => daily.revealStep(),
            }, svg('hint'), remaining ? `Reveal next step · +${STEP_PENALTY / 1000}s` : 'Full route revealed'));
    }

    // ---------------------------------------------------------------- modals

    showIntro() {
        const { number } = this.daily.puzzle();
        const streak = this.daily.streak();
        const rare = RARITIES.findIndex((r) => r.key === 'rare');
        openModal([
            h('div', { class: 'modal-kicker' }, `Daily block #${number} · ${dateLabel.format(new Date())}`),
            h('h2', { class: 'modal-title' }, 'Daily Block'),
            h('p', { class: 'modal-lead' },
                'One mystery block a day, the same one for everyone. It\'s always ',
                RARITIES.slice(rare).map((r, i, all) => [
                    h('b', { style: { color: r.color } }, r.label),
                    i < all.length - 2 ? ', ' : i === all.length - 2 ? ' or ' : '',
                ]),
                '.'),
            h('ul', { class: 'modal-rules' },
                h('li', {}, 'The view resets to the start, and the block is revealed when the clock starts.'),
                h('li', {}, 'The clock stops the moment its center is on screen.'),
                h('li', {}, `Stuck? Reveal the quickest route one step at a time, for +${STEP_PENALTY / 1000} seconds each.`)),
            streak ? h('div', { class: 'modal-best' }, 'Current streak: ', h('b', {}, plural(streak, 'day'))) : null,
            h('div', { class: 'modal-actions' },
                h('button', { class: 'mc-btn', onclick: () => closeModal() }, 'Not now'),
                h('button', {
                    class: 'mc-btn primary',
                    onclick: () => {
                        closeModal();
                        this.daily.start();
                    },
                }, 'Start')),
        ], { className: 'intro' });
    }

    confirmGiveUp() {
        openModal([
            h('h2', { class: 'modal-title small' }, 'Give up?'),
            h('p', { class: 'modal-lead' }, 'You\'ll see where it was hiding, but you can\'t try again until tomorrow\'s block.'),
            h('div', { class: 'modal-actions' },
                h('button', { class: 'mc-btn primary', onclick: () => closeModal() }, 'Keep looking'),
                h('button', {
                    class: 'mc-btn danger',
                    onclick: () => {
                        closeModal();
                        this.daily.giveUp();
                        this.showGaveUp();
                    },
                }, 'Give up')),
        ], { className: 'confirm' });
    }

    routeChain() {
        const route = this.daily.route();
        return h('div', { class: 'route' }, route.map((step, i) => [
            i > 0 ? h('span', { class: 'route-arrow' }, '›') : null,
            h('span', { class: 'route-step found', 'data-block': step }, this.art.icon(step, 32)),
        ]));
    }

    targetHeader(target) {
        const rarity = this.graph.rarity(target);
        return h('div', { class: 'daily-result-target' },
            h('div', { class: 'slot found big', 'data-block': target }, this.art.icon(target, 64)),
            h('div', { class: 'daily-name', style: { color: rarity.color } }, this.name(target)),
            h('div', { class: 'daily-meta' }, `${rarity.label} · ${depthText(this.graph.distance[target])}`));
    }

    showGaveUp() {
        const { number, target } = this.daily.puzzle();
        openModal([
            h('div', { class: 'modal-kicker' }, `Daily block #${number}`),
            h('h2', { class: 'modal-title small' }, 'It was hiding here'),
            this.targetHeader(target),
            h('div', { class: 'detail-label' }, 'Quickest route'),
            this.routeChain(),
            h('div', { class: 'modal-best' }, `Next block in ${formatWait(this.daily.msUntilTomorrow())}.`),
            h('div', { class: 'modal-actions' },
                h('button', { class: 'mc-btn primary', onclick: () => closeModal() }, 'Close')),
        ], { className: 'results' });
    }

    showResult(result, { celebrate = false } = {}) {
        const { number, target, time, revealed, steps, penalty, streak } = result;
        const rarity = this.graph.rarity(target);

        const share = `⛏️ Minecraft Fractal Daily Block #${number}\n` +
            `${rarity.label} block found in ${formatTime(time)}\n` +
            `🧭 ${revealed}/${steps} route steps revealed\n${location.origin}${location.pathname}`;
        const copyBtn = h('button', {
            class: 'mc-btn',
            onclick: async () => {
                try {
                    await navigator.clipboard.writeText(share);
                    copyBtn.textContent = 'Copied!';
                } catch {
                    copyBtn.textContent = 'Copy failed';
                }
                setTimeout(() => { copyBtn.textContent = 'Copy result'; }, 2000);
            },
        }, 'Copy result');

        const rain = celebrate ? new BlockRain(this.art.image, [this.art.frame(target)].filter(Boolean)) : null;

        openModal([
            h('div', { class: 'modal-kicker' }, `Daily block #${number}`),
            h('h2', { class: 'modal-title gold' }, 'Found it!'),
            this.targetHeader(target),
            h('div', { class: 'result-time' }, formatTime(time)),
            h('div', { class: 'badge' }, revealed
                ? `includes +${formatTime(penalty)} for ${plural(revealed, 'revealed step')}`
                : 'no route steps revealed'),
            h('div', { class: 'result-stats even' },
                h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, streak), h('div', { class: 'stat-label' }, 'day streak')),
                h('div', { class: 'stat' },
                    h('div', { class: 'stat-value' }, formatWait(this.daily.msUntilTomorrow())),
                    h('div', { class: 'stat-label' }, 'until the next block'))),
            h('div', { class: 'modal-actions' },
                copyBtn,
                h('button', { class: 'mc-btn primary', onclick: () => closeModal() }, 'Keep exploring')),
        ], { className: 'results', onClose: () => rain?.stop() });

        if (celebrate) {
            sounds.finish();
            rain.play();
        }
    }
}
