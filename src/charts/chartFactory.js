// Every chart shows one metric with explicit units and gaps for missing observations.
const ChartFactory = {
    // Retain the country assignment, not a resolved color: theme changes must
    // preserve country identity while adapting the palette to its background.
    countryColorIndices: new Map(),
    comparisonCountrySlots: new Map(),
    chartSequence: 0,
    palette: ['#59b5ff', '#ffb23f', '#ef73cb', '#79d17d', '#f48ba1', '#8fd2e1', '#d3cd77', '#9db0ff'],

    // Browsing a country must not consume one of the four comparison colors.
    // Retain surviving selections in their slots and reuse only vacated slots.
    reconcileComparisonCountries(codes) {
        const selected = new Set([...new Set(codes.map(code => code.toLowerCase()))].slice(0, 4));
        for (const key of this.comparisonCountrySlots.keys())
            if (!selected.has(key)) this.comparisonCountrySlots.delete(key);
        const used = new Set(this.comparisonCountrySlots.values());
        for (const key of selected) if (!this.comparisonCountrySlots.has(key)) {
            const slot = [0, 1, 2, 3].find(index => !used.has(index));
            this.comparisonCountrySlots.set(key, slot); used.add(slot);
        }
    },

    countryStyleIndex(code) {
        const key = code.toLowerCase();
        if (this.comparisonCountrySlots.has(key)) return this.comparisonCountrySlots.get(key);
        if (!this.countryColorIndices.has(key)) this.countryColorIndices.set(key, this.countryColorIndices.size);
        return this.countryColorIndices.get(key);
    },

    countryColor(code) {
        const index = this.countryStyleIndex(code);
        return window.AtlasTheme?.getSeriesColor(index) || this.palette[index] || `hsl(${(index * 137.508 % 360).toFixed(2)} 65% 70%)`;
    },

    themeColor(token, fallback) {
        return window.AtlasTheme?.getColor(token) || fallback;
    },

    dateIndex(percent, length) {
        const value = Number(percent);
        const clamped = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 100;
        return Math.max(0, Math.floor(clamped / 100 * (length - 1) + 1e-9));
    },

    isValue(value) { return typeof value === 'number' && Number.isFinite(value); },

    metadata(column) {
        const kind = column?.startsWith('new_') ? 'daily' : column?.startsWith('current_') ? 'occupancy' : 'cumulative';
        return window.globeInstance?.dataService.getMetricMetadata?.(column) || {
            column, label: column?.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase()) || 'Observations',
            kind, allowedUnits: ['count'], smoothingAllowed: kind === 'daily' || kind === 'occupancy'
        };
    },

    smoothingMode(metric, requested) {
        return requested === '7day' && metric?.kind !== 'cumulative' && metric?.smoothingAllowed !== false ? '7day' : 'raw';
    },

    smoothingLabel(metric, smoothing) {
        if (this.smoothingMode(metric, smoothing) === '7day') return metric?.kind === 'occupancy' ?
            '7-day average of daily patient snapshots' : '7-day average of reported daily values';
        return metric?.kind === 'cumulative' ? 'Reported cumulative values' :
            metric?.kind === 'occupancy' ? 'Reported daily patient snapshots' : 'Daily reported values';
    },

    unitLabel(column, unit) {
        return window.globeInstance?.dataService.getUnitLabel?.(column, unit) || ({ count: 'Count', per100k: 'Per 100,000 people', per1m: 'Per 1,000,000 people', percent: '% of population', per100: 'Doses per 100 people' }[unit] || 'Count');
    },

    axisUnitLabel(column, unit = 'count') {
        if (unit !== 'count') {
            if (['per100k', 'per1m'].includes(unit))
                return `${this.axisUnitLabel(column, 'count')} ${this.unitLabel(column, unit).replace(/^Per /, 'per ')}`;
            return this.unitLabel(column, unit);
        }
        if (/vaccine_doses/.test(column)) return 'Doses';
        if (/persons_/.test(column)) return 'People';
        if (/hospital|intensive_care|ventilator/.test(column)) return 'Patients';
        if (/confirmed/.test(column)) return 'Cases';
        if (/deceased/.test(column)) return 'Deaths';
        if (/recovered/.test(column)) return 'Recoveries';
        if (/tested/.test(column)) return 'Tests';
        return 'Count';
    },

    prepareDataForCountry(countryCode, settings = {}) {
        const service = window.globeInstance?.dataService;
        if (!service || typeof countryCode !== 'string') return null;
        const key = countryCode.toLowerCase();
        const available = service.availableColumns[service.currentDataset] || [];
        const column = settings.selectedColumn || settings.column || service.currentColumn || available[0];
        if (!column || !available.includes(column)) return null;
        const unit = settings.unit || service.displayUnit || 'count';
        const metric = this.metadata(column);
        const smoothing = this.smoothingMode(metric, settings.smoothing || service.smoothing || 'raw');
        const observations = service.getCountrySeries(key, { column, unit, smoothing });
        if (!observations?.length) return null;
        return { countryCode: key, countryName: service.getCountryName(key), column, unit, smoothing,
            metric, dates: observations.map(point => point.date),
            reported: observations.map(point => typeof point.reported === 'boolean' ? point.reported :
                Object.hasOwn(point, 'rawValue') ? this.isValue(point.rawValue) : this.isValue(point.value)),
            missingReasons: observations.map(point => this.isValue(point.value) ? '' :
                unit !== 'count' && !(service.getPopulation?.(key) > 0) ? 'No population estimate' :
                this.isValue(point.rawValue) && smoothing === '7day' ? 'Insufficient reported days for the 7-day average' : 'No observation'),
            series: { [column]: observations.map(point => this.isValue(point.value) ? point.value : null) } };
    },

    applySettings(data, settings = {}) {
        const timeline = settings.timeline?.length ? settings.timeline : data.dates;
        const start = this.dateIndex(settings.dateRange?.start ?? 0, timeline.length);
        const end = this.dateIndex(settings.dateRange?.end ?? 100, timeline.length);
        const selected = timeline.slice(Math.min(start, end), Math.max(start, end) + 1);
        // Keep every calendar day between endpoints, including dates on which
        // no selected country reports. Removing those dates would bridge gaps.
        const dates = data.dates.filter(date => date >= selected[0] && date <= selected.at(-1));
        const indices = new Map(data.dates.map((date, index) => [date, index]));
        return { ...data, dates,
            reported: dates.map(date => data.reported?.[indices.get(date)] ?? this.isValue(data.series[data.column]?.[indices.get(date)])),
            missingReasons: dates.map(date => data.missingReasons?.[indices.get(date)] || 'No observation'),
            series: { [data.column]: dates.map(date => data.series[data.column][indices.get(date)] ?? null) } };
    },

    createChart(container, countryCode, vizType = 'line', settings) {
        this.clearChart(container);
        if (window.ChartTypes && !ChartTypes[vizType]?.country) return this.showError(container, 'Choose a supported chart type.');
        if (window.AnalyticsCharts?.isAnalytical(vizType)) return AnalyticsCharts.renderCountry(container, countryCode, vizType, settings);
        const extraControls = document.getElementById('analysisChartOptions');
        if (extraControls) { extraControls.hidden = true; extraControls.replaceChildren(); delete extraControls.dataset.fields; }
        const range = document.getElementById('chartControlsContainer'); if (range) range.hidden = false;
        const data = this.prepareDataForCountry(countryCode, settings);
        if (!data) return this.showError(container, 'No observations available for this country and dataset.');
        settings = settings || ChartControls.initialize(container, countryCode, vizType, data);
        if (!['line', 'bar', 'area'].includes(vizType)) return this.showError(container, 'Choose a supported chart type.');
        const filtered = this.applySettings(data, settings);
        this.renderCartesian(container, filtered.dates, [{ key: data.countryCode, label: data.countryName,
            color: this.countryColor(data.countryCode), values: filtered.series[data.column], missingReasons: filtered.missingReasons, reported: filtered.reported }], vizType,
        { title: `${data.metric.label} — ${data.countryName}`, column: data.column, unit: data.unit,
            metric: data.metric, smoothing: data.smoothing, yDomain: settings.yDomain });
    },

    formatValue(value) {
        if (!this.isValue(value)) return 'No observation';
        const magnitude = Math.abs(value);
        return magnitude >= 1000000 ? `${(value / 1000000).toFixed(2)}M` : magnitude >= 1000 ? `${(value / 1000).toFixed(1)}k` :
            value.toLocaleString(undefined, magnitude > 0 && magnitude < 1 ? { maximumSignificantDigits: 3 } : { maximumFractionDigits: 2 });
    },

    valueDomain(values) {
        let min = 0, max = 0;
        for (const value of values) if (this.isValue(value)) { min = Math.min(min, value); max = Math.max(max, value); }
        return min === max ? [0, 1] : [min < 0 ? min * 1.1 : 0, max > 0 ? max * 1.1 : 0];
    },

    clearChart(container) {
        container.replaceChildren();
        container.classList.remove('analytics-chart');
        delete container.dataset.chartType;
    },

    showError(container, message) {
        const error = document.createElement('div'); error.className = 'chart-error'; error.setAttribute('role', 'status');
        error.textContent = message; container.appendChild(error);
    },

    showTooltip(container, event, lines) {
        this.hideTooltip(container);
        const tooltip = document.createElement('div'); tooltip.className = 'chart-tooltip';
        for (const line of lines) { const row = document.createElement('div'); row.textContent = line; tooltip.appendChild(row); }
        container.appendChild(tooltip);
        // Keyboard focus has no pointer coordinates. Anchor its details to the
        // inspected mark instead of placing every focused bar in the same corner.
        if (!Number.isFinite(event?.clientX) || !Number.isFinite(event?.clientY)) {
            const bounds = event?.currentTarget?.getBoundingClientRect();
            event = { clientX: bounds ? bounds.left + bounds.width / 2 : NaN,
                clientY: bounds ? bounds.top + bounds.height / 2 : NaN };
        }
        const pointer = d3.pointer(event, container);
        const x = Number.isFinite(pointer[0]) ? pointer[0] : 16, y = Number.isFinite(pointer[1]) ? pointer[1] : 90;
        tooltip.style.left = `${Math.max(0, Math.min(x + 12, container.clientWidth - tooltip.offsetWidth))}px`;
        tooltip.style.top = `${Math.max(0, y - tooltip.offsetHeight - 12)}px`;
    },

    hideTooltip(container) { container.querySelectorAll('.chart-tooltip').forEach(tooltip => tooltip.remove()); },

    bindTooltip(selection, container, describe) {
        return selection.attr('tabindex', 0).attr('role', 'img')
            .attr('aria-label', datum => describe(datum).filter(value => value != null).join('. '))
            .on('pointerenter.analytics pointermove.analytics mouseover.analytics focus.analytics', (event, datum) =>
                this.showTooltip(container, event, describe(datum)))
            .on('pointerleave.analytics mouseout.analytics blur.analytics', () => this.hideTooltip(container))
            .on('keydown.analytics', event => {
                if (event.key === 'Escape' && container.querySelector('.chart-tooltip')) {
                    event.preventDefault(); event.stopPropagation(); this.hideTooltip(container);
                }
            });
    },

    periodLabel(dates) {
        const format = date => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
            .format(new Date(`${date}T00:00:00Z`));
        return dates[0] === dates.at(-1) ? format(dates[0]) : `${format(dates[0])} – ${format(dates.at(-1))}`;
    },

    // Compare visible magnitudes rather than assuming why reporting differs.
    // Callers can reuse this for small multiples with a shared vertical scale.
    comparisonWarnings(series, unit = 'count') {
        const peaks = series.map(item => item.values.reduce((peak, value) => this.isValue(value) ? Math.max(peak, Math.abs(value)) : peak, 0)).filter(peak => peak > 0);
        if (peaks.length < 2 || Math.max(...peaks) / Math.min(...peaks) < 20) return [];
        return [`Series peaks differ by at least 20× on this shared scale, so smaller series may look flat. ${unit === 'count' ? 'Try population-adjusted values, or ' : 'Try '}separate charts with independent scales to inspect their shapes.`];
    },

    hasIsolatedPeaks(series) {
        return series.some(item => {
            const magnitudes = item.values.filter(value => this.isValue(value)).map(Math.abs).sort((a, b) => a - b);
            if (magnitudes.length < 14) return false;
            const median = d3.quantileSorted(magnitudes, 0.5);
            return item.values.some((value, index, values) => {
                const before = values[index - 1], after = values[index + 1];
                return this.isValue(value) && this.isValue(before) && this.isValue(after) && Math.abs(value) > 10 * median &&
                    Math.abs(value) > 5 * Math.max(Math.abs(before), Math.abs(after));
            });
        });
    },

    // Long histories use Monday–Sunday calendar weeks. Partial bars retain
    // observed values and explicitly disclose completeness; nothing is imputed.
    aggregateBars(dates, series, metric, smoothing) {
        smoothing = this.smoothingMode(metric, smoothing);
        if (dates.length <= 120) return { dates, series, note: '', aggregation: null };
        const groups = [];
        dates.forEach((date, index) => {
            const day = new Date(`${date}T00:00:00Z`); day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
            const key = day.toISOString().slice(0, 10);
            if (groups.at(-1)?.key !== key) groups.push({ key, indices: [] });
            groups.at(-1).indices.push(index);
        });
        const total = metric?.kind === 'daily' && smoothing !== '7day';
        const last = metric?.kind === 'cumulative';
        const occupancy = metric?.kind === 'occupancy';
        const aggregation = last ? 'Weekly snapshots' : total ? 'Weekly totals' : occupancy ? 'Weekly mean occupancy' : 'Weekly means';
        return { dates: groups.map(group => group.key), aggregation,
            series: series.map(item => {
                const coverage = groups.map(group => {
                    const selectedDates = group.indices.map(index => dates[index]);
                    return { weekStart: group.key, start: selectedDates[0], end: selectedDates.at(-1), expectedDays: 7,
                        selectedDays: group.indices.length,
                        reportedDays: group.indices.filter(index => item.reported?.[index] ?? this.isValue(item.values[index])).length,
                        displayedDays: group.indices.filter(index => this.isValue(item.values[index])).length };
                });
                const values = groups.map(group => {
                    const observations = group.indices.map(day => item.values[day]);
                    // A snapshot is the last selected calendar day's report,
                    // never a prior observation carried across a missing day.
                    if (last) return this.isValue(observations.at(-1)) ? observations.at(-1) : null;
                    const available = observations.filter(value => this.isValue(value));
                    if (!available.length) return null;
                    return total ? d3.sum(available) : d3.mean(available);
                });
                return { ...item, values, coverage, aggregateKind: last ? 'snapshot' : total ? 'total' : 'mean',
                    missingReasons: coverage.map((week, index) => {
                        if (this.isValue(values[index])) return '';
                        if (groups[index].indices.some(day => item.missingReasons?.[day] === 'No population estimate')) return 'No population estimate';
                        return last ? 'No observation on the last selected day of this week' :
                            week.reportedDays > 0 && smoothing === '7day' ? 'No available daily averages in this week' : 'No observations in this week';
                    }) };
            }),
            note: `${aggregation} · Monday–Sunday. ${last ? 'Each bar uses the last selected calendar day; missing reports are not carried forward.' :
                total ? 'Hatched bars are partial totals of reported daily values; they are not complete weekly totals.' : occupancy ?
                    `Each bar is the mean of available ${smoothing === '7day' ? 'trailing 7-day occupancy averages' : 'reported daily patient snapshots'}; patients are never summed across days. Hatched bars are partial means; unavailable days are excluded.` :
                    'Hatched bars are partial means of available daily values; unavailable days are excluded.'} Hollow diamonds mark unavailable values; short baseline marks are reported zeros. Missing values are never treated as zero.` };
    },

    renderCartesian(container, dates, series, type, options = {}) {
        this.clearChart(container);
        if (!dates.length) return this.showError(container, 'No dates available.');
        options = { ...options, smoothing: this.smoothingMode(options.metric, options.smoothing) };
        const selectedDates = dates;
        const hadDisplayedValues = series.some(item => item.values.some(value => this.isValue(value)));
        let note = '', aggregation = null;
        if (type === 'bar') ({ dates, series, note, aggregation } = this.aggregateBars(dates, series, options.metric, options.smoothing));
        if (type === 'bar' && !note) note = 'Hollow diamonds mark unavailable observations; short baseline marks are reported zeros. Missing values are never treated as zero.';
        const column = options.column || options.metric?.column || window.globeInstance?.dataService.currentColumn;
        const unit = options.unit || window.globeInstance?.dataService.displayUnit || 'count';
        const unitLabel = column ? this.axisUnitLabel(column, unit) : options.unitLabel || this.unitLabel(column, unit);
        const smoothingLabel = this.smoothingLabel(options.metric, options.smoothing);
        const subtitle = `${aggregation ? `${aggregation} · ${smoothingLabel.toLowerCase()}` : smoothingLabel} · ${this.periodLabel(selectedDates)}`;
        const heading = document.createElement('header'); heading.className = 'chart-heading';
        const title = document.createElement('h3'); title.className = 'chart-heading-title'; title.textContent = options.title || 'Observations over time';
        const description = document.createElement('p'); description.className = 'chart-subtitle'; description.textContent = subtitle;
        heading.append(title, description); container.appendChild(heading);
        const active = series.filter(item => item.selected !== false), values = active.flatMap(item => item.values);
        const warnings = active.length > 1 ? this.comparisonWarnings(active, unit) : [];
        if (type === 'line' && options.metric?.kind === 'daily' && options.smoothing !== '7day' && this.hasIsolatedPeaks(active))
            warnings.push('Raw daily values include isolated peaks. This chart does not identify their cause. Try a 7-day average or weekly bars to inspect the pattern; missing reports remain gaps.');
        for (const text of warnings) { const warning = document.createElement('p'); warning.className = 'chart-warning'; warning.textContent = text; container.appendChild(warning); }
        const width = Math.max(280, container.clientWidth || 720);
        const height = width < 500 ? 330 : 390;
        const margin = { top: 40, right: 20, bottom: 44, left: width < 500 ? 55 : 66 };
        const plotWidth = width - margin.left - margin.right, plotHeight = height - margin.top - margin.bottom;
        container.style.position = 'relative';
        const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`)
            .attr('width', '100%').attr('height', height).attr('role', 'group')
            .attr('aria-label', `${options.title || 'Observations over time'}. ${subtitle}. ${unitLabel}. ${note || 'Missing observations appear as gaps.'}`);
        svg.append('title').text(options.title || 'Observations over time');
        svg.append('desc').text(`${subtitle}. ${note || 'Missing observations remain gaps and are never treated as zero.'}`);
        const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
        const y = d3.scaleLinear().domain(options.yDomain || this.valueDomain(values)).nice().range([plotHeight, 0]);
        const extent = d3.extent(dates, date => new Date(`${date}T00:00:00Z`));
        if (+extent[0] === +extent[1]) { extent[0] = new Date(+extent[0] - 43200000); extent[1] = new Date(+extent[1] + 43200000); }
        const time = d3.scaleUtc().domain(extent).range([0, plotWidth]);
        const band = d3.scaleBand().domain(dates).range([0, plotWidth]).padding(0.2);
        const xAt = date => type === 'bar' ? band(date) + band.bandwidth() / 2 : time(new Date(`${date}T00:00:00Z`));
        const tickDates = dates.filter((_, index) => index % Math.max(1, Math.ceil(dates.length / (width < 500 ? 3 : 6))) === 0);
        const formatDateTick = d3.utcFormat(dates.length < 10 || new Set(tickDates.map(date => date.slice(0, 7))).size < tickDates.length ? '%d %b' : '%b %Y');
        const xAxis = type === 'bar' ? d3.axisBottom(band).tickValues(tickDates).tickFormat(date => formatDateTick(new Date(`${date}T00:00:00Z`))) :
            d3.axisBottom(time).tickValues(tickDates.map(date => new Date(`${date}T00:00:00Z`))).tickFormat(formatDateTick);
        plot.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotHeight})`).call(xAxis);
        plot.append('g').attr('class', 'y-axis').call(d3.axisLeft(y).ticks(5).tickFormat(value => this.formatValue(value)));
        plot.append('g').attr('class', 'grid-lines').selectAll('line').data(y.ticks(5)).join('line')
            .attr('x2', plotWidth).attr('y1', value => y(value)).attr('y2', value => y(value));
        svg.append('text').attr('class', 'axis-unit-label').attr('x', margin.left).attr('y', 18).text(unitLabel);
        active.forEach((item, seriesIndex) => {
            const color = item.color || this.countryColor(item.key), points = dates.map((date, index) => ({ date, value: item.values[index], index }));
            if (type === 'bar') {
                const barWidth = band.bandwidth() / Math.max(1, active.length);
                const center = point => band(point.date) + (seriesIndex + 0.5) * barWidth;
                const incomplete = point => item.coverage?.[point.index] &&
                    (item.coverage[point.index].reportedDays < 7 || item.coverage[point.index].selectedDays < 7 || item.coverage[point.index].displayedDays < 7);
                const patternId = `partial-week-${++this.chartSequence}`;
                const pattern = svg.append('defs').append('pattern').attr('id', patternId).attr('patternUnits', 'userSpaceOnUse')
                    .attr('width', 6).attr('height', 6).attr('patternTransform', 'rotate(45)');
                pattern.append('rect').attr('width', 6).attr('height', 6).attr('fill', color).attr('opacity', 0.28);
                pattern.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 6).attr('stroke', color).attr('stroke-width', 2);
                const tooltipLines = point => {
                    const coverage = item.coverage?.[point.index];
                    const lines = [coverage ? `${coverage.start} – ${coverage.end}` : point.date, item.label,
                        this.isValue(point.value) ? `${this.formatValue(point.value)} ${unitLabel}` : item.missingReasons?.[point.index] || 'No observation'];
                    if (coverage) {
                        if (this.isValue(point.value)) lines.push(item.aggregateKind === 'snapshot' ? 'Snapshot on the last selected day of this week' :
                            `${incomplete(point) ? 'Partial' : 'Complete'} weekly ${item.aggregateKind === 'total' ? 'total of reported daily values' : options.metric?.kind === 'occupancy' ?
                                `mean of available ${options.smoothing === '7day' ? '7-day occupancy averages' : 'daily patient snapshots'}` : 'mean of available displayed daily values'}`);
                        lines.push(`Reported days: ${coverage.reportedDays} of ${coverage.selectedDays} selected days (${coverage.expectedDays}-day calendar week)`);
                        if (coverage.selectedDays < coverage.expectedDays) lines.push(`Selected period includes ${coverage.selectedDays} of ${coverage.expectedDays} days in this week`);
                        if (options.smoothing === '7day') lines.push(`Available daily averages: ${coverage.displayedDays} of ${coverage.expectedDays}`);
                    }
                    return lines;
                };
                const bars = plot.append('g').selectAll('rect').data(points.filter(point => this.isValue(point.value) && point.value !== 0)).join('rect')
                    .attr('class', point => incomplete(point) ? 'data-bar incomplete-bar' : 'data-bar')
                    .attr('x', point => band(point.date) + seriesIndex * barWidth)
                    .attr('width', barWidth).attr('y', point => y(Math.max(0, point.value)))
                    .attr('height', point => Math.abs(y(point.value) - y(0))).attr('fill', point => incomplete(point) ? `url(#${patternId})` : color)
                    .attr('stroke', point => incomplete(point) ? color : 'none').attr('stroke-width', 0.8).attr('rx', 1);
                this.bindTooltip(bars, container, tooltipLines);
                // Zero-height rectangles are invisible. A short solid mark
                // distinguishes a reported zero from the hollow missing mark.
                const zeros = plot.append('g').selectAll('line').data(points.filter(point => point.value === 0)).join('line')
                    .attr('class', 'reported-zero-marker').attr('x1', point => center(point) - Math.max(2, barWidth / 3))
                    .attr('x2', point => center(point) + Math.max(2, barWidth / 3)).attr('y1', y(0)).attr('y2', y(0))
                    .attr('stroke', color).attr('stroke-width', 2);
                this.bindTooltip(zeros, container, tooltipLines);
                const missing = plot.append('g').selectAll('path').data(points.filter(point => !this.isValue(point.value))).join('path')
                    .attr('class', 'missing-bar-marker').attr('d', 'M0,-4L4,0L0,4L-4,0Z')
                    .attr('transform', point => `translate(${center(point)},${plotHeight - 8})`)
                    .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 1.5);
                this.bindTooltip(missing, container, tooltipLines);
            } else {
                if (type === 'area') {
                    const area = d3.area().defined(point => this.isValue(point.value)).curve(d3.curveMonotoneX).x(point => xAt(point.date))
                        .y0(y(0)).y1(point => y(point.value));
                    plot.append('path').datum(points).attr('class', 'data-area').attr('d', area)
                        .attr('fill', color).attr('fill-opacity', 0.16).attr('pointer-events', 'none');
                }
                // Shape-preserving curves join consecutive reports without overshooting
                // their values. Defined segments still stop at every missing day.
                const line = d3.line().defined(point => this.isValue(point.value)).curve(d3.curveMonotoneX)
                    .x(point => xAt(point.date)).y(point => y(point.value));
                plot.append('path').datum(points).attr('class', 'data-line').attr('d', line).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2.25)
                    .attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
                // Isolated reports have no visible line segment, even in long histories.
                plot.append('g').selectAll('circle').data(points.filter(point => this.isValue(point.value) && (dates.length <= 30 ||
                    !this.isValue(item.values[point.index - 1]) && !this.isValue(item.values[point.index + 1])))).join('circle')
                    .attr('class', 'data-point').attr('cx', point => xAt(point.date)).attr('cy', point => y(point.value)).attr('r', 2.5).attr('fill', color);
            }
        });
        if (type === 'line' || type === 'area') {
            const crosshair = plot.append('line').attr('class', 'chart-crosshair').attr('y1', 0).attr('y2', plotHeight).attr('visibility', 'hidden');
            const cursorPoints = plot.append('g').attr('class', 'cursor-points'), dateNumbers = dates.map(date => +new Date(`${date}T00:00:00Z`));
            const overlay = plot.append('rect').attr('class', 'chart-hit-area').attr('width', plotWidth).attr('height', plotHeight)
                .attr('fill', 'transparent').attr('tabindex', 0).attr('role', 'slider').attr('aria-label', 'Inspect chart observations by date')
                .attr('aria-valuemin', 0).attr('aria-valuemax', dates.length - 1).attr('aria-valuenow', 0);
            const inspect = (index, event) => {
                const date = dates[index];
                crosshair.attr('x1', xAt(date)).attr('x2', xAt(date)).attr('visibility', 'visible');
                cursorPoints.selectAll('circle').data(active.filter(item => this.isValue(item.values[index]))).join('circle')
                    .attr('cx', xAt(date)).attr('cy', item => y(item.values[index])).attr('r', 4)
                    .attr('fill', item => item.color || this.countryColor(item.key))
                    .attr('stroke', this.themeColor('--chart-surface', '#101c2c')).attr('stroke-width', 2);
                const lines = [date, ...active.map(item => `${item.label}: ${this.isValue(item.values[index]) ? this.formatValue(item.values[index]) : item.missingReasons?.[index] || 'No observation'}`), unitLabel];
                overlay.attr('aria-valuenow', index).attr('aria-valuetext', lines.join(', ')); this.showTooltip(container, event, lines);
            };
            const inspectFromKeyboard = index => {
                const bounds = svg.node().getBoundingClientRect(), scale = bounds.width / width || 1;
                inspect(index, { clientX: bounds.left + (margin.left + xAt(dates[index])) * scale, clientY: bounds.top + (margin.top + 60) * scale });
            };
            const dismiss = () => { crosshair.attr('visibility', 'hidden'); cursorPoints.selectAll('circle').remove(); this.hideTooltip(container); };
            overlay.on('pointermove', event => { const [x] = d3.pointer(event, plot.node()); inspect(d3.bisectCenter(dateNumbers, +time.invert(x)), event); })
                .on('focus', () => inspectFromKeyboard(Number(overlay.attr('aria-valuenow'))))
                .on('pointerleave blur', dismiss)
                .on('keydown', event => {
                    if (event.key === 'Escape' && container.querySelector('.chart-tooltip')) {
                        event.preventDefault(); event.stopPropagation(); dismiss(); return;
                    }
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault(); const current = Number(overlay.attr('aria-valuenow'));
                    const index = event.key === 'Home' ? 0 : event.key === 'End' ? dates.length - 1 : Math.max(0, Math.min(dates.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1)));
                    inspectFromKeyboard(index);
                });
        }
        if (options.showLegend !== false && series.length > 1) {
            const legend = document.createElement('div'); legend.className = 'chart-legend';
            for (const item of series) {
                const entry = document.createElement('span'); entry.className = 'legend-item';
                let swatch;
                if (type === 'line' || type === 'area') {
                    swatch = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    swatch.setAttribute('class', 'legend-line'); swatch.setAttribute('width', '28'); swatch.setAttribute('height', '10');
                    swatch.setAttribute('viewBox', '0 0 28 10'); swatch.setAttribute('aria-hidden', 'true');
                    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line.setAttribute('x1', '2'); line.setAttribute('x2', '26'); line.setAttribute('y1', '5'); line.setAttribute('y2', '5');
                    line.setAttribute('stroke', item.color || this.countryColor(item.key)); line.setAttribute('stroke-width', '2.25'); line.setAttribute('stroke-linecap', 'round');
                    swatch.appendChild(line);
                } else { swatch = document.createElement('i'); swatch.style.backgroundColor = item.color || this.countryColor(item.key); }
                entry.append(swatch, document.createTextNode(item.label)); legend.appendChild(entry);
            }
            container.appendChild(legend);
        }
        if (note) { const hint = document.createElement('p'); hint.className = 'chart-note'; hint.textContent = note; container.appendChild(hint); }
        if (!values.some(value => this.isValue(value))) this.showError(container, hadDisplayedValues && aggregation ?
            'No weekly snapshots are available on the last selected days of these weeks.' :
            'No displayable observations for this metric, unit and date range. Check reporting availability, averaging history, and population data.');
    }
};
