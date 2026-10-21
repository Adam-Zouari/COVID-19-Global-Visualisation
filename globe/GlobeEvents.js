GlobeVis.prototype.setupEventListeners = function() {
    const options = { signal: this.listeners.signal };
    document.getElementById('dataSelector')?.addEventListener('change', event => {
        if (window.atlasActions?.setMetric) {
            window.atlasActions.setMetric(event.target.value);
            return;
        }
        this.dataService.changeColumn(event.target.value);
        this.setupDateSlider();
        this.updateGlobeColors();
        this.refreshSelectedCountry();
        this.dispatchStateEvent('atlas-data-updated');
    }, options);
    document.getElementById('resetBtn')?.addEventListener('click', () => this.resetView(), options);
    document.getElementById('closeCountryBtn')?.addEventListener('click', () => this.clearCountrySelection(), options);
    for (const [id, multiplier] of [['zoomInBtn', 1.25], ['zoomOutBtn', 0.8]]) {
        document.getElementById(id)?.addEventListener('click', () => {
            this.svg.call(this.zoom.scaleBy, multiplier);
        }, options);
    }
    if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(document.getElementById('globe'));
    } else {
        window.addEventListener('resize', () => this.resize(), options);
    }
    document.addEventListener('data-loaded', () => this.recoverAfterDataLoad(), options);
    document.addEventListener('atlas:themechange', () => this.refreshGlobeAppearance(), options);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // Preserve the user's rotation preference while suspending background work.
            const shouldResume = this.autoRotate;
            this.stopAutoRotation();
            this.autoRotate = shouldResume;
        } else {
            this.startAutoRotation();
        }
    }, options);
};

GlobeVis.prototype.dragstarted = function(event) {
    this.stopAutoRotation();
    this.cancelRotationAnimation();
    this.tooltip.style('opacity', 0);
    this.dragRotation = [...this.currentRotation];
    this.dragStart = [event.x, event.y];
};

GlobeVis.prototype.dragged = function(event) {
    if (!this.dragStart) return;
    const dx = event.x - this.dragStart[0];
    const dy = event.y - this.dragStart[1];
    this.currentRotation[0] = this.dragRotation[0] + dx / this.sensitivity;
    this.currentRotation[1] = Math.max(-90, Math.min(90, this.dragRotation[1] - dy / this.sensitivity));
    this.projection.rotate(this.currentRotation);
    this.render();
};

GlobeVis.prototype.dragended = function() {
    this.dragRotation = null;
    this.dragStart = null;
};

GlobeVis.prototype.zoomed = function(event) {
    this.stopAutoRotation();
    this.cancelRotationAnimation();
    this.projection.scale(this.radius * event.transform.k);
    this.render();
};

GlobeVis.prototype.createCountryHeader = function(countryCode, countryName) {
    const header = document.createElement('span');
    header.className = 'country-header tooltip-header';
    if (/^[a-z]{2}$/i.test(countryCode || '')) {
        const flag = document.createElement('img');
        flag.className = 'country-flag';
        flag.src = `https://flagcdn.com/${countryCode.toLowerCase()}.svg`;
        flag.alt = '';
        flag.addEventListener('error', () => flag.remove(), { once: true });
        header.appendChild(flag);
    }
    const name = document.createElement('span');
    name.textContent = countryName;
    header.appendChild(name);
    return header;
};

GlobeVis.prototype.positionTooltip = function(event) {
    const tooltip = this.tooltip.node();
    const x = Math.min(event.clientX + 12, window.innerWidth - tooltip.offsetWidth - 8);
    const y = Math.min(event.clientY + 12, window.innerHeight - tooltip.offsetHeight - 8);
    this.tooltip.style('left', `${Math.max(8, x)}px`)
        .style('top', `${Math.max(8, y)}px`);
};

