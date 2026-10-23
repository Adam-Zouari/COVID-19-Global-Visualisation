/** Chart-specific controls use the same observations and date rules as the atlas. */
window.AnalyticsCharts = {
    countryOptions: {},
    dumbbellInitialized: false,
    preserveRange() { this.dumbbellInitialized = true; },
    definition(type) { return window.ChartTypes?.[type]; },
    isAnalytical(type) { return Boolean(this.definition(type)) && !['line', 'bar', 'area'].includes(type); },
    usesPeriod(type) { return Boolean(this.definition(type)?.period); },
    select(type) {
        const state = CompareMode.state;
        if (type !== 'dumbbell' || this.dumbbellInitialized) return;
        this.preserveRange();
        if (state.dateRange.start !== 0 || state.dateRange.end !== 100) return;
        const service = window.dataService, dates = service.getAvailableDates();
        if (dates.length < 2) return;
        const end = Math.max(0, dates.findLastIndex(date => date <= service.currentDate));
        const cutoff = new Date(Date.parse(`${dates[end]}T00:00:00Z`) - 90 * 86400000).toISOString().slice(0, 10);
        const start = Math.max(0, dates.findIndex(date => date >= cutoff));
        state.dateRange = { start: start / (dates.length - 1) * 100, end: end / (dates.length - 1) * 100 };
        CompareUI.initializeDateRangeSlider();
    },
    timeline(service, type, scope, options = {}) {
        if (type === 'scatter' && scope === 'country')
            return [...new Set([...(service.getAvailableDates(options.xMetric) || []),
                ...(service.getAvailableDates(options.yMetric) || [])])].sort();
        return service.getAvailableDates();
    },
    normalizedOptions(service, type, supplied = {}, scope = 'compare') {
        if (type === 'horizontal') {
            const dates = service.getAvailableDates(), fallback = service.currentDate || dates.at(-1);
            const valid = /^\d{4}-\d{2}-\d{2}$/.test(supplied.date || '') && Number.isFinite(Date.parse(supplied.date)) &&
                new Date(supplied.date).toISOString().slice(0, 10) === supplied.date;
            let date = valid ? supplied.date : fallback;
            if (date < dates[0]) date = dates[0];
            if (date > dates.at(-1)) date = dates.at(-1);
            return date ? { date } : {};
        }
        if (type !== 'scatter' || scope !== 'country') return {};
        const options = {}, metrics = AnalyticsData.getMetricOptions(service), keys = metrics.map(metric => metric.value);
        const defaults = service.availableColumns[service.currentDataset] || [];
        options.xMetric = keys.includes(supplied.xMetric) ? supplied.xMetric :
            defaults.includes(service.currentColumn) ? service.currentColumn : defaults[0] || keys[0];
        options.yMetric = keys.includes(supplied.yMetric) ? supplied.yMetric :
            defaults.find(key => key !== options.xMetric) || defaults[0] || options.xMetric;
        for (const axis of ['x', 'y']) {
            const allowed = metrics.find(metric => metric.value === options[`${axis}Metric`])?.unitOptions || ['count'];
            options[`${axis}Unit`] = allowed.includes(supplied[`${axis}Unit`]) ? supplied[`${axis}Unit`] : 'count';
            if (!hasPopulation()) options[`${axis}Unit`] = 'count';
        }
        options.smoothing = ['raw', '7day'].includes(supplied.smoothing) ? supplied.smoothing : service.smoothing || 'raw';
        return options;
    },
    controls(host, type, supplied, onChange, scope = 'compare') {
        if (!host) return;
        const service = window.dataService, options = this.normalizedOptions(service, type, supplied, scope), fields = [];
        if (type === 'dumbbell') this.preserveRange();
        if (type === 'horizontal') fields.push({ key: 'date', label: 'Observation date', kind: 'date' },
            { key: 'date-slider', label: 'Move through time', kind: 'range' });
        if (type === 'scatter' && scope === 'country') {
            const metrics = AnalyticsData.getMetricOptions(service).map(metric => ({ ...metric, group: datasetNames[metric.dataset] || metric.dataset }));
            for (const axis of ['x', 'y']) {
                fields.push({ key: `${axis}Metric`, label: `${axis.toUpperCase()} axis`, choices: metrics });
                const allowed = metrics.find(metric => metric.value === options[`${axis}Metric`])?.unitOptions || ['count'];
                fields.push({ key: `${axis}Unit`, label: `${axis.toUpperCase()} units`, choices: allowed.map(value => ({
                    value, label: service.getUnitLabel(null, value), disabled: value !== 'count' && !hasPopulation()
                })) });
            }
            if ([options.xMetric, options.yMetric].some(column => service.getMetricMetadata(column).smoothingAllowed))
                fields.push({ key: 'smoothing', label: 'Daily observations', choices: [
                    { value: 'raw', label: 'Daily values' }, { value: '7day', label: '7-day average' }
                ] });
        }
        host.hidden = !fields.length;
        const ids = fields.map(field => field.key).join(',');
        if (host.dataset.fields !== ids) { host.replaceChildren(); host.dataset.fields = ids; }
        for (const field of fields) {
            const id = `${scope === 'country' ? 'analysis' : 'compare'}-${field.key}`;
            let input = host.querySelector(`#${id}`);
            if (!input) {
                const group = document.createElement('div'); group.className = 'control-group';
                const label = document.createElement('label'); label.htmlFor = id; label.textContent = field.label;
                input = document.createElement(field.kind ? 'input' : 'select'); input.id = id;
                if (field.kind) input.type = field.kind;
                group.append(label, input); host.appendChild(group);
            }
            const dates = this.timeline(service, type, scope, options);
            if (field.kind === 'range') {
                input.min = '0'; input.max = String(Math.max(0, dates.length - 1)); input.step = '1';
                input.disabled = dates.length < 2;
                const exact = dates.indexOf(options.date);
                input.value = String(exact >= 0 ? exact : Math.max(0, dates.findLastIndex(date => date <= options.date)));
                input.setAttribute('aria-valuetext', options.date ? service.formatDate(options.date) : 'No observations');
                input.oninput = () => onChange({ date: dates[Number(input.value)] });
                continue;
            }
            if (field.choices) updateSelectOptions(input, field.choices);
            else { input.min = dates[0] || ''; input.max = dates.at(-1) || ''; }
            input.value = options[field.key] || '';
            input.title = field.choices?.find(choice => choice.value === input.value)?.label || field.label;
            input.onchange = () => {
                if (field.kind === 'date' && !input.value) { onChange(this.normalizedOptions(service, type, {}, scope)); return; }
                if (field.kind === 'date' && !input.checkValidity()) { input.reportValidity(); return; }
                onChange(this.normalizedOptions(service, type, { ...options, [field.key]: input.value }, scope));
            };
        }
    },
    bounds(service, range = { start: 0, end: 100 }, timeline = service.getAvailableDates()) {
        return {
            startDate: timeline[ChartFactory.dateIndex(range.start, timeline.length)],
            endDate: timeline[ChartFactory.dateIndex(range.end, timeline.length)]
        };
    },
    render(container, type, settings) {
        const service = window.dataService || window.globeInstance.dataService;
        if (!this.definition(type)?.[settings.scope]) return ChartFactory.showError(container, 'Choose a supported chart type.');
        const options = this.normalizedOptions(service, type, settings.options, settings.scope);
        const timeline = settings.timeline || this.timeline(service, type, settings.scope, options);
        const model = AnalyticsData.build(type, service, {
            ...options, ...this.bounds(service, settings.dateRange, timeline),
            scope: settings.scope, countries: settings.countries, country: settings.country,
            column: service.currentColumn, unit: service.displayUnit,
            smoothing: type === 'scatter' && settings.scope === 'country' ? options.smoothing : service.smoothing,
            date: options.date || service.currentDate
        });
        container.replaceChildren();
        if (model.emptyMessage) {
            const title = document.createElement('h3'); title.className = 'chart-heading-title'; title.textContent = model.title;
            container.appendChild(title); ChartFactory.showError(container, model.emptyMessage);
            for (const warning of model.warnings || []) AnalyticsPlot.text(container, warning, 'chart-warning');
        } else AnalyticsRenderers[type](container, model);
        return model;
    },
    renderCountry(container, country, type, settings) {
        const service = window.dataService;
        this.controls(document.getElementById('analysisChartOptions'), type, this.countryOptions, options => {
            if (type === 'scatter') {
                const previous = ChartControls.timeline || [], timeline = this.timeline(service, type, 'country', options);
                if (previous.length && timeline.length && (previous.length !== timeline.length || previous.some((date, index) => date !== timeline[index]))) {
                    const dates = this.bounds(service, ChartControls.state.dateRange, previous);
                    const nextStart = timeline.findIndex(date => date >= dates.startDate);
                    const start = nextStart < 0 ? timeline.length - 1 : nextStart;
                    const end = Math.max(start, timeline.findLastIndex(date => date <= dates.endDate));
                    const last = timeline.length - 1;
                    ChartControls.state.dateRange = { start: last ? start / last * 100 : 0, end: last ? end / last * 100 : 100 };
                }
            }
            this.countryOptions = options; changeVisualization();
        }, 'country');
        const options = this.normalizedOptions(service, type, this.countryOptions, 'country');
        const timeline = this.timeline(service, type, 'country', options);
        settings = settings || ChartControls.initialize(container, country, type, { column: service.currentColumn, timeline });
        const range = document.getElementById('chartControlsContainer'); if (range) range.hidden = false;
        this.render(container, type, { scope: 'country', country, countries: [country],
            dateRange: settings.dateRange, timeline: settings.timeline, options: this.countryOptions });
    }
};
