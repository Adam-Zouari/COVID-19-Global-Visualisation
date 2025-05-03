// Multi-Country Chart Implementation

// Extend ChartFactory with multi-country chart capabilities
ChartFactory.createMultiCountryChart = function(container, countryCodes, vizType, settings) {
    // Clear the container
    container.innerHTML = '';

    // Add loading state
    this.showLoading(container);

    // Prepare data for all countries
    const countriesData = countryCodes.map(countryCode => {
        return {
            code: countryCode,
            name: window.globeInstance.dataService.getCountryName(countryCode),
            data: this.prepareDataForCountry(countryCode)
        };
    }).filter(item => item.data !== null);

    if (countriesData.length === 0) {
        this.showError(container, "No data available for the selected countries");
        return;
    }

    // Initialize chart controls if not provided
    if (!settings) {
        // Initialize chart controls and get initial settings
        settings = ChartControls.initialize(container, countryCodes[0], vizType);
    }

    // Apply settings to filter data for each country
    const filteredData = countriesData.map(country => {
        return {
            code: country.code,
            name: country.name,
            data: this.applySettings(country.data, settings)
        };
    });

    // Clear loading indicator
    container.innerHTML = '';

    // Create the appropriate chart
    switch (vizType) {
        case 'bar':
            this.multiCountryBarChart(container, filteredData);
            break;
        case 'line':
            this.multiCountryLineChart(container, filteredData);
            break;
        case 'pie':
            // Pie charts don't make sense for multiple countries, so we'll create a bar chart instead
            this.multiCountryBarChart(container, filteredData);
            break;
        case 'radar':
            // Radar charts are complex for multiple countries, so we'll create a bar chart instead
            this.multiCountryBarChart(container, filteredData);
            break;
        case 'heatmap':
            // Heatmaps don't make sense for multiple countries, so we'll create a line chart instead
            this.multiCountryLineChart(container, filteredData);
            break;
        default:
            this.showError(container, `Chart type "${vizType}" not supported for multiple countries`);
    }
};

// Multi-country bar chart implementation
ChartFactory.multiCountryBarChart = function(container, countriesData) {
    // Create SVG element
    const margin = { top: 50, right: 150, bottom: 80, left: 80 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;

    // Create SVG
    const svg = d3.select(container)
        .append('svg')
        .attr('width', container.clientWidth)
        .attr('height', container.clientHeight)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add title
    svg.append('text')
        .attr('class', 'chart-title')
        .attr('x', width / 2)
        .attr('y', -25)
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .style('fill', 'white')
        .text('Country Comparison - Latest Data');

    // Get the current dataset and column
    const dataService = window.globeInstance.dataService;
    const currentDataset = dataService.currentDataset;
    const currentColumn = dataService.currentColumn;

    // Prepare data for the chart
    const chartData = countriesData.map(country => {
        // Get the latest date with data
        const latestDate = country.data.dates[country.data.dates.length - 1];

        // Get the value for the current column
        const value = country.data.series[currentColumn] ? 
            country.data.series[currentColumn][country.data.series[currentColumn].length - 1] : 0;

        return {
            country: country.name,
            value: value || 0
        };
    });

    // Sort data by value
    chartData.sort((a, b) => b.value - a.value);

    // Create scales
    const x = d3.scaleBand()
        .domain(chartData.map(d => d.country))
        .range([0, width])
        .padding(0.2);

    const y = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.value) * 1.1])
        .range([height, 0]);

    // Create axes
    const xAxis = d3.axisBottom(x)
        .tickSize(0);

    const yAxis = d3.axisLeft(y)
        .ticks(5)
        .tickFormat(d => this.formatTickValue(d));

    // Add x-axis
    svg.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis)
        .selectAll('text')
        .style('text-anchor', 'end')
        .attr('dx', '-.8em')
        .attr('dy', '.15em')
        .attr('transform', 'rotate(-45)')
        .style('fill', 'white');

    // Add y-axis
    svg.append('g')
        .attr('class', 'y-axis')
        .call(yAxis)
        .selectAll('text')
        .style('fill', 'white');

    // Add y-axis label
    svg.append('text')
        .attr('class', 'y-axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('y', -60)
        .attr('x', -height / 2)
        .attr('text-anchor', 'middle')
        .style('fill', 'white')
        .text(currentColumn.replace(/_/g, ' '));

    // Color scale for countries
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    // Add bars
    svg.selectAll('.bar')
        .data(chartData)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.country))
        .attr('width', x.bandwidth())
        .attr('y', d => y(d.value))
        .attr('height', d => height - y(d.value))
        .attr('fill', (d, i) => colorScale(i))
        .attr('rx', 2)
        .attr('ry', 2);

    // Add value labels
    svg.selectAll('.value-label')
        .data(chartData)
        .enter()
        .append('text')
        .attr('class', 'value-label')
        .attr('x', d => x(d.country) + x.bandwidth() / 2)
        .attr('y', d => y(d.value) - 5)
        .attr('text-anchor', 'middle')
        .style('fill', 'white')
        .style('font-size', '12px')
        .text(d => this.formatValue(d.value));
};