GlobeVis.prototype.handleMouseOver = function(event, feature) {
    this.hoveredCountry = feature.id;
    const palette = this.getGlobePalette();
    const selected = this.selectedCountry === feature.id;
    d3.select(event.currentTarget).attr('stroke', selected ? palette.selection : palette.hover)
        .attr('stroke-width', selected ? 1.8 : 1.2);
    const code = this.getCountryCode(feature);
    const record = code ? this.dataService.getCountryData(code) : null;
    const tooltip = this.tooltip.node();
    tooltip.replaceChildren(this.createCountryHeader(code,
        record?.countryName || feature.properties?.name || 'Unknown country'));
    const body = document.createElement('div');
    body.className = 'tooltip-body';
    const value = code ? this.displayValue(code) : null;
    const metric = document.createElement('div');
    metric.className = 'tooltip-metric';
    metric.textContent = this.metricLabel();
    const number = document.createElement('strong');
    number.className = 'tooltip-value';
    number.textContent = this.unavailableReason(code) ? 'Unavailable' : this.formatMetricValue(value);
    const unit = document.createElement('div');
    unit.className = 'tooltip-unit';
    unit.textContent = this.unavailableReason(code) || (value === null ? 'Not reported on selected day' : this.unitLabel());
    const date = document.createElement('div');
    date.className = 'tooltip-date';
    date.textContent = this.dataService.formatDate(this.dataService.currentDate);
    body.append(metric, number, unit, date);
    if (value !== null && value < 0) {
        const correction = document.createElement('div');
        correction.className = 'reporting-correction';
        correction.textContent = 'Reporting correction';
        body.appendChild(correction);
    }
    tooltip.appendChild(body);
    this.tooltip.style('opacity', 1);
    this.positionTooltip(event);
};

GlobeVis.prototype.handleMouseOut = function(event, feature) {
    this.hoveredCountry = null;
    const palette = this.getGlobePalette();
    const selected = this.selectedCountry === feature.id;
    d3.select(event.currentTarget).attr('stroke', selected ? palette.selection : palette.border)
        .attr('stroke-width', selected ? 1.8 : 0.45);
    this.tooltip.style('opacity', 0);
};

GlobeVis.prototype.selectCountry = function(feature) {
    this.clearCountrySelection();
    this.selectedCountry = feature.id;
    this.selectedCountryCode = this.getCountryCode(feature);
    this.globeGroup.selectAll('.country')
        .filter(country => country.id === feature.id)
        .attr('stroke', this.getGlobePalette().selection).attr('stroke-width', 1.8)
        .classed('selected-country', true);
    this.refreshSelectedCountry();
    this.dispatchStateEvent('country-selected');
};

GlobeVis.prototype.handleCountryClick = function(event, feature) {
    this.stopAutoRotation();
    this.cancelRotationAnimation();
    this.selectCountry(feature);
};

GlobeVis.prototype.refreshSelectedCountry = function() {
    const feature = this.countryFeatures.find(country => country.id === this.selectedCountry);
    const code = this.selectedCountryCode || (feature ? this.getCountryCode(feature) : null);
    const displayFeature = feature || (code ? {
        properties: { name: this.dataService.getCountryName(code) }, countryCode: code
    } : null);
    this.updateCountryInfoPanel(code ? this.dataService.getCountryData(code) : null, displayFeature);
};

GlobeVis.prototype.metricLabel = function(column = this.dataService.currentColumn) {
    return this.dataService.getMetricMetadata?.(column)?.label ||
        (column ? column.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase()) : 'No metric');
};

GlobeVis.prototype.categoryLabel = function() {
    return { epidem: 'Epidemiology', hospitalizations: 'Hospitalizations', vaccinations: 'Vaccinations' }[this.dataService.currentDataset] || 'Country observations';
};

GlobeVis.prototype.unitLabel = function(column = this.dataService.currentColumn, unit = this.dataService.displayUnit || 'count') {
    return this.dataService.getUnitLabel?.(column, unit) ||
        { count: 'Count', per100k: 'Per 100,000 people', per1m: 'Per 1,000,000 people', percent: '% of population', per100: 'Doses per 100 people' }[unit] || 'Count';
};

GlobeVis.prototype.displayValue = function(code) {
    if (this.dataService.getDisplayValue) return this.dataService.getDisplayValue(code);
    const value = this.dataService.getCountryData(code)?.[this.dataService.currentColumn];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

GlobeVis.prototype.populationRequired = function(code) {
    if (!code || !this.dataService.displayUnit || this.dataService.displayUnit === 'count') return false;
    const raw = this.dataService.getCountryData(code)?.[this.dataService.currentColumn];
    const population = this.dataService.getPopulation?.(code);
    return typeof raw === 'number' && Number.isFinite(raw) && !(typeof population === 'number' && population > 0);
};

GlobeVis.prototype.unavailableReason = function(code) {
    if (this.populationRequired(code)) return 'Population unavailable for this unit';
    const raw = this.dataService.getCountryData(code)?.[this.dataService.currentColumn];
    if (this.dataService.smoothing === '7day' && typeof raw === 'number' && Number.isFinite(raw) && this.displayValue(code) === null) {
        return 'Not enough reports for a 7-day average';
    }
    return '';
};

GlobeVis.prototype.formatMetricValue = function(value, unit = this.dataService.displayUnit || 'count') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not reported';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: unit === 'count' && this.dataService.smoothing !== '7day' ? 0 : 1 }).format(value);
};

