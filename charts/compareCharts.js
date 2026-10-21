const CompareCharts = {
    prepareDataForCountries(countryCodes, settings = {}) {
        return [...new Set(countryCodes)].map(code => ChartFactory.prepareDataForCountry(code, settings)).filter(Boolean);
    },
    prepare(countryCodes, settings = {}) {
        const countries = this.prepareDataForCountries(countryCodes, settings);
        const service = window.globeInstance.dataService;
        const timeline = service.getAvailableDates?.(settings.selectedColumn || service.currentColumn) || [...new Set(countries.flatMap(country => country.dates))].sort();
        return countries.map(country => ChartFactory.applySettings(country, { ...settings, timeline }));
    },
    createCombinedChart(container, countryCodes, chartType = 'line', settings = {}) {
        container.replaceChildren(); const countries = this.prepare(countryCodes, settings);
        if (!countries.length) return ChartFactory.showError(container, 'No observations available for the selected countries.');
        if (!['line', 'bar'].includes(chartType)) return ChartFactory.showError(container, 'Choose a line or bar chart.');
        const first = countries[0];
        ChartFactory.renderCartesian(container, first.dates, countries.map(country => ({
            key: country.countryCode, label: country.countryName, color: ChartFactory.countryColor(country.countryCode), values: country.series[first.column], missingReasons: country.missingReasons
        })), chartType, { title: `${first.metric.label} by country`, unitLabel: ChartFactory.unitLabel(first.column, first.unit), metric: first.metric, smoothing: first.smoothing });
    }
};
