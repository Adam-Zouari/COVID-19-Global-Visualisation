const datasetNames = { epidem: 'Cases & deaths', hospitalizations: 'Hospitalizations', vaccinations: 'Vaccinations' };
let timelineTimer = null;
let timelineSpeed = 1;
const timelineSpeeds = [0.5, 1, 2, 4];

function applyDatasetTheme(dataset) {
    document.documentElement.dataset.category = dataset;
    document.body.dataset.category = dataset;
    const ids = { epidem: 'epidemBtn', hospitalizations: 'hospBtn', vaccinations: 'vaccBtn' };
    document.querySelectorAll('.dataset-btn').forEach(button => {
        const active = button.id === ids[dataset];
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
}

function appendCountryLabel(container, code, name, flagClass) {
    if (/^[a-z]{2}$/i.test(code)) {
        const flag = document.createElement('img');
        flag.className = flagClass;
        flag.src = `https://flagcdn.com/${code.toLowerCase()}.svg`;
        flag.alt = ''; flag.loading = 'lazy'; flag.onerror = () => { flag.hidden = true; };
        container.appendChild(flag);
    }
    const label = document.createElement('span'); label.textContent = name; container.appendChild(label);
}

function currentMetric() {
    const service = window.dataService || window.globeInstance?.dataService;
    return service?.getMetricMetadata?.() || { label: service?.currentColumn || 'Observations', kind: 'daily', allowedUnits: ['count'], smoothingAllowed: true };
}

function hasPopulation() {
    const service = window.dataService || window.globeInstance?.dataService;
    return service?.getAllCountries?.().some(country => service.getPopulation?.(country.countryCode) > 0) || false;
}

function validateDisplaySettings() {
    const service = window.dataService || window.globeInstance?.dataService;
    const metric = currentMetric();
    if (!metric.allowedUnits.includes(service.displayUnit) || (service.displayUnit !== 'count' && !hasPopulation())) service.displayUnit = 'count';
    if (!metric.smoothingAllowed) service.smoothing = 'raw';
}

function changeDataset(dataset) {
    const globe = window.globeInstance;
    if (!globe?.dataService.availableDates.length || !Object.hasOwn(datasetNames, dataset)) return;
    stopTimeline();
    globe.dataService.changeDataset(dataset);
    // Preserve smoothing for daily additions and occupancy snapshots. Cumulative
    // totals always retain their raw source meaning.
    validateDisplaySettings();
    applyDatasetTheme(dataset);
    refreshAtlasViews();
}

function refreshAtlasViews() {
    const globe = window.globeInstance;
    if (!globe?.worldData) return;
    validateDisplaySettings();
    globe.refreshData();
    if (window.CompareMode?.state.active) {
        CompareUI.initializeDateRangeSlider();
        CompareMode.syncControls();
        CompareMode.updateComparisonView();
    } else if (document.getElementById('visualizationPanel')?.hidden === false) changeVisualization();
    syncAtlasState();
}

function syncAtlasState() {
    const service = window.dataService || window.globeInstance?.dataService;
    if (!service) return;
    const comparison = window.CompareMode?.state;
    window.AtlasStore?.setState({
        view: comparison?.active ? 'compare' : 'explore', category: service.currentDataset,
        metric: service.currentColumn, unit: service.displayUnit || 'count', smoothing: service.smoothing || 'raw',
        selectedDate: service.currentDate, selectedCountry: window.globeInstance?.selectedCountryCode || null,
        compareCountries: comparison?.countries || [], compareRange: comparison?.dateRange || { start: 0, end: 100 },
        compareLayout: comparison?.displayMode || 'combined', compareChartType: comparison?.chartType || 'line',
        compareScale: comparison?.scale || 'shared', dataMode: service.dataSource === 'sample' ? 'sample' : 'csv'
    });
    updateAtlasPresentation();
}

function updateAtlasPresentation() {
    const service = window.dataService || window.globeInstance?.dataService;
    if (!service) return;
    const metric = currentMetric(), dates = service.getAvailableDates?.() || service.availableDates || [];
    applyDatasetTheme(service.currentDataset);
    const setText = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    const unit = service.getUnitLabel?.() || 'Count';
    const unitText = unit === 'Count' ? 'Absolute count' : unit;
    setText('mapMetricLabel', metric.label);
    const metricSelector = document.getElementById('dataSelector');
    if (metricSelector) metricSelector.title = metric.label;
    const metricName = document.getElementById('selectedMetricName');
    if (metricName) { metricName.textContent = metric.label; metricName.hidden = metric.label.length < 33; }
    setText('mapUnitsLabel', `${unitText}${service.smoothing === '7day' ? ' · 7-day average' : ''}`);
    setText('timelineMeasure', service.smoothing === '7day' ? 'Trailing 7-day average' : 'Observation date');
    const units = document.getElementById('unitSelector');
    if (units) {
        units.replaceChildren();
        for (const value of metric.allowedUnits) {
            const option = document.createElement('option'); option.value = value;
            option.textContent = value === 'count' ? 'Absolute count' : service.getUnitLabel?.(service.currentColumn, value) || value;
            option.disabled = value !== 'count' && !hasPopulation(); units.appendChild(option);
        }
        units.value = service.displayUnit || 'count';
    }
    for (const [id, value] of [['rawBtn', 'raw'], ['averageBtn', '7day']]) {
        const button = document.getElementById(id);
        if (!button) continue;
        const active = (service.smoothing || 'raw') === value;
        button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
        button.disabled = value === '7day' && !metric.smoothingAllowed;
    }
    const smoothingGroup = document.querySelector('.smoothing-group');
    if (smoothingGroup) smoothingGroup.hidden = !metric.smoothingAllowed;
    if (dates.length) {
        const firstYear = Number(dates[0].slice(0, 4)), lastYear = Number(dates.at(-1).slice(0, 4));
        setText('availablePeriod', firstYear === lastYear ? String(firstYear) : `${firstYear} — ${lastYear}`);
        setText('availableCountries', `${service.getAllCountries().length} countries / territories`);
        const years = document.getElementById('timelineYears');
        if (years && years.dataset.period !== `${firstYear}-${lastYear}`) {
            years.replaceChildren(); years.dataset.period = `${firstYear}-${lastYear}`;
            for (let year = firstYear + 1; year < lastYear; year += Math.max(1, Math.ceil((lastYear - firstYear) / 6))) {
                const span = document.createElement('span'); span.textContent = year; years.appendChild(span);
            }
        }
        const count = service.getAllCountries().filter(country => {
            const value = typeof service.getDisplayValue === 'function' ? service.getDisplayValue(country.countryCode) : service.getDataValue?.(country.countryCode);
            return typeof value === 'number' && Number.isFinite(value);
        }).length;
        setText('coverageCount', `${count} ${count === 1 ? 'country' : 'countries'} with data`);
    }
    const active = window.CompareMode?.state.active || false;
    const intro = document.querySelector('.page-intro'); if (intro) intro.hidden = active;
    const count = window.CompareMode?.state.countries.length || 0;
    const badge = document.getElementById('compareCount'); if (badge) { badge.hidden = !count; badge.textContent = count; }
    const demo = service.dataSource === 'sample';
    const qualityNote = document.getElementById('dataQualityNote');
    if (qualityNote) qualityNote.hidden = service.dataSource !== 'csv' || !qualityNote.textContent;
    const source = document.getElementById('dataSourceSelector');
    if (source) {
        source.value = service.dataSource;
        source.dataset.source = service.dataSource;
        source.querySelector('[value="upload"]').hidden = service.dataSource !== 'upload';
        source.title = demo ? 'Fictional demonstration data' : service.dataSource === 'upload' ? 'Uploaded files are local to this tab' : 'Original Google COVID-19 Open Data · Historical observations';
    }
}

window.atlasActions = {
    setView(view) { stopTimeline(); if (view === 'compare') CompareMode.enter(); else CompareMode.exit(); syncAtlasState(); },
    setMetric(column) {
        const service = window.dataService || window.globeInstance?.dataService;
        if (!service?.availableColumns[service.currentDataset].includes(column)) return;
        service.changeColumn(column); validateDisplaySettings(); refreshAtlasViews();
    },
    setUnit(unit) {
        const service = window.dataService || window.globeInstance?.dataService;
        if (!currentMetric().allowedUnits.includes(unit) || (unit !== 'count' && !hasPopulation())) return;
        service.displayUnit = unit; refreshAtlasViews();
    },
    setSmoothing(smoothing) {
        if (!['raw', '7day'].includes(smoothing) || (smoothing === '7day' && !currentMetric().smoothingAllowed)) return;
        (window.dataService || window.globeInstance.dataService).smoothing = smoothing; refreshAtlasViews();
    },
    setCountry(code) { window.globeInstance?.goToCountry(code); }
};

function openMethodology() { stopTimeline(); document.getElementById('methodologyDialog').showModal(); }
function closeMethodology() { document.getElementById('methodologyDialog').close(); }

function stopTimeline() {
    clearInterval(timelineTimer); timelineTimer = null;
    const button = document.getElementById('playTimelineBtn');
    if (button) { button.textContent = '▶'; button.setAttribute('aria-label', 'Play timeline'); button.setAttribute('aria-pressed', 'false'); }
}

function scheduleTimeline(slider) {
    clearInterval(timelineTimer);
    timelineTimer = setInterval(() => {
        slider.value = String(Math.min(Number(slider.max), Number(slider.value) + 1));
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        if (Number(slider.value) >= Number(slider.max)) stopTimeline();
    }, 500 / timelineSpeed);
}

function setTimelineSpeed(value) {
    const speed = Number(value);
    timelineSpeed = timelineSpeeds.includes(speed) ? speed : 1;
    const selector = document.getElementById('timelineSpeed');
    if (selector) selector.value = String(timelineSpeed);
    if (timelineTimer !== null) scheduleTimeline(document.getElementById('dateSlider'));
}

function toggleTimeline() {
    if (timelineTimer !== null) { stopTimeline(); return; }
    const slider = document.getElementById('dateSlider');
    if (!window.dataService.availableDates.length) return;
    if (Number(slider.value) >= Number(slider.max)) slider.value = '0';
    const button = document.getElementById('playTimelineBtn');
    button.textContent = 'Ⅱ'; button.setAttribute('aria-label', 'Pause timeline'); button.setAttribute('aria-pressed', 'true');
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    scheduleTimeline(slider);
}

function initializeUI() {
    if (initializeUI.initialized) return;
    initializeUI.initialized = true;
    applyDatasetTheme((window.dataService || window.globeInstance?.dataService).currentDataset);
    const source = document.getElementById('dataSourceSelector');
    if (source) {
        source.value = (window.dataService || window.globeInstance?.dataService).dataSource;
        source.onchange = () => {
            if (!['csv', 'sample'].includes(source.value)) return;
            const url = new URL(window.location.href);
            if (source.value === 'sample') url.searchParams.set('data', 'sample'); else url.searchParams.delete('data');
            window.location.assign(`${url.pathname}${url.search}${url.hash}`);
        };
    }
    document.getElementById('countrySearchInput')?.addEventListener('input', filterCountries);
    document.getElementById('searchModal')?.addEventListener('click', event => { if (event.target.id === 'searchModal') closeSearch(); });
    document.getElementById('errorClose')?.addEventListener('click', () => { document.getElementById('errorDisplay').style.display = 'none'; });
    document.getElementById('filtersToggle')?.addEventListener('click', event => {
        const open = document.querySelector('.control-panel').classList.toggle('filters-open');
        event.currentTarget.setAttribute('aria-expanded', String(open));
    });
    document.getElementById('countryExpandBtn')?.addEventListener('click', event => {
        const expanded = document.getElementById('countryInfo').classList.toggle('expanded');
        event.currentTarget.setAttribute('aria-expanded', String(expanded));
        event.currentTarget.textContent = expanded ? 'Fewer details ⌃' : 'More details ⌄';
    });
    document.getElementById('addToCompareBtn')?.addEventListener('click', () => {
        const code = window.globeInstance?.selectedCountryCode;
        if (code) { CompareMode.addCountry(code); atlasActions.setView('compare'); }
    });
    document.getElementById('playTimelineBtn')?.addEventListener('click', toggleTimeline);
    const speed = document.getElementById('timelineSpeed');
    if (speed) {
        speed.value = String(timelineSpeed);
        speed.addEventListener('change', () => setTimelineSpeed(speed.value));
    }
    document.getElementById('dateSlider')?.addEventListener('input', event => { if (event.isTrusted) stopTimeline(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopTimeline(); });
    document.addEventListener('country-selected', () => { syncAtlasState(); if (!document.getElementById('visualizationPanel')?.hidden) changeVisualization(); });
    document.addEventListener('atlas-data-updated', syncAtlasState);
    document.addEventListener('atlas-ready', syncAtlasState);
    document.addEventListener('keydown', event => {
        const search = document.getElementById('searchModal');
        const editing = /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName) || event.target.isContentEditable;
        if ((event.key === '/' || (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey))) && !editing && search?.hidden) {
            event.preventDefault(); openSearch(); return;
        }
        if (search && !search.hidden) {
            if (event.key === 'Escape') { event.preventDefault(); closeSearch(); }
            if (event.key === 'Tab') {
                const nodes = [...search.querySelectorAll('button, input')].filter(element => !element.hidden && !element.disabled);
                if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
                else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
            }
        } else if (event.key === 'Escape' && !document.getElementById('methodologyDialog')?.open) {
            stopTimeline();
            if (window.CompareMode?.state.active) CompareMode.exit();
            else if (!document.getElementById('visualizationPanel')?.hidden) closeCountryAnalysis();
        }
    });
}
