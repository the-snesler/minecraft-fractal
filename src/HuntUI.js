/**
 * Hunt UI
 *
 * DOM overlay for the always-on block collection: HUD meter, collection panel
 * (with hints), discovery toasts, block tooltips, and the completion screen.
 */

import { RARITIES } from './BlockGraph.js';
import { displayName } from './blockNames.js';
import { BlockRain } from './BlockRain.js';
import * as sounds from './sounds.js';
import {
    h, svg, plural, formatDuration, depthText, openModal, closeModal, isModalOpen, isModalDismissable,
} from './uiKit.js';

const TOAST_DURATION = 4000;
const MAX_TOASTS = 4;
const MAX_SOURCES = 5;
const NARROW_SCREEN = 640; // px; the collection covers the whole screen below this

export class HuntUI {
    /**
     * @param {import('./ScavengerHunt.js').ScavengerHunt} hunt
     * @param {import('./uiKit.js').BlockArt} art
     */
    constructor(hunt, art) {
        this.hunt = hunt;
        this.graph = hunt.graph;
        this.lut = hunt.lut;
        this.art = art;
        art.image.addEventListener('load', () => this.renderDetail());

        this.slots = new Map(); // block ID -> slot element
        this.tiers = RARITIES
            .map((rarity) => ({
                rarity,
                ids: this.graph.reachable
                    .filter((id) => this.graph.rarity(id) === rarity)
                    .sort((a, b) => this.graph.distance[a] - this.graph.distance[b] || this.name(a).localeCompare(this.name(b))),
            }))
            .filter((tier) => tier.ids.length > 0);

        this.selected = null;
        this.filter = 'all';
        this.query = '';
        this.panelOpen = false;
        this.pendingFinds = [];
        this.pendingTiers = [];
        this.unseen = 0;

        this.build();
        this.bindEvents();

        hunt.on('discover', (id) => this.pendingFinds.push(id));
        hunt.on('tier', (rarity) => this.pendingTiers.push(rarity));
        hunt.on('complete', (results) => this.showResults(results));
        hunt.on('hint', () => this.refresh());
        hunt.on('reset', () => {
            this.selected = null;
            this.unseen = 0;
            this.refresh();
        });
        this.refresh();

        if (hunt.foundCount === 0) {
            this.toast({
                icon: this.art.icon(this.graph.rootId, 32),
                title: 'Block hunt',
                name: `Find all ${hunt.total} blocks`,
                meta: 'Zoom in · press C for the collection',
                onclick: () => this.setPanelOpen(true),
            });
        }
    }

    name(id) {
        return this.lut.getBlockName(id);
    }

    color(id) {
        return this.graph.isReachable(id) ? this.graph.rarity(id).color : '#AAAAAA';
    }

    // ---------------------------------------------------------------- build

