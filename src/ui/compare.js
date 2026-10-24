window.CompareMode = {
    state: { active: false, countries: [], displayMode: 'combined', chartType: 'line',
        dateRange: { start: 0, end: 100 }, scale: 'shared', chartOptions: {} },

    enter({ focus = true } = {}) {
        const globe = window.globeInstance;
        if (this.state.active || !globe?.dataService.availableDates.length) return;
        window.stopTimeline?.();
        this.state.active = true;
        globe.stopAutoRotation?.(); globe.cancelRotationAnimation?.();
        const code = globe.selectedCountryCode;
        if (code && !this.state.countries.includes(code) && this.state.countries.length < this.countryLimit()) this.state.countries.push(code);
        CompareUI.matchExploreBottomSpacing();
        AtlasView.render('compare');
        CompareUI.initialize({ focus }); this.updateComparisonView();
        window.syncAtlasState?.();
    },

    exit() {
        if (!this.state.active) return;
        this.state.active = false;
        CompareUI.clearScrollMinimum();
        AtlasView.render('explore');
        window.globeInstance?.resize();
        if (document.getElementById('visualizationPanel')?.hidden === false) window.changeVisualization?.();
        document.getElementById('navExplore')?.focus();
        window.syncAtlasState?.();
    },

    message(text = '') {
        const element = document.getElementById('compareMessage');
        if (element) { element.textContent = text; element.hidden = !text; }
    },

    countryLimit() { return this.state.chartType === 'scatter' ? 3 : 4; },

    addCountry(code) {
        code = String(code).toLowerCase();
        if (!window.globeInstance.dataService.getAllCountries().some(country => country.countryCode === code) || this.state.countries.includes(code)) return;
        if (this.state.countries.length >= this.countryLimit()) { this.message(`Compare up to ${this.countryLimit()} countries in this chart. Remove a country before adding another.`); return; }
        this.state.countries.push(code);
        this.message(); CompareUI.updateCountryList(); this.updateComparisonView(); window.syncAtlasState?.();
    },

    removeCountry(code) {
        this.state.countries = this.state.countries.filter(country => country !== code);
        this.message(); CompareUI.updateCountryList(); this.updateComparisonView(); window.syncAtlasState?.();
    },

    changeDisplayMode(mode) {
        if (!['separate', 'combined'].includes(mode)) return;
        if (mode === 'separate' && window.ChartTypes?.[this.state.chartType]?.separate === false) return;
        if (mode === 'separate' && window.AnalyticsCharts?.isAnalytical(this.state.chartType)) return;
        this.state.displayMode = mode; this.updateComparisonView(); window.syncAtlasState?.();
    },

    changeChartType(type) {
        if (!Object.hasOwn(window.ChartTypes || { line: {}, bar: {} }, type) || (window.ChartTypes && !ChartTypes[type].compare)) return;
        window.AnalyticsCharts?.select(type);
        this.state.chartType = type; this.updateComparisonView({ retainHeight: false }); window.syncAtlasState?.();
    },

    changeScale(value) {
        if (!['shared', 'independent'].includes(value)) return;
        this.state.scale = value; this.updateComparisonView(); window.syncAtlasState?.();
    },

    updateDateRange(start, end) {
        window.AnalyticsCharts?.preserveRange();
        const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));
        this.state.dateRange = { start: Math.min(clamp(start), clamp(end)), end: Math.max(clamp(start), clamp(end)) };
        this.updateComparisonView(); window.syncAtlasState?.();
    },

    syncControls() {
        const service = window.globeInstance?.dataService;
        if (!service) return;
        if (window.ChartTypes && !ChartTypes[this.state.chartType]?.compare) this.state.chartType = 'line';
        const description = document.querySelector('.compare-heading p');
        if (description) description.textContent = this.state.chartType === 'scatter' ?
            'One measure over time · Two or three countries as axes' : 'Shared metrics, dates, and units · Up to four countries';
        const options = document.querySelector('.compare-options'); if (options) options.hidden = !this.state.countries.length;
        const columns = service.availableColumns[service.currentDataset] || [];
        const column = service.currentColumn, metric = ChartFactory.metadata(column);
        const definition = window.ChartTypes?.[this.state.chartType] || { metric: true, period: true, separate: true };
        if (!definition.separate) this.state.displayMode = 'combined';
        const metricControls = document.querySelector('.controls-row'); if (metricControls) metricControls.hidden = !definition.metric;
        const layoutControls = document.querySelector('.display-mode-buttons'); if (layoutControls) layoutControls.hidden = !definition.separate;
        const scaleLabel = document.querySelector('label[for="compareScaleSelector"]'); if (scaleLabel) scaleLabel.hidden = !definition.separate;
        const selector = document.getElementById('compareMetricSelector');
        if (selector) {
            updateSelectOptions(selector, columns.map(value => ({ value, label: ChartFactory.metadata(value).label })));
            selector.value = column;
            selector.onchange = () => atlasActions.setMetric(selector.value);
        }
        const units = document.getElementById('compareUnitSelector');
        if (units) {
            const populationAvailable = hasPopulation();
            updateSelectOptions(units, metric.allowedUnits.map(value => ({ value, label: ChartFactory.unitLabel(column, value),
                disabled: value !== 'count' && !populationAvailable })));
            units.title = populationAvailable ? 'Use population-adjusted values to compare countries of different sizes.' : 'Population data is unavailable; counts remain available.';
            units.value = service.displayUnit || 'count';
            units.onchange = () => atlasActions.setUnit(units.value);
        }
        const smoothing = document.getElementById('compareSmoothingSelector');
        if (smoothing) {
            const group = smoothing.closest('.control-group'); if (group) group.hidden = !metric.smoothingAllowed;
            smoothing.disabled = !metric.smoothingAllowed; smoothing.value = metric.smoothingAllowed ? service.smoothing || 'raw' : 'raw';
            smoothing.onchange = () => atlasActions.setSmoothing(smoothing.value);
        }
        const type = document.getElementById('compareChartType'); if (type) type.value = this.state.chartType;
        if (window.AnalyticsCharts) this.state.chartOptions = AnalyticsCharts.normalizedOptions(service, this.state.chartType, this.state.chartOptions);
        window.AnalyticsCharts?.controls(document.getElementById('compareChartOptions'), this.state.chartType, this.state.chartOptions, options => {
            this.state.chartOptions = options; this.updateComparisonView(); window.syncAtlasState?.();
        });
        const period = document.querySelector('.date-selection-panel');
        if (period) period.hidden = window.AnalyticsCharts ? !AnalyticsCharts.usesPeriod(this.state.chartType) : false;
        for (const mode of ['combined', 'separate']) {
            const button = document.getElementById(`${mode === 'combined' ? 'combinedChart' : 'separateCharts'}Btn`);
            if (button) { button.classList.toggle('active', this.state.displayMode === mode); button.setAttribute('aria-pressed', String(this.state.displayMode === mode)); }
            if (button && mode === 'separate') button.disabled = !definition.separate;
        }
        const scale = document.getElementById('compareScaleSelector');
        if (scale) { scale.hidden = !definition.separate; scale.value = this.state.scale; scale.disabled = this.state.displayMode !== 'separate'; scale.onchange = () => this.changeScale(scale.value); }
    },

    updateComparisonView({ retainHeight = true } = {}) {
        if (!this.state.active) return;
        return CompareUI.preserveScroll(() => this.renderComparisonView(), { retainHeight });
    },

    renderComparisonView() {
        ChartFactory.reconcileComparisonCountries(this.state.countries);
        const container = document.getElementById('compareChartContainer');
        ChartFactory.clearChart(container); this.syncControls();
        if (!this.state.countries.length) { this.message(); return CompareUI.showNoCountriesMessage(); }
        if (this.state.countries.length === 1) this.message('Add another country to compare trends on the same dates.');
        else if (document.getElementById('compareMessage')?.textContent.startsWith('Add another')) this.message();
        const settings = { dateRange: this.state.dateRange, selectedColumn: window.globeInstance.dataService.currentColumn,
            unit: window.globeInstance.dataService.displayUnit || 'count', smoothing: window.globeInstance.dataService.smoothing || 'raw' };
        if (window.AnalyticsCharts?.isAnalytical(this.state.chartType)) {
            return AnalyticsCharts.render(container, this.state.chartType, { scope: 'compare', countries: this.state.countries,
                dateRange: this.state.dateRange, options: this.state.chartOptions });
        }
        if (this.state.displayMode === 'combined') {
            const chart = document.createElement('div'); chart.className = 'combined-chart-container'; container.appendChild(chart);
            CompareCharts.createCombinedChart(chart, this.state.countries, this.state.chartType, settings); return;
        }
        const countries = CompareCharts.prepare(this.state.countries, settings);
        let sharedDomain;
        if (this.state.scale === 'shared') {
            const series = countries.map(country => ({ values: this.state.chartType === 'bar' ? ChartFactory.aggregateBars(country.dates,
                [{ values: country.series[country.column] }], country.metric, country.smoothing).series[0].values : country.series[country.column] }));
            sharedDomain = ChartFactory.valueDomain(series.flatMap(item => item.values));
            for (const text of ChartFactory.comparisonWarnings(series, settings.unit)) {
                const warning = document.createElement('p'); warning.className = 'chart-warning'; warning.textContent = text; container.appendChild(warning);
            }
        }
        const wrapper = document.createElement('div'); wrapper.className = 'compare-charts-wrapper'; container.appendChild(wrapper);
        // Complete the grid before measuring chart widths.
        const charts = countries.map(country => {
            const card = document.createElement('article'); card.className = 'country-chart-container';
            const title = document.createElement('h3'); title.className = 'chart-title';
            appendCountryLabel(title, country.countryCode, country.countryName, 'chart-title-flag');
            const swatch = document.createElement('i'); swatch.className = 'country-color'; swatch.style.backgroundColor = ChartFactory.countryColor(country.countryCode); title.prepend(swatch);
            const chart = document.createElement('div'); chart.className = 'chart-div'; card.append(title, chart); wrapper.appendChild(card);
            return { country, chart };
        });
        for (const { country, chart } of charts) ChartFactory.renderCartesian(chart, country.dates,
            [{ key: country.countryCode, label: country.countryName, values: country.series[country.column], missingReasons: country.missingReasons,
                reported: country.reported, color: ChartFactory.countryColor(country.countryCode) }], this.state.chartType,
            { title: `${country.countryName}: ${country.metric.label}`, unitLabel: ChartFactory.unitLabel(country.column, country.unit),
                column: country.column, unit: country.unit, metric: country.metric, smoothing: country.smoothing, yDomain: sharedDomain, showLegend: false });
    },

    reorderCountries(dragged, target) {
        const from = this.state.countries.indexOf(dragged), to = this.state.countries.indexOf(target);
        if (from < 0 || to < 0 || from === to) return;
        this.state.countries.splice(from, 1); this.state.countries.splice(to, 0, dragged);
        CompareUI.updateCountryList(); this.updateComparisonView(); window.syncAtlasState?.();
    }
};
