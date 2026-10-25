// Country analysis keeps its settings and reporting calendar independent of the globe.
const ChartControls = {
    state: { dateRange: { start: 0, end: 100 } }, context: null, frame: null,
    clearContext() { if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null; this.context = null; },

    initialize(container, countryCode, vizType, data = ChartFactory.prepareDataForCountry(countryCode), service = window.AtlasWorkspaces?.get('country') || window.globeInstance.dataService) {
        if (!data) return this.getSettings();
        const timeline = data.timeline || service.getAvailableDates?.(data.column) || data.dates;
        this.setTimeline(timeline);
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
    setTimeline(timeline) {
        const previous = this.timeline;
        if (previous?.length && timeline.length && (previous.length !== timeline.length || previous.some((date, index) => date !== timeline[index]))) {
            const startDate = previous[ChartFactory.dateIndex(this.state.dateRange.start, previous.length)];
            const endDate = previous[ChartFactory.dateIndex(this.state.dateRange.end, previous.length)];
            const nextStart = timeline.findIndex(date => date >= startDate);
            const start = nextStart < 0 ? timeline.length - 1 : nextStart;
            const end = Math.max(start, timeline.findLastIndex(date => date <= endDate));
            const last = timeline.length - 1;
            this.state.dateRange = { start: last ? start / last * 100 : 0, end: last ? end / last * 100 : 100 };
        }
        this.timeline = timeline;
    },
    updateChartInRealTime() {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => {
            this.frame = null; const context = this.context;
            if (!context?.container.isConnected || document.hidden || window.CompareMode?.state.active || document.getElementById('visualizationPanel')?.hidden) return;
            const render = () => ChartFactory.createChart(context.container, context.countryCode, context.vizType, this.getSettings());
            if (window.preserveCountryAnalysisScroll) window.preserveCountryAnalysisScroll(render);
            else render();
            window.syncAtlasState?.();
        });
    }
};