GlobeVis.prototype.normalizationExplanation = function(code, value) {
    const unit = this.dataService.displayUnit || 'count';
    const factor = window.MetricRegistry?.UNIT_DEFINITIONS?.[unit]?.factor;
    const population = this.dataService.getPopulation?.(code);
    if (unit === 'count' || !(factor > 0) || !(population > 0) || !Number.isFinite(value)) return '';
    // Explain a smoothed rate using its averaged count, not that day's raw count.
    const count = this.dataService.getDisplayValue?.(code, { unit: 'count' });
    if (!Number.isFinite(count)) return '';
    const format = number => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(number);
    const basis = this.dataService.smoothing === '7day' ? '7-day average count' : 'Raw count';
    return `${basis} ÷ population × ${format(factor)}: ${format(count)} ÷ ${format(population)} × ${format(factor)} ≈ ${this.formatMetricValue(value)} ${this.unitLabel()}.`;
};

GlobeVis.prototype.renderCountryTrend = function(series) {
    const container = document.getElementById('countryTrend');
    if (!container) return;
    container.replaceChildren();
    const points = series.filter(point => point.date <= this.dataService.currentDate).slice(-90);
    const available = points.filter(point => typeof point.value === 'number' && Number.isFinite(point.value));
    const heading = document.createElement('div');
    heading.className = 'country-trend-label';
    heading.textContent = 'Recent trend';
    container.appendChild(heading);
    if (available.length < 2) {
        const empty = document.createElement('p');
        empty.className = 'country-trend-note';
        empty.textContent = 'Not enough reported observations to draw a trend.';
        container.appendChild(empty);
        return;
    }
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    const width = 260, height = 64, margin = 4;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('class', 'country-sparkline');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${this.metricLabel()}, ${this.unitLabel()}, from ${this.dataService.formatDate(points[0].date)} to ${this.dataService.formatDate(points.at(-1).date)}. Missing observations leave gaps.`);
    const values = available.map(point => point.value);
    const minimum = Math.min(0, ...values), maximum = Math.max(0, ...values);
    const firstTime = Date.parse(`${points[0].date}T00:00:00Z`);
    const timeSpan = Date.parse(`${points.at(-1).date}T00:00:00Z`) - firstTime || 1;
    const x = point => margin + (Date.parse(`${point.date}T00:00:00Z`) - firstTime) / timeSpan * (width - margin * 2);
    const y = value => height - margin - (value - minimum) / (maximum - minimum || 1) * (height - margin * 2);
    const baseline = document.createElementNS(namespace, 'line');
    baseline.setAttribute('x1', margin);
    baseline.setAttribute('x2', width - margin);
    baseline.setAttribute('y1', y(0));
    baseline.setAttribute('y2', y(0));
    baseline.setAttribute('stroke', 'var(--chart-grid, var(--border-color, #334155))');
    svg.appendChild(baseline);
    let drawing = false, commands = '';
    for (const point of points) {
        if (typeof point.value !== 'number' || !Number.isFinite(point.value)) { drawing = false; continue; }
        commands += `${drawing ? 'L' : 'M'}${x(point).toFixed(2)},${y(point.value).toFixed(2)} `;
        drawing = true;
    }
    const path = document.createElementNS(namespace, 'path');
    path.setAttribute('d', commands.trim());
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'var(--accent, #ff8a7d)');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    const caption = document.createElement('div');
    caption.className = 'country-trend-note';
    caption.textContent = `${this.dataService.formatDate(points[0].date)} – ${this.dataService.formatDate(points.at(-1).date)}${this.dataService.smoothing === '7day' ? ' · 7-day average' : ' · Raw observations'}`;
    container.append(svg, caption);
};

GlobeVis.prototype.updateCountryInfoPanel = function(record, feature) {
    const name = document.getElementById('countryName');
    const stats = document.getElementById('countryStats');
    const panel = document.getElementById('countryInfo');
    const more = document.getElementById('seeMoreBtn');
    if (!name || !stats || !panel) return;
    stats.replaceChildren();
    if (!record && !feature) {
        name.textContent = 'Select a country';
        panel.style.display = 'none';
        panel.hidden = true;
        document.getElementById('exploreWorkspace')?.classList.remove('has-selection');
        if (more) more.style.display = 'none';
        return;
    }
    const code = record?.countryKey || feature?.countryCode || this.getCountryCode(feature);
    name.replaceChildren(this.createCountryHeader(code, record?.countryName || feature?.properties?.name || 'Unknown country'));
    const columns = this.dataService.availableColumns[this.dataService.currentDataset] || [];
    const primary = document.getElementById('countryPrimary');
    if (primary) {
        primary.replaceChildren();
        const label = document.createElement('div');
        label.className = 'primary-metric-label';
        label.textContent = this.metricLabel();
        const value = document.createElement('div');
        value.className = 'primary-metric-value';
        const selectedValue = this.displayValue(code);
        value.textContent = this.unavailableReason(code) ? 'Unavailable' : this.formatMetricValue(selectedValue);
        const unit = document.createElement('div');
        unit.className = 'primary-metric-unit';
        unit.textContent = this.unavailableReason(code) || (selectedValue === null ? 'Not reported on selected day' :
            `${this.unitLabel()}${selectedValue < 0 ? ' · Reporting correction' : ''}${this.dataService.smoothing === '7day' ? ' · 7-day average' : ''}`);
        primary.append(label, value, unit);
        const explanation = this.normalizationExplanation(code, selectedValue);
        if (explanation) {
            const calculation = document.createElement('p');
            calculation.className = 'normalization-explanation';
            calculation.textContent = explanation;
            primary.appendChild(calculation);
        }
    }
    const context = document.getElementById('countryContext');
    if (context) context.textContent = `${this.categoryLabel()} · ${this.dataService.formatDate(this.dataService.currentDate)}`;
    const preferred = {
        epidem: ['cumulative_confirmed', 'cumulative_deceased', 'new_confirmed', 'new_deceased'],
        hospitalizations: ['current_hospitalized_patients', 'current_intensive_care_patients', 'new_hospitalized_patients', 'cumulative_hospitalized_patients'],
        vaccinations: ['cumulative_persons_vaccinated', 'cumulative_persons_fully_vaccinated', 'cumulative_vaccine_doses_administered']
    };
    const supporting = [...new Set([...(preferred[this.dataService.currentDataset] || []), ...columns])]
        .filter(key => key !== this.dataService.currentColumn && columns.includes(key)).slice(0, 3);
    if (supporting.length) {
        for (const key of supporting) {
            const row = document.createElement('div');
            row.className = 'stat-item';
            const label = document.createElement('div');
            label.className = 'stat-label';
            label.textContent = this.metricLabel(key);
            const value = document.createElement('div');
            value.className = 'stat-value';
            value.textContent = this.formatMetricValue(record?.[key], 'count');
            row.append(label, value);
            stats.appendChild(row);
        }
    } else {
        stats.textContent = 'No supporting indicators reported.';
    }
    const population = this.dataService.getPopulation?.(code);
    const populationText = document.getElementById('countryPopulation');
    if (populationText) populationText.textContent = typeof population === 'number' && Number.isFinite(population)
        ? `Population · ${this.dataService.formatNumber(population)}${this.dataService.dataSource === 'sample' ? ' (fictional)' : ''}`
        : 'Population unavailable';
    const series = this.dataService.getCountrySeries?.(code) || [];
    const rawSeries = this.dataService.getCountrySeries?.(code, { unit: 'count', smoothing: 'raw' }) || series;
    const reported = rawSeries.filter(point => point.date <= this.dataService.currentDate && point.reported !== false && typeof point.rawValue === 'number' && Number.isFinite(point.rawValue));
    const last = document.getElementById('countryLastReported');
    if (last) last.textContent = reported.length
        ? `Last reported by selected date · ${this.dataService.formatDate(reported.at(-1).date)}`
        : 'No observation by selected date';
    this.renderCountryTrend(series);
    panel.hidden = false;
    panel.style.display = window.CompareMode?.state.active ? 'none' : 'block';
    document.getElementById('exploreWorkspace')?.classList.add('has-selection');
    // History remains useful when the currently selected date has no record.
    if (more) more.style.display = code ? 'block' : 'none';
};

GlobeVis.prototype.updateDataSelector = function() {
    const selector = document.getElementById('dataSelector');
    if (!selector) return;
    selector.replaceChildren();
    const columns = this.dataService.availableColumns[this.dataService.currentDataset] || [];
    for (const column of columns) {
        const option = document.createElement('option');
        option.value = column;
        option.textContent = this.metricLabel(column);
        selector.appendChild(option);
    }
    selector.value = this.dataService.currentColumn || '';
    selector.disabled = columns.length === 0;
};

GlobeVis.prototype.syncDateControls = function() {
    const slider = document.getElementById('dateSlider');
    const current = document.getElementById('currentDate');
    const previous = document.getElementById('prevDateBtn');
    const next = document.getElementById('nextDateBtn');
    const dates = this.dataService.getAvailableDates?.() || this.dataService.availableDates || [];
    if (!slider || !current) return;
    const index = Number(slider.value);
    slider.disabled = dates.length === 0;
    if (previous) previous.disabled = dates.length === 0 || index <= 0;
    if (next) next.disabled = dates.length === 0 || index >= dates.length - 1;
    current.textContent = dates.length ? this.dataService.formatDate(dates[index]) : 'No dates with data';
    const start = document.getElementById('timelineStart');
    const end = document.getElementById('timelineEnd');
    if (start) start.textContent = dates.length ? this.dataService.formatDate(dates[0]) : '—';
    if (end) end.textContent = dates.length ? this.dataService.formatDate(dates.at(-1)) : '—';
};

GlobeVis.prototype.setupDateSlider = function() {
    this.dateListeners?.abort();
    this.dateListeners = new AbortController();
    clearTimeout(this.dateUpdateTimeout);
    const slider = document.getElementById('dateSlider');
    if (!slider) return;
    const dates = this.dataService.getAvailableDates?.() || this.dataService.availableDates || [];
    let index = dates.indexOf(this.dataService.currentDate);
    if (index < 0) index = Math.max(0, dates.length - 1);
    slider.min = 0;
    slider.max = Math.max(0, dates.length - 1);
    slider.step = 1;
    slider.value = index;
    if (dates.length) this.dataService.changeDate(dates[index]);
    this.syncDateControls();

    const update = () => {
        const selectedIndex = Number(slider.value);
        const availableDates = this.dataService.getAvailableDates?.() || this.dataService.availableDates || [];
        const date = availableDates[selectedIndex];
        if (!date) return;
        // Keep date, colors and country details in the same state. One redraw
        // per input is cheap for this 110m map and avoids stale debounce work.
        this.dataService.changeDate(date);
        this.syncDateControls();
        this.updateGlobeColors();
        this.refreshSelectedCountry();
        this.dispatchStateEvent('atlas-data-updated');
    };
    const options = { signal: this.dateListeners.signal };
    slider.addEventListener('input', update, options);
    document.getElementById('prevDateBtn')?.addEventListener('click', () => {
        if (Number(slider.value) > 0) {
            slider.value = Number(slider.value) - 1;
            update();
        }
    }, options);
    document.getElementById('nextDateBtn')?.addEventListener('click', () => {
        if (Number(slider.value) < Number(slider.max)) {
            slider.value = Number(slider.value) + 1;
            update();
        }
    }, options);
};

GlobeVis.prototype.refreshData = function() {
    if (this.destroyed || !this.worldData) return;
    this.buildCountryFeatureMap();
    if (!this.globeCreated) {
        this.createGlobe();
        this.globeCreated = true;
    }
    this.svg.style('display', null);
    document.querySelectorAll('#globe .globe-error').forEach(element => element.remove());
    this.globeGroup.selectAll('.country').attr('data-country-code', feature => this.getCountryCode(feature));
    this.updateDataSelector();
    this.setupDateSlider();
    this.updateGlobeColors();
    this.refreshSelectedCountry();
    this.setControlsDisabled(false);
    this.dispatchStateEvent('atlas-data-updated');
};

GlobeVis.prototype.changeDataset = function(dataset) {
    if (!Object.hasOwn(this.dataService.availableColumns, dataset)) return;
    this.dataService.changeDataset(dataset);
    this.refreshData();
    const names = { epidem: 'Epidemiology', hospitalizations: 'Hospitalizations', vaccinations: 'Vaccinations' };
    const display = document.getElementById('currentDataset');
    if (display) display.textContent = names[dataset] || dataset;
};