    build() {
        // HUD
        this.countEl = h('div', { class: 'hud-count' });
        this.hudSegments = this.tiers.map((tier) => {
            const fill = h('div', { class: 'hud-seg-fill', style: { background: tier.rarity.color } });
            const seg = h('div', { class: 'hud-seg', style: { flexGrow: tier.ids.length } }, fill);
            return { tier, seg, fill };
        });
        this.badgeEl = h('span', { class: 'hud-badge' });
        this.soundBtn = h('button', { class: 'mc-btn icon-btn', onclick: () => this.toggleSound() });
        this.hudActions = h('div', { class: 'hud-actions' },
            h('button', { class: 'mc-btn hud-collection', title: 'Collection (C)', onclick: () => this.togglePanel() },
                svg('grid'), h('span', { class: 'hud-label' }, 'Collection'), this.badgeEl),
            this.soundBtn);
        this.hud = h('div', { class: 'hunt-hud mc-panel' },
            h('div', { class: 'hud-progress', title: 'Open collection (C)', onclick: () => this.togglePanel() },
                this.countEl,
                h('div', { class: 'hud-bar' }, this.hudSegments.map((s) => s.seg))),
            this.hudActions);
        this.updateSoundButton();

        // Collection panel
        this.summaryEl = h('div', { class: 'panel-summary' });
        this.outlineToggle = h('input', {
            type: 'checkbox',
            onchange: (e) => this.hunt.setOutlinesEnabled(e.target.checked),
        });
        this.outlineToggle.checked = this.hunt.outlinesEnabled;
        this.pills = this.tiers.map((tier) => {
            const count = h('span', { class: 'pill-count' });
            const pill = h('button', {
                class: 'tier-pill',
                title: tier.rarity.label,
                style: { '--tier': tier.rarity.color },
                onclick: () => this.sections.get(tier.rarity.key).el.scrollIntoView({ behavior: 'smooth', block: 'start' }),
            }, h('span', { class: 'diamond' }), count);
            return { tier, pill, count };
        });
        this.searchInput = h('input', {
            class: 'panel-search',
            type: 'search',
            placeholder: 'Search blocks…',
            spellcheck: 'false',
            oninput: (e) => {
                this.query = e.target.value.trim().toLowerCase();
                this.applyFilter();
            },
        });
        this.filterButtons = ['all', 'missing', 'found'].map((filter) =>
            h('button', {
                class: `seg-btn${filter === this.filter ? ' active' : ''}`,
                'data-filter': filter,
                onclick: () => this.setFilter(filter),
            }, filter[0].toUpperCase() + filter.slice(1)));

        this.sections = new Map();
        const sectionEls = this.tiers.map((tier) => {
            const { rarity, ids } = tier;
            const count = h('span', { class: 'section-count' });
            const fill = h('div', { class: 'section-bar-fill' });
            const minDepth = this.graph.distance[ids[0]];
            const maxDepth = this.graph.distance[ids[ids.length - 1]];
            const depths = minDepth === maxDepth ? `Depth ${minDepth}` : `Depth ${minDepth}–${maxDepth}`;
            const grid = h('div', { class: 'slot-grid' }, ids.map((id) => this.createSlot(id)));
            const el = h('section', { class: 'tier-section', style: { '--tier': rarity.color } },
                h('div', { class: 'section-head' },
                    h('span', { class: 'diamond' }),
                    h('span', { class: 'section-title' }, rarity.label),
                    h('span', { class: 'section-depth' }, depths),
                    count),
                h('div', { class: 'section-bar' }, fill),
                grid);
            this.sections.set(rarity.key, { el, count, fill, tier });
            return el;
        });

        const neverGrid = h('div', { class: 'slot-grid' }, this.graph.unreachable.map((id) => this.createSlot(id)));
        this.neverSection = h('details', { class: 'never-section' },
            h('summary', {}, `Can never appear (${this.graph.unreachable.length})`),
            h('p', {}, `No block reachable from ${displayName(this.name(this.graph.rootId))} has a pixel whose color is closest to these, so they aren't part of the hunt.`),
            neverGrid);

        this.emptyEl = h('div', { class: 'panel-empty' }, 'No blocks match.');
        this.panelBody = h('div', { class: 'panel-body' },
            sectionEls,
            this.neverSection,
            this.emptyEl,
            h('div', { class: 'panel-footer' },
                h('button', { class: 'link-btn', onclick: () => this.confirmReset() }, 'Reset collection')));
        this.detail = h('div', { class: 'panel-detail' });
        this.detail.hidden = true;

        this.panel = h('aside', { class: 'hunt-panel mc-panel', 'aria-label': 'Collection' },
            h('div', { class: 'panel-head' },
                h('div', { class: 'panel-title-row' },
                    h('h2', { class: 'panel-title' }, 'Collection'),
                    h('button', { class: 'mc-btn icon-btn', title: 'Close (C)', onclick: () => this.setPanelOpen(false) }, svg('close'))),
                h('div', { class: 'panel-subrow' },
                    this.summaryEl,
                    h('label', { class: 'mc-switch', title: 'Outline blocks on screen the first time you find them' },
                        this.outlineToggle, h('span', { class: 'switch-track' }), 'Outline finds')),
                h('div', { class: 'tier-pills' }, this.pills.map((p) => p.pill)),
                h('div', { class: 'panel-controls' },
                    h('label', { class: 'search-wrap' }, svg('search'), this.searchInput),
                    h('div', { class: 'seg' }, this.filterButtons))),
            this.panelBody,
            this.detail);

        this.toasts = h('div', { class: 'hunt-toasts', 'aria-live': 'polite' });
        this.tooltip = h('div', { class: 'mc-tooltip' });
        this.tooltip.hidden = true;

        document.body.append(this.hud, this.panel, this.toasts, this.tooltip);
    }

    createSlot(id) {
        const slot = h('button', { class: 'slot', 'data-block': id, 'aria-label': displayName(this.name(id)) }, this.art.icon(id, 32));
        if (!this.graph.isReachable(id)) slot.classList.add('never');
        this.slots.set(id, slot);
        return slot;
    }

    /**
     * Add a button to the HUD (before the sound toggle)
     */
    addHudButton(button) {
        this.hudActions.insertBefore(button, this.soundBtn);
    }

