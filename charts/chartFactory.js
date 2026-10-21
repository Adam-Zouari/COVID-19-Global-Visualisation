// Every chart shows one metric with explicit units and gaps for missing observations.
const ChartFactory = {
    countryColors: new Map(),
    palette: ['#70b7ff', '#f5b85e', '#c6a0ff', '#5dd4b0', '#f48ba1', '#8fd2e1', '#d3cd77', '#9db0ff'],

    countryColor(code) {
        const key = code.toLowerCase();
        if (!this.countryColors.has(key)) {
            const index = this.countryColors.size;
            this.countryColors.set(key, this.palette[index] || `hsl(${(index * 137.508 % 360).toFixed(2)} 65% 70%)`);
        }
        return this.countryColors.get(key);
    },

    dateIndex(percent, length) {
        const value = Number(percent);
        const clamped = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 100;
        return Math.max(0, Math.floor(clamped / 100 * (length - 1) + 1e-9));
    },

    isValue(value) { return typeof value === 'number' && Number.isFinite(value); },

    metadata(column) {
        return window.globeInstance?.dataService.getMetricMetadata?.(column) || {
            column, label: column?.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase()) || 'Observations',
            kind: column?.startsWith('new_') ? 'daily' : 'cumulative', allowedUnits: ['count'], smoothingAllowed: false
        };
    },

    unitLabel(column, unit) {
        return window.globeInstance?.dataService.getUnitLabel?.(column, unit) || ({ count: 'Count', per100k: 'Per 100,000 people', percent: '% of population', per100: 'Doses per 100 people' }[unit] || 'Count');
    },

    prepareDataForCountry(countryCode, settings = {}) {
        const service = window.globeInstance?.dataService;
        if (!service || typeof countryCode !== 'string') return null;
        const key = countryCode.toLowerCase();
        const available = service.availableColumns[service.currentDataset] || [];
        const column = settings.selectedColumn || settings.column || service.currentColumn || available[0];
        if (!column || !available.includes(column)) return null;
        const unit = settings.unit || service.displayUnit || 'count';
        const smoothing = settings.smoothing || service.smoothing || 'raw';
        let observations;
        if (service.getCountrySeries) observations = service.getCountrySeries(key, { column, unit, smoothing });
        else {
            const rows = service.indexedData[service.currentDataset]?.[key];
            if (!rows) return null;
            observations = (service.availableDates || Object.keys(rows).sort()).map(date => ({ date, value: rows[date]?.[column] ?? null }));
        }
        if (!observations?.length) return null;
        return { countryCode: key, countryName: service.getCountryName(key), column, unit, smoothing,
            metric: this.metadata(column), columns: [column], dates: observations.map(point => point.date),
            displayDates: observations.map(point => service.formatDate(point.date)),
            missingReasons: observations.map(point => this.isValue(point.value) ? '' :
                unit !== 'count' && !(service.getPopulation?.(key) > 0) ? 'No population estimate' :
                this.isValue(point.rawValue) && smoothing === '7day' ? 'Insufficient reported days for the 7-day average' : 'No observation'),
            series: { [column]: observations.map(point => this.isValue(point.value) ? point.value : null) } };
    },

    applySettings(data, settings = {}) {
        const timeline = settings.timeline?.length ? settings.timeline : data.dates;
        const single = settings.dateMode === 'single';
        const start = this.dateIndex(single ? settings.singleDate ?? 100 : settings.dateRange?.start ?? 0, timeline.length);
        const end = single ? start : this.dateIndex(settings.dateRange?.end ?? 100, timeline.length);
        const selected = timeline.slice(Math.min(start, end), Math.max(start, end) + 1);
        // Keep every calendar day between endpoints, including dates on which
        // no selected country reports. Removing those dates would bridge gaps.
        const dates = data.dates.filter(date => date >= selected[0] && date <= selected.at(-1));
        const indices = new Map(data.dates.map((date, index) => [date, index]));
        const service = window.globeInstance?.dataService;
        return { ...data, dates, displayDates: dates.map(date => service?.formatDate(date) || date),
            missingReasons: dates.map(date => data.missingReasons?.[indices.get(date)] || 'No observation'),
            series: Object.fromEntries(data.columns.map(column => [column, dates.map(date => data.series[column][indices.get(date)] ?? null)])) };
    },

    createChart(container, countryCode, vizType = 'line', settings) {
        container.replaceChildren();
        const data = this.prepareDataForCountry(countryCode, settings);
        if (!data) return this.showError(container, 'No observations available for this country and dataset.');
        settings = settings || ChartControls.initialize(container, countryCode, vizType, data);
        if (!['line', 'bar'].includes(vizType)) return this.showError(container, 'Choose a line or bar chart.');
        const filtered = this.applySettings(data, settings);
        const context = `${data.metric.label} · ${this.unitLabel(data.column, data.unit)}${data.metric.smoothingAllowed && data.smoothing === '7day' ? ' · 7-day average' : ''}`;
        const metricLabel = document.getElementById('analysisMetricLabel');
        if (metricLabel) metricLabel.textContent = data.metric.label;
        const units = document.getElementById('analysisUnits');
        if (units) units.textContent = context;
        this.renderCartesian(container, filtered.dates, [{ key: data.countryCode, label: data.countryName,
            color: this.countryColor(data.countryCode), values: filtered.series[data.column], missingReasons: filtered.missingReasons }], vizType,
        { title: `${data.countryName}: ${data.metric.label}`, unitLabel: this.unitLabel(data.column, data.unit),
            metric: data.metric, smoothing: data.smoothing, subtitle: context, yDomain: settings.yDomain });
    },

    formatValue(value) {
        if (!this.isValue(value)) return 'No observation';
        const magnitude = Math.abs(value);
        return magnitude >= 1000000 ? `${(value / 1000000).toFixed(2)}M` : magnitude >= 1000 ? `${(value / 1000).toFixed(1)}k` :
            value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    },

    formatTickValue(value) { return this.formatValue(value); },

    valueDomain(values) {
        let min = 0, max = 0;
        for (const value of values) if (this.isValue(value)) { min = Math.min(min, value); max = Math.max(max, value); }
        return min === max ? [0, 1] : [min < 0 ? min * 1.1 : 0, max > 0 ? max * 1.1 : 0];
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
        const [x, y] = d3.pointer(event, container);
        tooltip.style.left = `${Math.max(0, Math.min(x + 12, container.clientWidth - tooltip.offsetWidth))}px`;
        tooltip.style.top = `${Math.max(0, y - tooltip.offsetHeight - 12)}px`;
    },

    hideTooltip(container) { container.querySelectorAll('.chart-tooltip').forEach(tooltip => tooltip.remove()); },

    // Long histories use weekly aggregates rather than hundreds of hairline bars.
    aggregateBars(dates, series, metric, smoothing) {
        if (dates.length <= 120) return { dates, series, note: '' };
        const groups = [];
        dates.forEach((date, index) => {
            const day = new Date(`${date}T00:00:00Z`); day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
            const key = day.toISOString().slice(0, 10);
            if (groups.at(-1)?.key !== key) groups.push({ key, indices: [] });
            groups.at(-1).indices.push(index);
        });
        const total = metric?.kind === 'daily' && smoothing !== '7day';
        const last = metric?.kind === 'cumulative';
        return { dates: groups.map(group => group.key), series: series.map(item => ({ ...item, values: groups.map(group => {
            const values = group.indices.map(index => item.values[index]);
            // Partial observations must not masquerade as complete weekly totals.
            if (values.some(value => !this.isValue(value))) return null;
            return last ? values.at(-1) : total ? d3.sum(values) : d3.mean(values);
        }) })), note: total ? 'Weekly totals · edge weeks may cover fewer than 7 days' :
            last ? 'Weekly snapshots · last observation in each week' : 'Weekly means · average of displayed daily values' };
    },

    renderCartesian(container, dates, series, type, options = {}) {
        container.replaceChildren();
        if (!dates.length) return this.showError(container, 'No dates available.');
        let note = '';
        if (type === 'bar') ({ dates, series, note } = this.aggregateBars(dates, series, options.metric, options.smoothing));
        const width = Math.max(280, container.clientWidth || 720);
        const height = width < 500 ? 330 : 390;
        const margin = { top: 40, right: 20, bottom: 44, left: width < 500 ? 55 : 66 };
        const plotWidth = width - margin.left - margin.right, plotHeight = height - margin.top - margin.bottom;
        const active = series.filter(item => item.selected !== false), values = active.flatMap(item => item.values);
        container.style.position = 'relative';
        const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`)
            .attr('width', '100%').attr('height', height).attr('role', 'img')
            .attr('aria-label', `${options.title || 'Observations over time'}. ${options.unitLabel || 'Count'}. Missing observations appear as gaps.`);
        svg.append('title').text(options.title || 'Observations over time');
        const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
        const y = d3.scaleLinear().domain(options.yDomain || this.valueDomain(values)).nice().range([plotHeight, 0]);
        const extent = d3.extent(dates, date => new Date(`${date}T00:00:00Z`));
        if (+extent[0] === +extent[1]) { extent[0] = new Date(+extent[0] - 43200000); extent[1] = new Date(+extent[1] + 43200000); }
        const time = d3.scaleUtc().domain(extent).range([0, plotWidth]);
        const band = d3.scaleBand().domain(dates).range([0, plotWidth]).padding(0.2);
        const xAt = date => type === 'bar' ? band(date) + band.bandwidth() / 2 : time(new Date(`${date}T00:00:00Z`));
        const tickDates = dates.filter((_, index) => index % Math.max(1, Math.ceil(dates.length / (width < 500 ? 3 : 6))) === 0);
        const xAxis = type === 'bar' ? d3.axisBottom(band).tickValues(tickDates).tickFormat(date => d3.utcFormat(dates.length < 10 ? '%d %b' : '%b %Y')(new Date(`${date}T00:00:00Z`))) :
            d3.axisBottom(time).ticks(width < 500 ? 3 : 6).tickFormat(d3.utcFormat(dates.length < 60 ? '%d %b' : '%b %Y'));
        plot.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotHeight})`).call(xAxis);
        plot.append('g').attr('class', 'y-axis').call(d3.axisLeft(y).ticks(5).tickFormat(value => this.formatValue(value)));
        plot.append('g').attr('class', 'grid-lines').selectAll('line').data(y.ticks(5)).join('line')
            .attr('x2', plotWidth).attr('y1', value => y(value)).attr('y2', value => y(value));
        svg.append('text').attr('class', 'axis-unit-label').attr('x', margin.left).attr('y', 18).text(options.unitLabel || 'Count');
        active.forEach((item, seriesIndex) => {
            const color = item.color || this.countryColor(item.key), points = dates.map((date, index) => ({ date, value: item.values[index] }));
            if (type === 'bar') {
                const barWidth = band.bandwidth() / Math.max(1, active.length);
                plot.append('g').selectAll('rect').data(points.filter(point => this.isValue(point.value))).join('rect')
                    .attr('class', 'data-bar').attr('x', point => band(point.date) + seriesIndex * barWidth)
                    .attr('width', barWidth).attr('y', point => y(Math.max(0, point.value)))
                    .attr('height', point => Math.abs(y(point.value) - y(0))).attr('fill', color).attr('rx', 1)
                    .on('mouseover', (event, point) => this.showTooltip(container, event,
                        [point.date, item.label, `${this.formatValue(point.value)} ${options.unitLabel || 'Count'}`]))
                    .on('mouseout', () => this.hideTooltip(container));
            } else {
                const line = d3.line().defined(point => this.isValue(point.value)).x(point => xAt(point.date)).y(point => y(point.value));
                plot.append('path').datum(points).attr('class', 'data-line').attr('d', line).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2.25);
                if (dates.length <= 30) plot.append('g').selectAll('circle').data(points.filter(point => this.isValue(point.value))).join('circle')
                    .attr('class', 'data-point').attr('cx', point => xAt(point.date)).attr('cy', point => y(point.value)).attr('r', 2.5).attr('fill', color);
            }
        });
        if (type === 'line') {
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
                    .attr('fill', item => item.color || this.countryColor(item.key)).attr('stroke', '#101c2c').attr('stroke-width', 2);
                const lines = [date, ...active.map(item => `${item.label}: ${this.isValue(item.values[index]) ? this.formatValue(item.values[index]) : item.missingReasons?.[index] || 'No observation'}`), options.unitLabel || 'Count'];
                overlay.attr('aria-valuenow', index).attr('aria-valuetext', lines.join(', ')); this.showTooltip(container, event, lines);
            };
            overlay.on('pointermove', event => { const [x] = d3.pointer(event, plot.node()); inspect(d3.bisectCenter(dateNumbers, +time.invert(x)), event); })
                .on('pointerleave blur', () => { crosshair.attr('visibility', 'hidden'); cursorPoints.selectAll('circle').remove(); this.hideTooltip(container); })
                .on('keydown', event => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault(); const current = Number(overlay.attr('aria-valuenow'));
                    const index = event.key === 'Home' ? 0 : event.key === 'End' ? dates.length - 1 : Math.max(0, Math.min(dates.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1)));
                    inspect(index, { clientX: margin.left + xAt(dates[index]), clientY: margin.top + 60 });
                });
        }
        const legend = document.createElement('div'); legend.className = 'chart-legend';
        for (const item of series) {
            const entry = document.createElement('span'); entry.className = 'legend-item';
            const swatch = document.createElement('i'); swatch.style.backgroundColor = item.color || this.countryColor(item.key);
            entry.append(swatch, document.createTextNode(item.label)); legend.appendChild(entry);
        }
        container.appendChild(legend);
        if (note) { const hint = document.createElement('p'); hint.className = 'chart-note'; hint.textContent = note; container.appendChild(hint); }
        if (!values.some(value => this.isValue(value))) this.showError(container, 'No observations for this metric, unit and date range. Population-adjusted values require population data.');
    }
};
