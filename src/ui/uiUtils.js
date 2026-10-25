const datasetNames = { epidem: 'Cases & deaths', hospitalizations: 'Hospitalizations', vaccinations: 'Vaccinations' };
let timelineTimer = null;
let timelineSpeed = 1;
const timelineSpeeds = [0.5, 1, 2, 4];
let lastGlobePresentation = null;

// Run before click handlers move focus into menus or onto panel headings.
// Keep that focus for accessibility without showing keyboard rings after a tap.
document.addEventListener('pointerdown', () => { document.documentElement.dataset.inputModality = 'pointer'; }, true);
document.addEventListener('keydown', event => {
    if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) document.documentElement.dataset.inputModality = 'keyboard';
}, true);

function applyDatasetTheme(dataset) {
    document.documentElement.dataset.category = dataset;
    const ids = { epidem: 'epidemBtn', hospitalizations: 'hospBtn', vaccinations: 'vaccBtn' };
    for (const [category, id] of Object.entries(ids)) {
        const button = document.getElementById(id);
        if (!button) continue;
        const active = category === dataset;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    }
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

function workspaceService(scope = 'globe') {
    return window.AtlasWorkspaces?.get(scope) || window.dataService || window.globeInstance?.dataService;
}

function currentMetric(service = workspaceService()) {
    return service?.getMetricMetadata?.() || { label: service?.currentColumn || 'Observations', kind: 'daily', allowedUnits: ['count'], smoothingAllowed: true };
}

function hasPopulation() {
    const service = window.dataService || window.globeInstance?.dataService;
    return service?.getAllCountries?.().some(country => service.getPopulation?.(country.countryCode) > 0) || false;
}

function updateSelectOptions(select, choices) {
    if (select.options.length !== choices.length || choices.some((choice, index) => {
        const option = select.options[index];
        return option.value !== choice.value || (option.parentElement === select ? '' : option.parentElement.label) !== (choice.group || '');
    })) {
        select.replaceChildren();
        let group = null;
        for (const choice of choices) {
            if (choice.group && group?.label !== choice.group) {
                group = document.createElement('optgroup'); group.label = choice.group; select.appendChild(group);
            } else if (!choice.group) group = null;
            const option = document.createElement('option'); option.value = choice.value;
            (group || select).appendChild(option);
        }
    }
    choices.forEach((choice, index) => {
        const option = select.options[index];
        if (option.textContent !== choice.label) option.textContent = choice.label;
        option.disabled = Boolean(choice.disabled);
    });
}

function validateDisplaySettings(service = workspaceService()) {
    const metric = currentMetric(service);
    if (!metric.allowedUnits.includes(service.displayUnit) || (service.displayUnit !== 'count' && !hasPopulation())) service.displayUnit = 'count';
    if (!metric.smoothingAllowed) service.smoothing = 'raw';
}

function changeDataset(dataset, scope = window.CompareMode?.state.active ? 'compare' : 'globe') {
    const globe = window.globeInstance;
    if (!globe?.dataService.availableDates.length || !Object.hasOwn(datasetNames, dataset)) return;
    const service = workspaceService(scope);
    if (service.currentDataset === dataset && service.availableColumns[dataset]?.includes(service.currentColumn)) return;
    if (scope !== 'country') stopTimeline();
    const previousDates = service.getAvailableDates();
    if (window.AtlasWorkspaces) AtlasWorkspaces.switchDataset(scope, dataset);
    else service.changeDataset(dataset);
    // Preserve smoothing for daily additions and occupancy snapshots. Cumulative
    // totals always retain their raw source meaning.
    preserveWorkspaceRange(scope, previousDates, service.getAvailableDates());
    refreshAtlasViews(scope, { datesChanged: true });
}

function preserveWorkspaceRange(scope, previousDates, dates) {
    if (scope !== 'compare' || !dates.length || !previousDates.length) return;
    const range = CompareMode.state.dateRange;
    if (range.start === 0 && range.end === 100) return;
    const startDate = previousDates[ChartFactory.dateIndex(range.start, previousDates.length)];
    const endDate = previousDates[ChartFactory.dateIndex(range.end, previousDates.length)];
    const start = DateInput.nearestIndex(dates, startDate), end = Math.max(start, DateInput.nearestIndex(dates, endDate));
    CompareMode.state.dateRange = { start: dates.length > 1 ? start / (dates.length - 1) * 100 : 0,
        end: dates.length > 1 ? end / (dates.length - 1) * 100 : 100 };
}

function refreshAtlasViews(scope = 'globe', { datesChanged = false } = {}) {
    const globe = window.globeInstance;
    if (!globe?.worldData) return;
    const refresh = () => {
        validateDisplaySettings(workspaceService(scope));
        if (scope === 'compare') {
            if (datesChanged) CompareUI.initializeDateRangeSlider();
            CompareMode.updateComparisonView();
        } else if (scope === 'country') {
            if (document.getElementById('visualizationPanel')?.hidden === false) changeVisualization();
        } else globe.refreshData();
        syncAtlasState();
    };
    if (window.CompareMode?.state.active) CompareUI.preserveScroll(refresh);
    else refresh();
}

function syncAtlasState() {
    const service = window.dataService || window.globeInstance?.dataService;
    if (!service) return;
    const comparison = window.CompareMode?.state;
    window.AtlasStore?.setState({
        view: window.AtlasView?.restoring ? AtlasView.current : comparison?.active ? 'compare' : 'explore', category: service.currentDataset,
        metric: service.currentColumn, unit: service.displayUnit || 'count', smoothing: service.smoothing || 'raw',
        selectedDate: service.currentDate, selectedCountry: window.globeInstance?.selectedCountryCode || null,
        analysisOpen: Boolean(window.globeInstance?.selectedCountryCode && document.getElementById('visualizationPanel')?.hidden === false),
        compareCountries: comparison?.countries || [], compareRange: comparison?.dateRange || { start: 0, end: 100 },
        compareLayout: comparison?.displayMode || 'combined', compareChartType: comparison?.chartType || 'line',
        compareScale: comparison?.scale || 'shared', compareChartOptions: comparison?.chartOptions || {},
        compareSettings: window.AtlasWorkspaces?.read('compare') || null,
        analysisSettings: window.AtlasWorkspaces?.read('country') || null,
        analysisChartType: document.getElementById('vizTypeSelector')?.value || 'line',
        analysisRange: typeof ChartControls !== 'undefined' ? ChartControls.state.dateRange : { start: 0, end: 100 },
        analysisChartOptions: window.AnalyticsCharts?.countryOptions || {},
        workspaceMetrics: window.AtlasWorkspaces?.snapshotMetrics() || {},
        dataMode: service.dataSource === 'sample' ? 'sample' : 'csv'
    });
    updateAtlasPresentation();
}

function updateCountryAnalysisControls() {
    const service = window.AtlasWorkspaces?.peek('country') || window.dataService || window.globeInstance?.dataService;
    if (!service) return;
    const scatter = document.getElementById('vizTypeSelector')?.value === 'scatter';
    for (const id of ['analysisMetricControl', 'analysisUnitControl']) {
        const group = document.getElementById(id);
        if (group) group.hidden = scatter;
    }
    const reporting = document.getElementById('analysisReportingGroup');
    const metric = currentMetric(service);
    if (reporting) reporting.hidden = scatter || !metric.smoothingAllowed;
    const metrics = document.getElementById('analysisMetricSelector');
    if (metrics) {
        const choices = (service.availableColumns[service.currentDataset] || []).map(value => ({
            value, label: service.getMetricMetadata(value).label
        }));
        updateSelectOptions(metrics, choices);
        metrics.value = service.currentColumn;
        metrics.title = `${datasetNames[service.currentDataset]} · ${metric.label}`;
        metrics.disabled = !choices.length;
        const label = document.querySelector('label[for="analysisMetricSelector"]');
        if (label) label.textContent = 'Metric';
    }
    const datasets = document.getElementById('analysisDatasetButtons');
    if (datasets) datasets.dataset.category = service.currentDataset;
    for (const button of datasets?.querySelectorAll('[data-analysis-dataset]') || []) {
        const category = button.dataset.analysisDataset;
        const active = category === service.currentDataset;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
        button.disabled = !service.availableColumns[category]?.length;
    }
    const units = document.getElementById('analysisUnitSelector');
    if (units) {
        updateSelectOptions(units, metric.allowedUnits.map(value => ({ value,
            label: value === 'count' ? 'Absolute count' : service.getUnitLabel(service.currentColumn, value),
            disabled: value !== 'count' && !hasPopulation() })));
        units.value = service.displayUnit || 'count';
    }
    for (const [id, value] of [['analysisRawBtn', 'raw'], ['analysisAverageBtn', '7day']]) {
        const button = document.getElementById(id);
        if (!button) continue;
        const active = service.smoothing === value;
        button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
        button.disabled = value === '7day' && !metric.smoothingAllowed;
    }
}

function updateAtlasPresentation() {
    const service = window.dataService || window.globeInstance?.dataService;
    if (!service) return;
    const metric = currentMetric(), dates = service.getAvailableDates?.() || service.availableDates || [];
    const comparing = window.CompareMode?.state.active;
    applyDatasetTheme(comparing ? workspaceService('compare').currentDataset : service.currentDataset);
    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element && element.textContent !== String(value)) element.textContent = value;
    };
    const globeKey = JSON.stringify([service.currentDataset, service.currentColumn, service.displayUnit,
        service.smoothing, service.currentDate, hasPopulation(), service.dataSource, metric]);
    if (!comparing && (lastGlobePresentation?.service !== service || lastGlobePresentation?.index !== service.indexedData || lastGlobePresentation?.key !== globeKey)) {
        const unit = service.getUnitLabel?.() || 'Count';
        const unitText = unit === 'Count' ? 'Absolute count' : unit;
        setText('mapMetricLabel', metric.label);
        const metricSelector = document.getElementById('dataSelector');
        if (metricSelector) metricSelector.title = metric.label;
        const metricName = document.getElementById('selectedMetricName');
        if (metricName) { metricName.textContent = metric.label; metricName.hidden = metric.label.length < 33; }
        setText('mapUnitsLabel', `${unitText}${service.smoothing === '7day' ? ' · 7-day average' : ''}`);
        setText('timelineMeasure', service.smoothing === '7day' ? 'Trailing 7-day average' : 'Observation date');
        const populationAvailable = hasPopulation();
        const unitChoices = metric.allowedUnits.map(value => ({ value,
            label: value === 'count' ? 'Absolute count' : service.getUnitLabel?.(service.currentColumn, value) || value,
            disabled: value !== 'count' && !populationAvailable }));
        const units = document.getElementById('unitSelector');
        if (units) {
            updateSelectOptions(units, unitChoices);
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
            const countries = service.getAllCountries();
            setText('availableCountries', `${countries.length} countries / territories`);
            const years = document.getElementById('timelineYears');
            if (years && years.dataset.period !== `${firstYear}-${lastYear}`) {
                years.replaceChildren(); years.dataset.period = `${firstYear}-${lastYear}`;
                for (let year = firstYear + 1; year < lastYear; year += Math.max(1, Math.ceil((lastYear - firstYear) / 6))) {
                    const span = document.createElement('span'); span.textContent = year; years.appendChild(span);
                }
            }
            const count = countries.filter(country => {
                const value = typeof service.getDisplayValue === 'function' ? service.getDisplayValue(country.countryCode) : service.getDataValue?.(country.countryCode);
                return typeof value === 'number' && Number.isFinite(value);
            }).length;
            setText('coverageCount', `${count} ${count === 1 ? 'country' : 'countries'} with data`);
        }
        lastGlobePresentation = { service, index: service.indexedData, key: globeKey };
    }
    if (!comparing) updateCountryAnalysisControls();
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
    setMetric(column, scope = 'globe') {
        const service = workspaceService(scope);
        const category = service.currentDataset;
        if (!category || !service.availableColumns[category]?.includes(column)) return;
        const previousDates = service.getAvailableDates();
        if (window.AtlasWorkspaces && scope !== 'globe') AtlasWorkspaces.update(scope, { category, metric: column });
        else { service.currentDataset = category; service.changeColumn(column); }
        preserveWorkspaceRange(scope, previousDates, service.getAvailableDates());
        refreshAtlasViews(scope, { datesChanged: true });
    },
    setUnit(unit, scope = 'globe') {
        const service = workspaceService(scope);
        if (!currentMetric(service).allowedUnits.includes(unit) || (unit !== 'count' && !hasPopulation())) return;
        service.displayUnit = unit; refreshAtlasViews(scope);
    },
    setSmoothing(smoothing, scope = 'globe') {
        const service = workspaceService(scope);
        if (!['raw', '7day'].includes(smoothing) || (smoothing === '7day' && !currentMetric(service).smoothingAllowed)) return;
        service.smoothing = smoothing; refreshAtlasViews(scope);
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
    document.getElementById('countryExpandBtn')?.addEventListener('click', event => {
        const expanded = document.getElementById('countryInfo').classList.toggle('expanded');
        event.currentTarget.setAttribute('aria-expanded', String(expanded));
        event.currentTarget.textContent = expanded ? 'Fewer details ⌃' : 'More details ⌄';
    });
    document.getElementById('addToCompareBtn')?.addEventListener('click', () => {
        const code = window.globeInstance?.selectedCountryCode;
        if (code) { CompareMode.addCountry(code); AtlasView.navigate('compare'); }
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
    document.addEventListener('data-loaded', () => {
        window.AtlasWorkspaces?.revalidate();
        if (window.CompareMode?.state.active) {
            CompareUI.initializeDateRangeSlider();
            CompareMode.updateComparisonView();
        } else if (document.getElementById('visualizationPanel')?.hidden === false) changeVisualization();
    });
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