    bindEvents() {
        // Tooltips for anything showing a block
        document.body.addEventListener('mouseover', (e) => {
            const target = e.target.closest?.('[data-block]');
            if (target) this.showTooltip(Number(target.dataset.block), e);
        });
        document.body.addEventListener('mouseout', (e) => {
            const target = e.target.closest?.('[data-block]');
            if (target && !target.contains(e.relatedTarget)) this.tooltip.hidden = true;
        });
        document.body.addEventListener('mousemove', (e) => {
            if (!this.tooltip.hidden) this.positionTooltip(e);
        });
        this.panel.addEventListener('click', (e) => {
            const target = e.target.closest('[data-block]');
            if (target) this.select(Number(target.dataset.block));
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (isModalDismissable()) closeModal();
                else if (this.panelOpen) this.setPanelOpen(false);
                return;
            }
            if (e.target.matches?.('input, textarea') || e.metaKey || e.ctrlKey || e.altKey || isModalOpen()) return;
            if (e.key === 'c' || e.key === 'C') {
                this.togglePanel();
            } else if (e.key === '/' && this.panelOpen) {
                e.preventDefault();
                this.searchInput.focus();
            }
        });

        window.addEventListener('resize', () => this.updateOcclusion());
    }

    // ---------------------------------------------------------------- updates

    refresh() {
        this.refreshSlots();
        this.refreshCounts();
        this.applyFilter();
        this.renderDetail();
    }

    /**
     * Per-frame: batched discovery updates
     */
    tick() {
        if (this.pendingFinds.length || this.pendingTiers.length) this.flushDiscoveries();
    }

    flushDiscoveries() {
        const finds = this.pendingFinds;
        const tiers = this.pendingTiers;
        this.pendingFinds = [];
        this.pendingTiers = [];

        for (const id of finds) {
            const slot = this.slots.get(id);
            slot.classList.add('found', 'is-new', 'pop');
            slot.classList.remove('hinted');
            slot.addEventListener('animationend', () => slot.classList.remove('pop'), { once: true });
        }
        if (!this.panelOpen) this.unseen += finds.length;

        // Toast the rarest finds individually and summarize the rest
        const rarestFirst = [...finds].sort((a, b) => this.graph.distance[b] - this.graph.distance[a]);
        const individual = rarestFirst.length > 3 ? rarestFirst.slice(0, 2) : rarestFirst;
        const rest = rarestFirst.slice(individual.length);
        if (rest.length) {
            this.toast({
                icon: this.art.icon(rest[0], 32),
                title: 'Blocks found!',
                name: `+${rest.length} more`,
                meta: 'Open collection (C)',
                onclick: () => this.setPanelOpen(true),
            });
        }
        for (const id of [...individual].reverse()) this.discoveryToast(id);

        for (const rarity of tiers) {
            this.toast({
                icon: h('span', { class: 'diamond big', style: { '--tier': rarity.color } }),
                title: 'Tier complete!',
                name: `Every ${rarity.label} block`,
                color: rarity.color,
                meta: plural(this.hunt.tierTotals[rarity.key], 'block'),
                className: 'toast-tier',
            });
        }

        // On the final find the completion fanfare plays instead
        if (!this.hunt.complete) {
            if (tiers.length) sounds.tierComplete();
            else if (finds.length) sounds.discover(RARITIES.indexOf(this.graph.rarity(rarestFirst[0])));
        }

        this.refreshCounts();
        if (this.filter !== 'all') this.applyFilter();
        if (this.selected !== null) this.renderDetail();
    }

    discoveryToast(id) {
        const rarity = this.graph.rarity(id);
        this.toast({
            icon: this.art.icon(id, 32),
            title: 'New block!',
            name: displayName(this.name(id)),
            color: rarity.color,
            meta: `${rarity.label} · depth ${this.graph.distance[id]}`,
            onclick: () => {
                this.setPanelOpen(true);
                this.select(id);
            },
        });
    }

    refreshSlots() {
        for (const [id, slot] of this.slots) {
            const found = this.hunt.isFound(id);
            slot.classList.toggle('found', found);
            slot.classList.toggle('hinted', this.hunt.hasSourceHint(id) && !found);
            slot.classList.toggle('selected', id === this.selected);
            if (!found) slot.classList.remove('is-new');
        }
    }

    refreshCounts() {
        const { foundCount, total, tierFound, tierTotals, hintCount } = this.hunt;
        this.countEl.innerHTML = `<b>${foundCount}</b><span>/${total}</span>`;
        for (const { tier, seg, fill } of this.hudSegments) {
            const key = tier.rarity.key;
            fill.style.width = `${(tierFound[key] / tierTotals[key]) * 100}%`;
            seg.title = `${tier.rarity.label}: ${tierFound[key]}/${tierTotals[key]}`;
        }
        for (const { tier, pill, count } of this.pills) {
            const key = tier.rarity.key;
            count.textContent = `${tierFound[key]}/${tierTotals[key]}`;
            pill.classList.toggle('complete', tierFound[key] === tierTotals[key]);
        }
        for (const { count, fill, tier } of this.sections.values()) {
            const key = tier.rarity.key;
            count.textContent = `${tierFound[key]}/${tierTotals[key]}`;
            fill.style.width = `${(tierFound[key] / tierTotals[key]) * 100}%`;
        }

        const summary = [`${foundCount} of ${total} found`];
        if (hintCount) summary.push(`${plural(hintCount, 'hint')} used`);
        this.summaryEl.replaceChildren(summary.join(' · '));
        if (this.hunt.complete) {
            this.summaryEl.append(' · ', h('button', { class: 'link-btn', onclick: () => this.showResults(this.hunt.results()) }, 'Results'));
        }

        this.badgeEl.textContent = this.unseen > 99 ? '99+' : String(this.unseen);
        this.badgeEl.hidden = this.unseen === 0;
    }

    // ---------------------------------------------------------------- panel

    togglePanel() {
        this.setPanelOpen(!this.panelOpen);
    }

    setPanelOpen(open) {
        if (!open && this.panelOpen) {
            // Finds have been seen in the collection now
            for (const slot of this.slots.values()) slot.classList.remove('is-new');
        }
        this.panelOpen = open;
        document.body.classList.toggle('hunt-panel-open', open);
        if (open) {
            this.unseen = 0;
            this.refreshCounts();
        } else {
            this.tooltip.hidden = true;
            this.searchInput.blur();
        }
        this.updateOcclusion();
    }

    /**
     * Blocks behind the collection panel aren't visible, so they don't count as found
     */
    updateOcclusion() {
        if (!this.panelOpen) {
            this.hunt.occludedRight = 0;
        } else if (window.innerWidth <= NARROW_SCREEN) {
            this.hunt.occludedRight = window.innerWidth;
        } else {
            this.hunt.occludedRight = this.panel.offsetWidth;
        }
    }

    setFilter(filter) {
        this.filter = filter;
        for (const btn of this.filterButtons) btn.classList.toggle('active', btn.dataset.filter === filter);
        this.applyFilter();
    }

    applyFilter() {
        const matches = (id) => {
            if (this.query) {
                const name = this.name(id);
                if (!displayName(name).toLowerCase().includes(this.query) && !name.includes(this.query)) return false;
            }
            if (this.filter === 'missing') return !this.hunt.isFound(id);
            if (this.filter === 'found') return this.hunt.isFound(id);
            return true;
        };

        let anyVisible = false;
        for (const { el, tier } of this.sections.values()) {
            let visible = 0;
            for (const id of tier.ids) {
                const show = matches(id);
                this.slots.get(id).hidden = !show;
                if (show) visible++;
            }
            el.hidden = visible === 0;
            anyVisible ||= visible > 0;
        }

        // Unreachable blocks only show when browsing everything or searching
        let neverVisible = 0;
        for (const id of this.graph.unreachable) {
            const show = this.filter === 'all' && matches(id);
            this.slots.get(id).hidden = !show;
            if (show) neverVisible++;
        }
        this.neverSection.hidden = neverVisible === 0;
        if (this.query && neverVisible) this.neverSection.open = true;

        this.emptyEl.hidden = anyVisible || neverVisible > 0;
    }

    select(id) {
        this.selected = this.selected === id && !this.detail.hidden ? null : id;
        this.refreshSlots();
        this.renderDetail();
        if (this.selected !== null) this.slots.get(id)?.scrollIntoView({ block: 'nearest' });
    }

    renderDetail() {
        const id = this.selected;
        this.tooltip.hidden = true;
        this.detail.replaceChildren();
        this.detail.hidden = id === null;
        if (id === null) return;

        const graph = this.graph;
        const hunt = this.hunt;
        const name = this.name(id);
        const reachable = graph.isReachable(id);
        const found = hunt.isFound(id);

        let status;
        if (!reachable) status = h('div', { class: 'detail-status never' }, 'Can never appear');
        else if (found) status = h('div', { class: 'detail-status found' }, svg('check'), 'Found');
        else status = h('div', { class: 'detail-status missing' }, 'Not found yet');

        this.detail.append(h('div', { class: 'detail-head' },
            h('div', { class: `slot big${found || !reachable ? ' found' : ''}` }, this.art.icon(id, 64)),
            h('div', { class: 'detail-info' },
                h('div', { class: 'detail-name', style: { color: this.color(id) } }, displayName(name)),
                h('div', { class: 'detail-meta' },
                    reachable ? `${graph.rarity(id).label} · ${depthText(graph.distance[id])}` : 'Not part of the hunt'),
                status),
            h('button', { class: 'mc-btn icon-btn', title: 'Close', onclick: () => this.select(id) }, svg('close'))));

        if (!reachable) return;
        if (id === graph.rootId) {
            this.detail.append(h('p', { class: 'detail-note' }, 'Every hunt starts here. Zoom in to see what it\'s made of.'));
            return;
        }

        // Found blocks show everything; missing blocks cost a hint per level
        const showSources = found || hunt.hasSourceHint(id);
        const showRoute = found || hunt.hasRouteHint(id);

        if (!showSources) {
            this.detail.append(h('div', { class: 'hint-box' },
                h('p', {}, `Can't find ${displayName(name)}? A hint shows which blocks it hides inside.`),
                h('button', { class: 'mc-btn primary', onclick: () => hunt.revealSources(id) }, svg('hint'), 'Reveal hint')));
            return;
        }

        const isFound = (block) => hunt.isFound(block);
        const sources = graph.sources(id, isFound);
        this.detail.append(
            h('div', { class: 'detail-label' }, 'Zoom into one of these'),
            h('div', { class: 'sources' }, sources.slice(0, MAX_SOURCES).map((source) =>
                h('button', { class: 'source', 'data-block': source.id },
                    this.art.pixelMap(source.id, id),
                    h('div', { class: 'source-info' },
                        h('div', { class: 'source-name', style: { color: this.color(source.id) } }, displayName(this.name(source.id))),
                        h('div', { class: `source-meta${source.found ? ' found' : ''}` },
                            source.found ? [svg('check'), 'Found'] : 'Not found yet',
                            ` · ${source.pixels} of 256 pixels`))))),
        );
        if (sources.length > MAX_SOURCES) {
            const more = sources.slice(MAX_SOURCES);
            this.detail.append(h('div', { class: 'source-more' },
                h('span', {}, `+${more.length} more`),
                more.slice(0, 16).map((source) =>
                    h('span', { class: `mini${source.found ? ' found' : ''}`, 'data-block': source.id }, this.art.icon(source.id, 16)))));
        }

        if (!showRoute) {
            this.detail.append(h('div', { class: 'hint-box' },
                h('p', {}, 'Still stuck? Another hint shows the quickest route from the start.'),
                h('button', { class: 'mc-btn primary', onclick: () => hunt.revealRoute(id) }, svg('hint'), 'Show route')));
            return;
        }

        const route = graph.route(id, isFound);
        this.detail.append(
            h('div', { class: 'detail-label' }, `Quickest route · ${plural(route.length - 1, 'zoom')}`),
            h('div', { class: 'route' }, route.map((step, i) => [
                i > 0 ? h('span', { class: 'route-arrow' }, '›') : null,
                h('span', { class: `route-step${hunt.isFound(step) ? ' found' : ''}`, 'data-block': step }, this.art.icon(step, 32)),
            ])));
    }

    // ---------------------------------------------------------------- tooltip

    showTooltip(id, e) {
        const graph = this.graph;
        const reachable = graph.isReachable(id);
        const found = this.hunt.isFound(id);
        const lines = [
            h('div', { class: 'tt-name', style: { color: this.color(id) } }, displayName(this.name(id))),
            h('div', { class: 'tt-line' }, reachable ? `${graph.rarity(id).label} · ${depthText(graph.distance[id])}` : 'Can never appear'),
        ];
        if (reachable) {
            lines.push(found
                ? h('div', { class: 'tt-line found' }, 'Found')
                : h('div', { class: 'tt-line missing' }, this.hunt.hasSourceHint(id) ? 'Not found yet · hint revealed' : 'Not found yet'));
        }
        lines.push(h('div', { class: 'tt-id' }, `minecraft:${this.name(id)}`));
        this.tooltip.replaceChildren(...lines);
        this.tooltip.hidden = false;
        this.positionTooltip(e);
    }

    positionTooltip(e) {
        const pad = 14;
        const { offsetWidth: w, offsetHeight: ht } = this.tooltip;
        let x = e.clientX + pad;
        let y = e.clientY - ht - 6;
        if (x + w > window.innerWidth - 4) x = e.clientX - w - pad;
        if (y < 4) y = e.clientY + pad + 6;
        this.tooltip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }

    // ---------------------------------------------------------------- toasts

    toast({ icon, title, name, color = '#FFFFFF', meta, onclick, className = '' }) {
        const el = h('div', { class: `toast mc-panel ${className}`, onclick, role: onclick ? 'button' : null },
            h('div', { class: 'toast-icon' }, icon),
            h('div', { class: 'toast-text' },
                h('div', { class: 'toast-title' }, title),
                h('div', { class: 'toast-name', style: { color } }, name),
                meta ? h('div', { class: 'toast-meta' }, meta) : null));
        this.toasts.prepend(el);

        const live = [...this.toasts.children].filter((t) => !t.classList.contains('leaving'));
        for (const old of live.slice(MAX_TOASTS)) this.dismissToast(old);
        setTimeout(() => this.dismissToast(el), TOAST_DURATION);
    }

    dismissToast(el) {
        if (el.classList.contains('leaving')) return;
        el.classList.add('leaving');
        setTimeout(() => el.remove(), 400);
    }

    // ---------------------------------------------------------------- modals

    confirmReset() {
        openModal([
            h('h2', { class: 'modal-title small' }, 'Reset collection?'),
            h('p', { class: 'modal-lead' },
                `You've found ${this.hunt.foundCount} of ${this.hunt.total} blocks. Resetting forgets every find and hint, and restarts the clock.`),
            h('div', { class: 'modal-actions' },
                h('button', { class: 'mc-btn primary', onclick: () => closeModal() }, 'Keep collection'),
                h('button', {
                    class: 'mc-btn danger',
                    onclick: () => {
                        closeModal();
                        this.hunt.reset();
                    },
                }, 'Reset')),
        ], { className: 'confirm' });
    }

    showResults(results) {
        const { time, hints, total, splits, lastFound } = results;
        sounds.finish();

        const share = `⛏️ Minecraft Fractal Block Hunt\nFound all ${total} blocks in ${formatDuration(time)}` +
            ` (${plural(hints, 'hint')})\n${location.origin}${location.pathname}`;
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

        const frames = this.graph.reachable.map((id) => this.art.frame(id)).filter(Boolean);
        const rain = new BlockRain(this.art.image, frames);

        openModal([
            h('div', { class: 'modal-kicker' }, 'Collection complete'),
            h('h2', { class: 'modal-title gold' }, `All ${total} blocks found!`),
            h('div', { class: 'result-time' }, formatDuration(time)),
            h('div', { class: 'badge' }, 'from your first find to your last'),
            h('div', { class: 'result-stats' },
                h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, hints), h('div', { class: 'stat-label' }, hints === 1 ? 'hint used' : 'hints used')),
                h('div', { class: 'stat', 'data-block': lastFound },
                    h('div', { class: 'stat-value' }, this.art.icon(lastFound, 32)),
                    h('div', { class: 'stat-label' }, ['Last: ', h('span', { style: { color: this.color(lastFound) } }, displayName(this.name(lastFound)))]))),
            h('div', { class: 'splits' },
                h('div', { class: 'detail-label' }, 'Tier completed at'),
                splits.map(({ rarity, time: splitTime, total: count }) =>
                    h('div', { class: 'split', style: { '--tier': rarity.color } },
                        h('span', { class: 'diamond' }),
                        h('span', { class: 'split-label' }, rarity.label),
                        h('span', { class: 'split-count' }, plural(count, 'block')),
                        h('span', { class: 'split-time' }, formatDuration(splitTime))))),
            h('div', { class: 'modal-actions' },
                copyBtn,
                h('button', { class: 'mc-btn primary', onclick: () => closeModal() }, 'Keep exploring')),
        ], { className: 'results', onClose: () => rain.stop() });
        rain.play();
    }

    // ---------------------------------------------------------------- sound

    toggleSound() {
        sounds.setMuted(!sounds.isMuted());
        this.updateSoundButton();
    }

    updateSoundButton() {
        const muted = sounds.isMuted();
        this.soundBtn.replaceChildren(svg(muted ? 'muted' : 'sound'));
        this.soundBtn.title = muted ? 'Unmute' : 'Mute';
    }
}
