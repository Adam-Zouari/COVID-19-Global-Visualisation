window.CompareMode = {
    state: { active: false, countries: [], displayMode: 'combined', chartType: 'line',
        dateRange: { start: 0, end: 100 }, selectedColumn: null, scale: 'shared' },

    enter() {
        const globe = window.globeInstance;
        if (this.state.active || !globe?.dataService.availableDates.length) return;
        window.stopTimeline?.();
        this.state.active = true;
        globe.stopAutoRotation?.(); globe.cancelRotationAnimation?.();
        const code = globe.selectedCountryCode || document.getElementById(`country-${globe.selectedCountry}`)?.getAttribute('data-country-code');
        if (code && !this.state.countries.includes(code) && this.state.countries.length < 4) this.state.countries.push(code);
        const explore = document.getElementById('exploreView');
        if (explore) explore.hidden = true;
        CompareUI.show(); this.syncControls(); this.updateComparisonView(); this.updateNavigation();
        window.syncAtlasState?.();
    },

    exit() {
        if (!this.state.active) return;
        this.state.active = false; CompareUI.hide();
        const explore = document.getElementById('exploreView');
        if (explore) explore.hidden = false;
        this.updateNavigation();
        window.globeInstance?.resizeGlobe?.();
        document.getElementById('navExplore')?.focus();
        window.syncAtlasState?.();
    },

    updateNavigation() {
        for (const [id, active] of [['navExplore', !this.state.active], ['navCompare', this.state.active]]) {
            const node = document.getElementById(id);
            if (node) { node.classList.toggle('active', active); if (active) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current'); }
        }
    },

    message(text = '') {
        const element = document.getElementById('compareMessage');
        if (element) { element.textContent = text; element.hidden = !text; }
    },

    addCountry(code) {
        code = String(code).toLowerCase();
        if (!window.globeInstance.dataService.getAllCountries().some(country => country.countryCode === code) || this.state.countries.includes(code)) return;
        if (this.state.countries.length >= 4) { this.message('Compare up to 4 countries. Remove a country before adding another.'); return; }
        this.state.countries.push(code);
        this.message(); CompareUI.updateCountryList(); this.updateComparisonView(); window.syncAtlasState?.();
    },

    removeCountry(code) {
        this.state.countries = this.state.countries.filter(country => country !== code);
        this.message(); CompareUI.updateCountryList(); this.updateComparisonView(); window.syncAtlasState?.();
    },

    changeDisplayMode(mode) {
        if (!['separate', 'combined'].includes(mode)) return;
        this.state.displayMode = mode; this.syncControls(); this.updateComparisonView(); window.syncAtlasState?.();
    },

    changeChartType(type) {
        if (!['bar', 'line'].includes(type)) return;
        this.state.chartType = type; this.syncControls(); this.updateComparisonView(); window.syncAtlasState?.();
    },

    changeScale(value) {
        if (!['shared', 'independent'].includes(value)) return;
        this.state.scale = value; this.updateComparisonView(); window.syncAtlasState?.();
    },

    updateDateRange(start, end) {
        const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));
        this.state.dateRange = { start: Math.min(clamp(start), clamp(end)), end: Math.max(clamp(start), clamp(end)) };
        this.updateComparisonView(); window.syncAtlasState?.();
    },

    updateSingleDate(value) { this.updateDateRange(value, value); },

    updateSelectedColumn(column) {
        const service = window.globeInstance.dataService;
        if (!service.availableColumns[service.currentDataset].includes(column)) return;
        this.state.selectedColumn = column;
        if (window.atlasActions?.setMetric) atlasActions.setMetric(column);
        else { service.currentColumn = column; this.syncControls(); this.updateComparisonView(); }
        window.syncAtlasState?.();
    },

    syncControls() {
        const service = window.globeInstance?.dataService;
        if (!service) return;
        const options = document.querySelector('.compare-options'); if (options) options.hidden = !this.state.countries.length;
        const columns = service.availableColumns[service.currentDataset] || [];
        this.state.selectedColumn = columns.includes(service.currentColumn) ? service.currentColumn :
            columns.includes(this.state.selectedColumn) ? this.state.selectedColumn : columns[0];
        const metric = ChartFactory.metadata(this.state.selectedColumn);
        const selector = document.getElementById('compareMetricSelector');
        if (selector) {
            selector.replaceChildren();
            for (const column of columns) { const option = document.createElement('option'); option.value = column; option.textContent = ChartFactory.metadata(column).label; selector.appendChild(option); }
            selector.value = this.state.selectedColumn;
            selector.onchange = () => this.updateSelectedColumn(selector.value);
        }
        const units = document.getElementById('compareUnitSelector');
        if (units) {
            units.replaceChildren();
            const populationAvailable = service.getAllCountries?.().some(country => service.getPopulation?.(country.countryCode) > 0) || false;
            for (const unit of metric.allowedUnits || ['count']) {
                const option = document.createElement('option'); option.value = unit; option.textContent = ChartFactory.unitLabel(this.state.selectedColumn, unit);
                option.disabled = unit !== 'count' && !populationAvailable;
                if (option.disabled) option.title = 'Population data is unavailable.';
                units.appendChild(option);
            }
            units.title = populationAvailable ? 'Use population-adjusted values to compare countries of different sizes.' : 'Population data is unavailable; counts remain available.';
            units.value = service.displayUnit || 'count';
            units.onchange = () => {
                if (window.atlasActions?.setUnit) atlasActions.setUnit(units.value);
                else { service.displayUnit = units.value; this.updateComparisonView(); }
                window.syncAtlasState?.();
            };
        }
        const smoothing = document.getElementById('compareSmoothingSelector');
        if (smoothing) {
            const group = smoothing.closest('.control-group'); if (group) group.hidden = !metric.smoothingAllowed;
            smoothing.disabled = !metric.smoothingAllowed; smoothing.value = metric.smoothingAllowed ? service.smoothing || 'raw' : 'raw';
            smoothing.onchange = () => {
                if (window.atlasActions?.setSmoothing) atlasActions.setSmoothing(smoothing.value);
                else { service.smoothing = smoothing.value; this.updateComparisonView(); }
                window.syncAtlasState?.();
            };
        }
        const type = document.getElementById('compareChartType'); if (type) type.value = this.state.chartType;
        for (const mode of ['combined', 'separate']) {
            const button = document.getElementById(`${mode === 'combined' ? 'combinedChart' : 'separateCharts'}Btn`);
            if (button) { button.classList.toggle('active', this.state.displayMode === mode); button.setAttribute('aria-pressed', String(this.state.displayMode === mode)); }
        }
        const scale = document.getElementById('compareScaleSelector');
        if (scale) { scale.value = this.state.scale; scale.disabled = this.state.displayMode !== 'separate'; scale.onchange = () => this.changeScale(scale.value); }
    },

    updateComparisonView() {
        if (!this.state.active) return;
        ChartFactory.reconcileComparisonCountries(this.state.countries);
        const container = document.getElementById('compareChartContainer');
        container.replaceChildren(); this.syncControls();
        if (!this.state.countries.length) { this.message(); return CompareUI.showNoCountriesMessage(); }
        if (this.state.countries.length === 1) this.message('Add another country to compare trends on the same dates.');
        else if (document.getElementById('compareMessage')?.textContent.startsWith('Add another')) this.message();
        const settings = { dateRange: this.state.dateRange, selectedColumn: this.state.selectedColumn,
            unit: window.globeInstance.dataService.displayUnit || 'count', smoothing: window.globeInstance.dataService.smoothing || 'raw' };
        if (this.state.displayMode === 'combined') {
            const chart = document.createElement('div'); chart.className = 'combined-chart-container'; container.appendChild(chart);
            CompareCharts.createCombinedChart(chart, this.state.countries, this.state.chartType, settings); return;
        }
        const countries = CompareCharts.prepare(this.state.countries, settings);
        const domainValues = countries.flatMap(country => this.state.chartType === 'bar' ? ChartFactory.aggregateBars(country.dates,
            [{ values: country.series[country.column] }], country.metric, country.smoothing).series[0].values : country.series[country.column]);
        const sharedDomain = this.state.scale === 'shared' ? ChartFactory.valueDomain(domainValues) : null;
        if (this.state.scale === 'shared' && ChartFactory.comparisonWarnings) {
            const series = countries.map(country => ({ values: this.state.chartType === 'bar' ? ChartFactory.aggregateBars(country.dates,
                [{ values: country.series[country.column] }], country.metric, country.smoothing).series[0].values : country.series[country.column] }));
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
