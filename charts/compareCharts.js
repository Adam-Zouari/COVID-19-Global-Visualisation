// Compare Charts - Extensions to the Chart Factory for comparison charts
const CompareCharts = {
    // Create a combined chart with data from multiple countries
    createCombinedChart(container, countryCodes, chartType, settings) {
        // Clear the container
        container.innerHTML = '';

        // Add loading state
        container.innerHTML = '<div class="chart-loading">Loading chart data...</div>';

        // Prepare data for all countries
        const countriesData = this.prepareDataForCountries(countryCodes);

        if (!countriesData || countriesData.length === 0) {
            container.innerHTML = '<div class="chart-error">No data available for selected countries</div>';
            return;
        }

        // Remove loading state
        container.innerHTML = '';

        // Create column selector if we have data
        if (countriesData.length > 0) {
            this.createColumnSelector(container, countriesData, chartType, settings);
        }

        // Create the chart based on type
        switch (chartType) {
            case 'bar':
                this.createCombinedBarChart(container, countriesData, settings);
                break;
            case 'line':
                this.createCombinedLineChart(container, countriesData, settings);
                break;
            case 'pie':
                this.createCombinedPieChart(container, countriesData, settings);
                break;
            case 'radar':
                this.createCombinedRadarChart(container, countriesData, settings);
                break;
            case 'heatmap':
                this.createCombinedHeatmapChart(container, countriesData, settings);
                break;
            default:
                container.innerHTML = '<div class="chart-error">Unsupported chart type</div>';
        }
    },

    // Create column selector for combined charts
    createColumnSelector(container, countriesData, chartType, settings) {
        // Get available columns from the first country (they should be the same for all countries)
        const availableColumns = countriesData[0].columns;

        if (!availableColumns || availableColumns.length === 0) {
            return;
        }

        // Check if we already have a column selector in the compare options
        let columnSelector = document.getElementById('combined-chart-column-select');

        // If we don't have a column selector yet, create one and add it to the compare options
        if (!columnSelector) {
            // Find the controls row in the compare options
            const controlsRow = document.querySelector('.compare-options .controls-row');

            if (!controlsRow) {
                console.error("Controls row not found in compare panel");
                return;
            }

            // Create a container for the column selector
            const selectorContainer = document.createElement('div');
            selectorContainer.className = 'chart-type-selector';
            selectorContainer.id = 'data-column-selector';

            // Create a label
            const label = document.createElement('label');
            label.htmlFor = 'combined-chart-column-select';
            label.textContent = 'Data Column:';

            // Create the select element
            columnSelector = document.createElement('select');
            columnSelector.id = 'combined-chart-column-select';

            // Add options for each column
            availableColumns.forEach(column => {
                const option = document.createElement('option');
                option.value = column;
                option.textContent = column.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                columnSelector.appendChild(option);
            });

            // Add elements to container
            selectorContainer.appendChild(label);
            selectorContainer.appendChild(columnSelector);

            // Add the selector to the controls row
            controlsRow.appendChild(selectorContainer);
        } else {
            // Clear existing options
            columnSelector.innerHTML = '';

            // Add options for each column
            availableColumns.forEach(column => {
                const option = document.createElement('option');
                option.value = column;
                option.textContent = column.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                columnSelector.appendChild(option);
            });
        }

        // Set selected column if provided in settings
        if (settings && settings.selectedColumn) {
            // Find the option with the matching value
            const option = columnSelector.querySelector(`option[value="${settings.selectedColumn}"]`);
            if (option) {
                option.selected = true;
            }
        } else {
            // If no column is selected in settings, select the first one
            settings = settings || {};
            settings.selectedColumn = availableColumns[0];
        }

        // Add change event listener
        columnSelector.onchange = () => {
            // Update the settings
            settings.selectedColumn = columnSelector.value;

            // Update CompareMode state if available
            if (window.CompareMode) {
                window.CompareMode.updateSelectedColumn(columnSelector.value);
            } else {
                // Redraw the chart if CompareMode is not available
                this.createCombinedChart(container, countriesData.map(data => data.countryCode), chartType, settings);
            }
        };

        // Show the column selector only in combined mode
        const dataColumnSelector = document.getElementById('data-column-selector');
        if (dataColumnSelector) {
            dataColumnSelector.style.display = 'flex';
        }
    },

    // Prepare data for multiple countries
    prepareDataForCountries(countryCodes) {
        return countryCodes.map(countryCode => {
            return ChartFactory.prepareDataForCountry(countryCode);
        }).filter(data => data !== null);
    },

    // Create a combined bar chart
    createCombinedBarChart(container, countriesData, settings) {
        // Create SVG element
        const margin = { top: 50, right: 200, bottom: 80, left: 80 };
        const width = container.clientWidth - margin.left - margin.right;
        const height = container.clientHeight - margin.top - margin.bottom;

        // Create SVG
        const svg = d3.select(container)
            .append('svg')
            .attr('width', container.clientWidth)
            .attr('height', container.clientHeight)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // No title

        // Get common dates across all countries
        const commonDates = this.findCommonDates(countriesData);

        if (commonDates.length === 0) {
            container.innerHTML = '<div class="chart-error">No common dates found across selected countries</div>';
            return;
        }

        // Apply date range filter if provided
        let filteredDates = commonDates;
        if (settings && settings.dateRange) {
            const startIdx = Math.floor(commonDates.length * (settings.dateRange.start / 100));
            const endIdx = Math.floor(commonDates.length * (settings.dateRange.end / 100));
            filteredDates = commonDates.slice(startIdx, endIdx + 1);
        }

        // Format dates for display
        const displayDates = filteredDates.map(date => {
            return window.globeInstance.dataService.formatDate(date);
        });

        // Create x scale
        const x = d3.scaleBand()
            .domain(displayDates)
            .range([0, width])
            .padding(0.2);

        // Add X axis
        svg.append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x)
                .tickFormat((d, i) => {
                    // Show fewer ticks for readability
                    return i % Math.ceil(displayDates.length / 10) === 0 ? d : '';
                }))
            .selectAll('text')
            .style('text-anchor', 'end')
            .attr('dx', '-.8em')
            .attr('dy', '.15em')
            .attr('transform', 'rotate(-45)')
            .style('fill', 'white');

        // Get all values for Y scale
        const allValues = [];
        // Use the selected column from settings, or default to first column
        const selectedColumn = settings && settings.selectedColumn ? settings.selectedColumn : null;

        countriesData.forEach(countryData => {
            // Get the selected column or fall back to first column if not available
            const column = selectedColumn && countryData.series[selectedColumn] ?
                selectedColumn : Object.keys(countryData.series)[0];

            if (column) {
                const values = countryData.series[column];
                allValues.push(...values.filter(v => v !== null && v !== undefined));
            }
        });

        // Y scale with 10% padding at top
        const maxVal = d3.max(allValues) || 1;
        const y = d3.scaleLinear()
            .domain([0, maxVal * 1.1])
            .range([height, 0]);

        // Add Y axis
        svg.append('g')
            .attr('class', 'y-axis')
            .call(d3.axisLeft(y)
                .ticks(5)
                .tickFormat(d => ChartFactory.formatTickValue(d)))
            .selectAll('text')
            .style('fill', 'white');

        // Add grid lines
        svg.append('g')
            .attr('class', 'grid-lines')
            .selectAll('line')
            .data(y.ticks(5))
            .enter()
            .append('line')
            .attr('x1', 0)
            .attr('x2', width)
            .attr('y1', d => y(d))
            .attr('y2', d => y(d))
            .attr('stroke', 'rgba(255,255,255,0.1)')
            .attr('stroke-dasharray', '3,3');

        // Calculate bar width based on number of countries
        const barWidth = (x.bandwidth() * 0.8) / countriesData.length;

        // Color scale for countries
        const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

        // Draw bars for each country
        countriesData.forEach((countryData, countryIndex) => {
            // Get the selected column or fall back to first column if not available
            const column = selectedColumn && countryData.series[selectedColumn] ?
                selectedColumn : Object.keys(countryData.series)[0];
            if (!column) return;

            // Get values for this country
            const values = countryData.series[column];

            // Filter values to match filtered dates
            const filteredValues = [];
            filteredDates.forEach(date => {
                const dateIndex = countryData.dates.indexOf(date);
                if (dateIndex !== -1) {
                    filteredValues.push(values[dateIndex]);
                } else {
                    filteredValues.push(null);
                }
            });

            // Create a group for this country
            const countryGroup = svg.append('g')
                .attr('class', `country-${countryIndex}`);

            // Add bars
            countryGroup.selectAll('rect')
                .data(filteredValues)
                .enter()
                .append('rect')
                .attr('x', (d, i) => x(displayDates[i]) + (barWidth * countryIndex) + (x.bandwidth() * 0.1))
                .attr('y', d => d === null ? height : y(d))
                .attr('width', barWidth)
                .attr('height', d => d === null ? 0 : height - y(d))
                .attr('fill', colorScale(countryData.countryName))
                .attr('rx', 2) // Rounded corners
                .attr('opacity', 0.8)
                .on('mouseover', function(event, d) {
                    // Highlight on hover
                    d3.select(this)
                        .attr('opacity', 1)
                        .attr('stroke', 'white')
                        .attr('stroke-width', 1);

                    // Show tooltip
                    const i = filteredValues.indexOf(d);
                    const tooltip = d3.select(container).append('div')
                        .attr('class', 'chart-tooltip')
                        .style('position', 'absolute')
                        .style('background-color', 'rgba(0,0,0,0.9)')
                        .style('color', 'white')
                        .style('padding', '8px')
                        .style('border-radius', '4px')
                        .style('font-size', '12px')
                        .style('z-index', 100)
                        .style('pointer-events', 'none');

                    tooltip.html(`
                        <div><strong>${countryData.countryName}</strong></div>
                        <div>${displayDates[i]}</div>
                        <div>${column}: ${d !== null ? ChartFactory.formatValue(d) : 'No data'}</div>
                    `);

                    // Position tooltip
                    const tooltipNode = tooltip.node();
                    if (tooltipNode) {
                        const rect = event.target.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();

                        tooltip.style('left', `${rect.left - containerRect.left + rect.width / 2}px`)
                            .style('top', `${rect.top - containerRect.top - tooltipNode.offsetHeight - 10}px`);
                    }
                })
                .on('mouseout', function() {
                    // Remove highlight
                    d3.select(this)
                        .attr('opacity', 0.8)
                        .attr('stroke', 'none');

                    // Remove tooltip
                    d3.select(container).selectAll('.chart-tooltip').remove();
                });
        });

        // Add legend
        const legend = svg.append('g')
            .attr('class', 'legend')
            .attr('transform', `translate(${width + 20}, 0)`);

        countriesData.forEach((countryData, i) => {
            const legendItem = legend.append('g')
                .attr('transform', `translate(0, ${i * 25})`);

            legendItem.append('rect')
                .attr('width', 15)
                .attr('height', 15)
                .attr('fill', colorScale(countryData.countryName))
                .attr('rx', 2);

            legendItem.append('text')
                .attr('x', 25)
                .attr('y', 12)
                .style('fill', 'white')
                .style('font-size', '12px')
                .text(countryData.countryName);
        });
    },

    // Create a combined line chart
    createCombinedLineChart(container, countriesData, settings) {
        // Create SVG element
        const margin = { top: 50, right: 200, bottom: 80, left: 80 };
        const width = container.clientWidth - margin.left - margin.right;
        const height = container.clientHeight - margin.top - margin.bottom;

        // Create SVG
        const svg = d3.select(container)
            .append('svg')
            .attr('width', container.clientWidth)
            .attr('height', container.clientHeight)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // No title

        // Get common dates across all countries
        const commonDates = this.findCommonDates(countriesData);

        if (commonDates.length === 0) {
            container.innerHTML = '<div class="chart-error">No common dates found across selected countries</div>';
            return;
        }

        // Apply date range filter if provided
        let filteredDates = commonDates;
        if (settings && settings.dateRange) {
            const startIdx = Math.floor(commonDates.length * (settings.dateRange.start / 100));
            const endIdx = Math.floor(commonDates.length * (settings.dateRange.end / 100));
            filteredDates = commonDates.slice(startIdx, endIdx + 1);
        }

        // Create x scale (time scale for dates)
        const x = d3.scaleTime()
            .domain([new Date(filteredDates[0]), new Date(filteredDates[filteredDates.length - 1])])
            .range([0, width]);

        // Add X axis
        svg.append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x)
                .ticks(Math.min(filteredDates.length, 10))
                .tickFormat(d3.timeFormat('%b %d, %Y')))
            .selectAll('text')
            .style('text-anchor', 'end')
            .attr('dx', '-.8em')
            .attr('dy', '.15em')
            .attr('transform', 'rotate(-45)')
            .style('fill', 'white');

        // Get all values for Y scale
        const allValues = [];
        // Use the selected column from settings, or default to first column
        const selectedColumn = settings && settings.selectedColumn ? settings.selectedColumn : null;

        countriesData.forEach(countryData => {
            // Get the selected column or fall back to first column if not available
            const column = selectedColumn && countryData.series[selectedColumn] ?
                selectedColumn : Object.keys(countryData.series)[0];

            if (column) {
                const values = countryData.series[column];
                allValues.push(...values.filter(v => v !== null && v !== undefined));
            }
        });

        // Y scale with 10% padding at top
        const maxVal = d3.max(allValues) || 1;
        const y = d3.scaleLinear()
            .domain([0, maxVal * 1.1])
            .range([height, 0]);

        // Add Y axis
        svg.append('g')
            .attr('class', 'y-axis')
            .call(d3.axisLeft(y)
                .ticks(5)
                .tickFormat(d => ChartFactory.formatTickValue(d)))
            .selectAll('text')
            .style('fill', 'white');

        // Add grid lines
        svg.append('g')
            .attr('class', 'grid-lines')
            .selectAll('line')
            .data(y.ticks(5))
            .enter()
            .append('line')
            .attr('x1', 0)
            .attr('x2', width)
            .attr('y1', d => y(d))
            .attr('y2', d => y(d))
            .attr('stroke', 'rgba(255,255,255,0.1)')
            .attr('stroke-dasharray', '3,3');

        // Color scale for countries
        const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

        // Create line generator
        const line = d3.line()
            .defined(d => d.value !== null && d.value !== undefined)
            .x(d => x(new Date(d.date)))
            .y(d => y(d.value))
            .curve(d3.curveMonotoneX); // Smoother curve

        // Draw lines for each country
        countriesData.forEach((countryData, countryIndex) => {
            // Get the selected column or fall back to first column if not available
            const column = selectedColumn && countryData.series[selectedColumn] ?
                selectedColumn : Object.keys(countryData.series)[0];
            if (!column) return;

            // Get values for this country
            const values = countryData.series[column];

            // Create data points for the line
            const lineData = [];
            filteredDates.forEach((date, i) => {
                const dateIndex = countryData.dates.indexOf(date);
                if (dateIndex !== -1) {
                    lineData.push({
                        date: date,
                        value: values[dateIndex]
                    });
                }
            });

            // Skip if no valid data
            if (!lineData.some(d => d.value !== null && d.value !== undefined)) {
                return;
            }

            // Add the line
            svg.append('path')
                .datum(lineData)
                .attr('class', `line-${countryIndex}`)
                .attr('fill', 'none')
                .attr('stroke', colorScale(countryData.countryName))
                .attr('stroke-width', 2)
                .attr('d', line);

            // Add data points
            svg.selectAll(`.point-${countryIndex}`)
                .data(lineData.filter(d => d.value !== null && d.value !== undefined))
                .enter()
                .append('circle')
                .attr('class', `point-${countryIndex}`)
                .attr('cx', d => x(new Date(d.date)))
                .attr('cy', d => y(d.value))
                .attr('r', 4)
                .attr('fill', colorScale(countryData.countryName))
                .attr('stroke', '#1a1a1a')
                .attr('stroke-width', 1)
                .on('mouseover', function(event, d) {
                    // Highlight point
                    d3.select(this)
                        .attr('r', 6)
                        .attr('stroke', 'white')
                        .attr('stroke-width', 2);

                    // Show tooltip
                    const tooltip = d3.select(container).append('div')
                        .attr('class', 'chart-tooltip')
                        .style('position', 'absolute')
                        .style('background-color', 'rgba(0,0,0,0.9)')
                        .style('color', 'white')
                        .style('padding', '8px')
                        .style('border-radius', '4px')
                        .style('font-size', '12px')
                        .style('z-index', 100)
                        .style('pointer-events', 'none');

                    tooltip.html(`
                        <div><strong>${countryData.countryName}</strong></div>
                        <div>${window.globeInstance.dataService.formatDate(d.date)}</div>
                        <div>${column}: ${d.value !== null ? ChartFactory.formatValue(d.value) : 'No data'}</div>
                    `);

                    // Position tooltip
                    const tooltipNode = tooltip.node();
                    if (tooltipNode) {
                        const rect = event.target.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();

                        tooltip.style('left', `${rect.left - containerRect.left + rect.width / 2}px`)
                            .style('top', `${rect.top - containerRect.top - tooltipNode.offsetHeight - 10}px`);
                    }
                })
                .on('mouseout', function() {
                    // Remove highlight
                    d3.select(this)
                        .attr('r', 4)
                        .attr('stroke', '#1a1a1a')
                        .attr('stroke-width', 1);

                    // Remove tooltip
                    d3.select(container).selectAll('.chart-tooltip').remove();
                });
        });

        // Add legend
        const legend = svg.append('g')
            .attr('class', 'legend')
            .attr('transform', `translate(${width + 20}, 0)`);

        countriesData.forEach((countryData, i) => {
            const legendItem = legend.append('g')
                .attr('transform', `translate(0, ${i * 25})`);

            legendItem.append('line')
                .attr('x1', 0)
                .attr('y1', 7.5)
                .attr('x2', 15)
                .attr('y2', 7.5)
                .attr('stroke', colorScale(countryData.countryName))
                .attr('stroke-width', 2);

            legendItem.append('text')
                .attr('x', 25)
                .attr('y', 12)
                .style('fill', 'white')
                .style('font-size', '12px')
                .text(countryData.countryName);
        });
    },

    // Create a combined pie chart (simplified implementation)
    createCombinedPieChart(container, countriesData, settings) {
        // For pie charts, we'll show the latest data point for each country
        container.innerHTML = '<div class="chart-message">Pie charts are not ideal for country comparisons. Please select a different chart type.</div>';
    },

    // Create a combined radar chart (simplified implementation)
    createCombinedRadarChart(container, countriesData, settings) {
        // For radar charts, we'll show the latest data point for each country
        container.innerHTML = '<div class="chart-message">Radar charts are not ideal for country comparisons. Please select a different chart type.</div>';
    },

    // Create a combined heatmap chart (simplified implementation)
    createCombinedHeatmapChart(container, countriesData, settings) {
        // For heatmaps, we'll show a message that it's not ideal for comparisons
        container.innerHTML = '<div class="chart-message">Heatmap charts are not ideal for country comparisons. Please select a different chart type.</div>';
    },

    // Find common dates across all country datasets
    findCommonDates(countriesData) {
        if (countriesData.length === 0) return [];

        // Start with all dates from the first country
        let commonDates = [...countriesData[0].dates];

        // Intersect with dates from each other country
        for (let i = 1; i < countriesData.length; i++) {
            const countryDates = countriesData[i].dates;
            commonDates = commonDates.filter(date => countryDates.includes(date));
        }

        return commonDates;
    }
};
