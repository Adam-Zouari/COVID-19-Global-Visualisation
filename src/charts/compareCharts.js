const CompareCharts = {
    prepare(countryCodes, settings = {}) {
        const codes = [...new Set(countryCodes.map(code => code.toLowerCase()))];
        ChartFactory.reconcileComparisonCountries(codes);
        const countries = codes.map(code => ChartFactory.prepareDataForCountry(code, settings)).filter(Boolean);
        const service = window.globeInstance.dataService;
        const timeline = service.getAvailableDates?.(settings.selectedColumn || service.currentColumn) || [...new Set(countries.flatMap(country => country.dates))].sort();
        return countries.map(country => ChartFactory.applySettings(country, { ...settings, timeline }));
    },
    createCombinedChart(container, countryCodes, chartType = 'line', settings = {}) {
        ChartFactory.clearChart(container); const countries = this.prepare(countryCodes, settings);
        if (!countries.length) return ChartFactory.showError(container, 'No observations available for the selected countries.');
        if (!['line', 'bar'].includes(chartType)) return ChartFactory.showError(container, 'Choose a supported chart type.');
        const first = countries[0];
        ChartFactory.renderCartesian(container, first.dates, countries.map(country => ({
            key: country.countryCode, label: country.countryName, color: ChartFactory.countryColor(country.countryCode), values: country.series[first.column], missingReasons: country.missingReasons, reported: country.reported
        })), chartType, { title: `${first.metric.label} — ${countries.map(country => country.countryName).join(' vs ')}`,
            column: first.column, unit: first.unit, metric: first.metric, smoothing: first.smoothing });
    }
};
