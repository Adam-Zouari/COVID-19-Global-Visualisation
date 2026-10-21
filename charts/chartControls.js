// Analysis dates stay local; metric, unit and smoothing are shared with the atlas.
const ChartControls = {
    state: { dateMode: 'range', dateRange: { start: 0, end: 100 } }, context: null, frame: null,
    clearContext() { if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null; this.context = null; },

    initialize(container, countryCode, vizType, data = ChartFactory.prepareDataForCountry(countryCode)) {
        if (!data) return this.getSettings();
        const service = window.globeInstance.dataService;
        const timeline = service.getAvailableDates?.(data.column) || data.dates;
        data = { ...data, dates: timeline, displayDates: timeline.map(date => service.formatDate(date)) };
        this.timeline = timeline;
        this.context = { container, countryCode, vizType };
        let controls = document.getElementById('chartControlsContainer');
        if (!controls) { controls = document.createElement('div'); controls.id = 'chartControlsContainer'; controls.className = 'chart-controls-container'; container.before(controls); }
        controls.replaceChildren(); const inputs = {}, outputs = {};
        for (const key of ['start', 'end']) {
            const row = document.createElement('div'); row.className = 'slider-with-label';
            const label = document.createElement('label'); label.htmlFor = `date-range-${key}`; label.textContent = key === 'start' ? 'From' : 'To';
            const output = document.createElement('output'); outputs[key] = output;
            const slider = document.createElement('input'); inputs[key] = slider;
            slider.type = 'range'; slider.id = `date-range-${key}`; slider.min = '0'; slider.max = String(Math.max(0, data.dates.length - 1)); slider.step = '1';
            slider.value = String(ChartFactory.dateIndex(this.state.dateRange[key], data.dates.length)); slider.disabled = data.dates.length <= 1;
            row.append(label, output, slider); controls.appendChild(row);
        }
        const updateLabels = () => {
            for (const key of ['start', 'end']) { outputs[key].textContent = data.displayDates[Number(inputs[key].value)] || ''; inputs[key].setAttribute('aria-valuetext', outputs[key].textContent); }
        };
        for (const key of ['start', 'end']) inputs[key].addEventListener('input', () => {
            if (Number(inputs.start.value) > Number(inputs.end.value)) inputs[key].value = inputs[key === 'start' ? 'end' : 'start'].value;
            this.state.dateRange[key] = data.dates.length > 1 ? Number(inputs[key].value) / (data.dates.length - 1) * 100 : 100;
            updateLabels(); this.updateChartInRealTime();
        });
        updateLabels(); return this.getSettings();
    },
    getSettings() { return { ...this.state, dateRange: { ...this.state.dateRange }, timeline: this.timeline }; },
    updateChartInRealTime() {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => {
            this.frame = null; const context = this.context;
            if (context?.container.isConnected && !document.hidden && !window.CompareMode?.state.active && !document.getElementById('visualizationPanel')?.hidden)
                ChartFactory.createChart(context.container, context.countryCode, context.vizType, this.getSettings());
        });
    }
};
