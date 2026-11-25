(() => {
    'use strict';

    const root = document.documentElement;
    const control = document.getElementById('qualityControl');
    const summary = control.querySelector('summary');
    const radios = Array.from(control.querySelectorAll('input'));
    const qualityStatus = document.getElementById('effectiveQuality');
    const tiers = ['lite', 'balanced', 'high'];
    const tierLabels = { lite: '省电', balanced: '均衡', high: '高画质' };
    const storageKey = 'heimanba.effects';
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const reducedTransparency = matchMedia('(prefers-reduced-transparency: reduce)');
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    const connection = navigator.connection;
    const supportsGlass = CSS.supports('backdrop-filter', 'blur(1px)') ||
        CSS.supports('-webkit-backdrop-filter', 'blur(1px)');

    let preference = 'auto';
    try {
        const stored = localStorage.getItem(storageKey);
        if (tiers.includes(stored)) preference = stored;
    } catch {
        // Local storage can be unavailable when the page is opened as a file.
    }

    let measuredCeiling = 2;
    let lastSample = -Infinity;
    let raf = null;

    function initialTier() {
        const cores = navigator.hardwareConcurrency;
        const memory = navigator.deviceMemory;
        if (reducedMotion.matches || connection?.saveData ||
            (cores && cores <= 2) || (memory && memory <= 2)) return 0;
        if (finePointer.matches && cores >= 8 && (!memory || memory >= 8)) return 2;
        return 1;
    }

    function applyQuality() {
        const index = preference === 'auto'
            ? Math.min(initialTier(), measuredCeiling)
            : tiers.indexOf(preference);
        const tier = !supportsGlass || reducedTransparency.matches ? 'lite' : tiers[index];
        root.dataset.quality = tier;
        qualityStatus.textContent = `当前：${tierLabels[tier]}`;
    }

    function stopSampling() {
        if (raf !== null) cancelAnimationFrame(raf);
        raf = null;
    }

    function sampleFrames() {
        if (raf !== null || document.hidden || preference !== 'auto' ||
            root.dataset.quality === 'lite' || performance.now() - lastSample < 6000) return;

        lastSample = performance.now();
        let previous;
        let intervals = 0;
        let slowFrames = 0;
        let severeFrames = 0;

        // Bound each sample; only lower the quality for sustained stutter.
        const tick = (now) => {
            if (previous !== undefined) {
                const interval = now - previous;
                intervals++;
                if (interval > 28) slowFrames++;
                if (interval > 44) severeFrames++;
            }
            previous = now;
            if (intervals < 36) {
                raf = requestAnimationFrame(tick);
                return;
            }

            raf = null;
            if (slowFrames < 12) return;
            const current = tiers.indexOf(root.dataset.quality);
            measuredCeiling = severeFrames >= 12 ? 0 : Math.max(0, current - 1);
            applyQuality();
        };
        raf = requestAnimationFrame(tick);
    }

    function onCapabilitiesChange() {
        stopSampling();
        lastSample = -Infinity;
        applyQuality();
        sampleFrames();
    }

    for (const query of [reducedMotion, reducedTransparency, finePointer]) {
        query.addEventListener('change', onCapabilitiesChange);
    }
    connection?.addEventListener('change', onCapabilitiesChange);

    window.addEventListener('load', () => {
        window.setTimeout(sampleFrames, 250);
    }, { once: true });
    window.addEventListener('scroll', sampleFrames, { passive: true });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopSampling();
    });

    for (const radio of radios) radio.checked = radio.value === preference;
    control.addEventListener('change', (event) => {
        if (!radios.includes(event.target)) return;
        preference = event.target.value;
        try {
            if (preference === 'auto') localStorage.removeItem(storageKey);
            else localStorage.setItem(storageKey, preference);
        } catch {
            // The current choice still applies when it cannot be saved.
        }
        onCapabilitiesChange();
    });

    document.addEventListener('click', (event) => {
        if (control.open && !control.contains(event.target)) control.open = false;
    });
    document.addEventListener('keydown', (event) => {
        if (control.open && event.key === 'Escape') {
            const wasFocused = control.contains(document.activeElement);
            control.open = false;
            if (wasFocused) summary.focus();
        }
    });

    applyQuality();
    control.hidden = false;

    const navLinks = document.querySelectorAll('.navigation a');
    function syncNavigation() {
        const hash = location.hash || '#home';
        for (const link of navLinks) {
            if (link.hash === hash) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
        }
    }
    window.addEventListener('hashchange', syncNavigation);
    syncNavigation();

    const graph = document.getElementById('contributionGraph');
    const graphScroll = document.getElementById('graphScroll');
    const graphStatus = document.getElementById('graphStatus');
    const refresh = document.getElementById('refreshGraph');
    let refreshCount = 0;

    function renderGraph() {
        const days = document.createDocumentFragment();
        for (let day = 0; day < 365; day++) {
            const cell = document.createElement('span');
            const value = Math.random();
            const level = value < .5 ? 0 : value < .71 ? 1 : value < .85 ? 2 : value < .95 ? 3 : 4;
            cell.className = `contribution-day level-${level}`;
            days.appendChild(cell);
        }
        graph.replaceChildren(days);
    }

    function refreshGraph() {
        renderGraph();
        refreshCount++;
        graphStatus.textContent = `已刷新示意数据，共刷新 ${refreshCount} 次。`;
    }

    refresh.addEventListener('click', refreshGraph);
    document.addEventListener('keydown', (event) => {
        if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
            event.key.toLowerCase() !== 'r' || control.open ||
            event.target.closest?.('input, button, textarea, select, [contenteditable]')) return;
        refreshGraph();
    });

    function syncGraphFocus() {
        if (graphScroll.scrollWidth > graphScroll.clientWidth) {
            graphScroll.tabIndex = 0;
            graphScroll.setAttribute('role', 'region');
            graphScroll.setAttribute('aria-label', '贡献热力图');
        } else {
            graphScroll.removeAttribute('tabindex');
            graphScroll.removeAttribute('role');
            graphScroll.removeAttribute('aria-label');
        }
    }

    renderGraph();
    refresh.hidden = false;
    new ResizeObserver(syncGraphFocus).observe(graphScroll);
})();