// Multi-country line chart implementation
ChartFactory.multiCountryLineChart = function(container, countriesData) {
    // Create SVG element
    const margin = { top: 50, right: 150, bottom: 80, left: 80 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;

    // Create SVG
    const svg = d3.select(container)
        .append('svg')
        .attr('width', container.clientWidth)
        .attr('height', container.clientHeight)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add title
    svg.append('text')
        .attr('class', 'chart-title')
        .attr('x', width / 2)
        .attr('y', -25)
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .style('fill', 'white')
        .text('Country Comparison - Trends Over Time');

    // Get the current dataset and column
    const dataService = window.globeInstance.dataService;
    const currentDataset = dataService.currentDataset;
    const currentColumn = dataService.currentColumn;

    // Find the common date range
    let allDates = new Set();
    countriesData.forEach(country => {
        country.data.dates.forEach(date => allDates.add(date));
    });

    // Convert to array and sort
    allDates = Array.from(allDates).sort();

    // Create scales
    const x = d3.scaleTime()
        .domain([new Date(allDates[0]), new Date(allDates[allDates.length - 1])])
        .range([0, width]);

    // Find the maximum value across all countries
    let maxValue = 0;
    countriesData.forEach(country => {
        const values = country.data.series[currentColumn] || [];
        const countryMax = d3.max(values) || 0;
        maxValue = Math.max(maxValue, countryMax);
    });

    const y = d3.scaleLinear()
        .domain([0, maxValue * 1.1])
        .range([height, 0]);

    // Create axes
    const xAxis = d3.axisBottom(x)
        .ticks(5)
        .tickFormat(d3.timeFormat('%b %Y'));

    const yAxis = d3.axisLeft(y)
        .ticks(5)
        .tickFormat(d => this.formatTickValue(d));

    // Add x-axis
    svg.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis)
        .selectAll('text')
        .style('fill', 'white');

    // Add y-axis
    svg.append('g')
        .attr('class', 'y-axis')
        .call(yAxis)
        .selectAll('text')
        .style('fill', 'white');

    // Add y-axis label
    svg.append('text')
        .attr('class', 'y-axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('y', -60)
        .attr('x', -height / 2)
        .attr('text-anchor', 'middle')
        .style('fill', 'white')
        .text(currentColumn.replace(/_/g, ' '));

    // Color scale for countries
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    // Create line generator
    const line = d3.line()
        .defined(d => d.value !== null && d.value !== undefined)
        .x(d => x(new Date(d.date)))
        .y(d => y(d.value))
        .curve(d3.curveMonotoneX);

    // Add lines for each country
    countriesData.forEach((country, i) => {
        // Prepare data for this country
        const countryData = country.data.dates.map((date, j) => {
            return {
                date: date,
                value: country.data.series[currentColumn] ? country.data.series[currentColumn][j] : null
            };
        }).filter(d => d.value !== null && d.value !== undefined);

        // Add the line
        svg.append('path')
            .datum(countryData)
            .attr('class', 'line')
            .attr('d', line)
            .attr('fill', 'none')
            .attr('stroke', colorScale(i))
            .attr('stroke-width', 2);

        // Add dots for data points
        svg.selectAll(`.dot-${i}`)
            .data(countryData)
            .enter()
            .append('circle')
            .attr('class', `dot-${i}`)
            .attr('cx', d => x(new Date(d.date)))
            .attr('cy', d => y(d.value))
            .attr('r', 3)
            .attr('fill', colorScale(i));
    });

    // Add legend
    const legend = svg.append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(${width + 20}, 0)`);

    countriesData.forEach((country, i) => {
        const legendItem = legend.append('g')
            .attr('transform', `translate(0, ${i * 25})`);

        legendItem.append('rect')
            .attr('width', 15)
            .attr('height', 15)
            .attr('fill', colorScale(i));

        legendItem.append('text')
            .attr('x', 25)
            .attr('y', 12)
            .style('fill', 'white')
            .text(country.name);
    });
};
