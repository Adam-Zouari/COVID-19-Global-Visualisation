// Analysis dates stay local; metric, unit and smoothing are shared with the atlas.
const ChartControls = {
    state: { dateRange: { start: 0, end: 100 } }, context: null, frame: null,
    clearContext() { if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null; this.context = null; },

    initialize(container, countryCode, vizType, data = ChartFactory.prepareDataForCountry(countryCode)) {
        if (!data) return this.getSettings();
        const service = window.globeInstance.dataService;
        const timeline = data.timeline || service.getAvailableDates?.(data.column) || data.dates;
        this.timeline = timeline;
        this.context = { container, countryCode, vizType };
        let controls = document.getElementById('chartControlsContainer');
        if (!controls) { controls = document.createElement('div'); controls.id = 'chartControlsContainer'; controls.className = 'chart-controls-container'; container.before(controls); }
        new DateRangeControl(controls, {
            dates: timeline, range: this.state.dateRange, idPrefix: 'date-range', formatDate: date => service.formatDate(date),
            onInput: range => { this.state.dateRange = range; this.updateChartInRealTime(); }
        });
        return this.getSettings();
    },
    getSettings() { return { ...this.state, dateRange: { ...this.state.dateRange }, timeline: this.timeline }; },
    updateChartInRealTime() {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => {
            this.frame = null; const context = this.context;
            if (!context?.container.isConnected || document.hidden || window.CompareMode?.state.active || document.getElementById('visualizationPanel')?.hidden) return;
            const render = () => ChartFactory.createChart(context.container, context.countryCode, context.vizType, this.getSettings());
            if (window.preserveCountryAnalysisScroll) window.preserveCountryAnalysisScroll(render);
            else render();
        });
    }
};
