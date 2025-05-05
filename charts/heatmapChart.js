// Heat Map Implementation
ChartFactory.heatmapChart = function(container, data) {
    const margin = { top: 50, right: 100, bottom: 80, left: 80 };

    // Determine if we're in compare mode with separate charts
    const isCompareModeSeparate = container.closest('.country-chart-container') !== null;

    // Adjust dimensions based on whether we're in compare mode
    let width, height;

    if (isCompareModeSeparate) {
        // Use 90% of the container dimensions for a smaller chart
        width = (container.clientWidth * 0.9) - margin.left - margin.right;
        height = (container.clientHeight * 0.9) - margin.top - margin.bottom;
    } else {
        width = container.clientWidth - margin.left - margin.right;
        height = container.clientHeight - margin.top - margin.bottom;
    }

    // Create SVG using the helper method
    const svg = ChartFactory.createSmallerSVG(container, margin.left, margin.top);

    // No title

    // Get all metrics for the legend
    const allMetrics = [];

    // Get all metrics with sufficient data
    Object.keys(data.series).forEach(column => {
        const values = data.series[column].filter(v => v !== null && v !== undefined);
        const isSelected = data.columnSelectionState[column] !== false;

        // Add to allMetrics if it has sufficient data
        if (values.length > data.dates.length * 0.3) {
            allMetrics.push({
                name: column,
                isSelected: isSelected
            });
        }
    });

    // Select metrics with sufficient data and that are selected
    const metrics = Object.keys(data.series).filter(column => {
        // Check if this column is selected
        const isSelected = data.columnSelectionState[column] !== false;

        // Only include selected columns with sufficient data
        if (isSelected) {
            const values = data.series[column].filter(v => v !== null && v !== undefined);
            return values.length > data.dates.length * 0.3; // At least 30% of dates have data
        }
        return false;
    });

    // Check if we have enough data for the heatmap
    const hasEnoughData = metrics.length >= 2 && data.dates.length >= 3;

    // If not enough data, show error but continue to draw the legend
    if (!hasEnoughData) {
        this.showError(container, "Not enough data for heat map visualization");
    }

    // Only draw the heatmap if we have enough data
    let colorScale;
    let legendHeight = 150;

    if (hasEnoughData) {
        // Limit to most recent dates for readability
        const maxDates = Math.min(20, data.dates.length);
        const selectedDates = data.dates.slice(-maxDates);
        const selectedDisplayDates = data.displayDates.slice(-maxDates);

        // Prepare data for heatmap
        const heatmapData = [];
        for (let i = 0; i < selectedDates.length; i++) {
            for (let j = 0; j < metrics.length; j++) {
                const metric = metrics[j];
                const value = data.series[metric][data.dates.length - maxDates + i];

                if (value !== null && value !== undefined) {
                    heatmapData.push({
                        date: selectedDates[i],
                        displayDate: selectedDisplayDates[i],
                        metric: metric,
                        value: value,
                        row: j,
                        col: i
                    });
                }
            }
        }

        // Check if we have valid data points
        if (heatmapData.length === 0) {
            this.showError(container, "No valid data for heat map visualization");
        } else {
            // Calculate cell size
            const cellHeight = Math.min(40, height / metrics.length);
            const cellWidth = Math.min(40, width / selectedDates.length);

            // X scale for dates
            const x = d3.scaleBand()
                .domain(selectedDates)
                .range([0, cellWidth * selectedDates.length])
                .padding(0.05);

            // Y scale for metrics
            const y = d3.scaleBand()
                .domain(metrics)
                .range([0, cellHeight * metrics.length])
                .padding(0.05);

            // Color scale for values
            const maxValue = d3.max(heatmapData, d => d.value);
            colorScale = d3.scaleSequential(d3.interpolateInferno)
                .domain([0, maxValue]);

            // Add X axis
            svg.append('g')
                .attr('transform', `translate(0,${cellHeight * metrics.length})`)
                .call(d3.axisBottom(x)
                    .tickFormat((_, i) => i % 2 === 0 ? selectedDisplayDates[i] : ''))
                .selectAll('text')
                .attr('transform', 'translate(-10,5)rotate(-45)')
                .style('text-anchor', 'end')
                .style('fill', 'white')
                .style('font-size', '10px');

            // Add Y axis
            svg.append('g')
                .call(d3.axisLeft(y))
                .selectAll('text')
                .style('fill', 'white')
                .style('font-size', '10px');

            // Draw heat map cells
            svg.selectAll('.heat-cell')
                .data(heatmapData)
                .enter()
                .append('rect')
                .attr('class', 'heat-cell')
                .attr('x', d => x(d.date))
                .attr('y', d => y(d.metric))
                .attr('width', x.bandwidth())
                .attr('height', y.bandwidth())
                .attr('fill', d => d.value === null ? '#222' : colorScale(d.value))
                .attr('stroke', '#1a1a1a')
                .attr('stroke-width', 1)
                .on('mouseover', (event, d) => {
                    // Highlight cell
                    d3.select(event.currentTarget)
                        .attr('stroke', '#ffffff')
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
                        <div><strong>${d.metric}</strong></div>
                        <div>Date: ${d.displayDate}</div>
                        <div>Value: ${ChartFactory.formatValue(d.value)}</div>
                    `);

                    // Position tooltip
                    const tooltipNode = tooltip.node();
                    const eventPos = d3.pointer(event, container);

                    tooltip
                        .style('left', `${eventPos[0]}px`)
                        .style('top', `${eventPos[1] - tooltipNode.offsetHeight - 10}px`);
                })
                .on('mouseout', (event) => {
                    // Reset cell
                    d3.select(event.currentTarget)
                        .attr('stroke', '#1a1a1a')
                        .attr('stroke-width', 1);

                    // Remove tooltip
                    d3.select(container).selectAll('.chart-tooltip').remove();
                });

            // Add color legend
            const legendWidth = 20;

            // Create gradient for legend
            const defs = svg.append('defs');
            const linearGradient = defs.append('linearGradient')
                .attr('id', 'heatmap-gradient')
                .attr('x1', '0%')
                .attr('y1', '100%')
                .attr('x2', '0%')
                .attr('y2', '0%');

            // Add color stops
            linearGradient.append('stop')
                .attr('offset', '0%')
                .attr('stop-color', colorScale(0));

            linearGradient.append('stop')
                .attr('offset', '100%')
                .attr('stop-color', colorScale(maxValue));

            // Draw legend rectangle
            const legend = svg.append('g')
                .attr('transform', `translate(${width + 20}, 0)`);

            legend.append('rect')
                .attr('width', legendWidth)
                .attr('height', legendHeight)
                .style('fill', 'url(#heatmap-gradient)');

            // Add legend axis
            const legendScale = d3.scaleLinear()
                .domain([0, maxValue])
                .range([legendHeight, 0]);

            legend.append('g')
                .attr('transform', `translate(${legendWidth}, 0)`)
                .call(d3.axisRight(legendScale)
                    .ticks(5)
                    .tickFormat(d => ChartFactory.formatValue(d)))
                .selectAll('text')
                .style('fill', 'white')
                .style('font-size', '10px');

            // Add legend title
            legend.append('text')
                .attr('x', legendWidth / 2)
                .attr('y', -10)
                .attr('text-anchor', 'middle')
                .style('fill', 'white')
                .style('font-size', '12px')
                .text('Value');
        }
    } else {
        // If we don't have enough data, use a default color scale for the legend
        colorScale = d3.scaleOrdinal(d3.schemeCategory10);
    }

    // Add metrics legend with interactive toggle functionality
    const metricsLegend = svg.append('g')
        .attr('class', 'chart-legend')
        .attr('transform', `translate(${width + 20}, ${legendHeight + 30})`);

    // Color scale for consistency
    const metricsColorScale = d3.scaleOrdinal(d3.schemeCategory10);

    allMetrics.forEach((d, i) => {
        const legendItem = metricsLegend.append('g')
            .attr('transform', `translate(0, ${i * 20})`)
            .attr('class', 'legend-item')
            .style('cursor', 'pointer');

        // Add a background rectangle for better click target
        legendItem.append('rect')
            .attr('width', 100)
            .attr('height', 16)
            .attr('x', -5)
            .attr('y', -3)
            .attr('fill', 'transparent')
            .attr('class', 'legend-hitbox');

        // Color indicator
        const colorRect = legendItem.append('rect')
            .attr('width', 12)
            .attr('height', 12)
            .attr('rx', 2)
            .attr('fill', metricsColorScale(d.name))
            .attr('class', 'legend-color')
            .style('opacity', d.isSelected ? 1 : 0.3);

        // Label
        const legendText = legendItem.append('text')
            .attr('x', 20)
            .attr('y', 9)
            .style('font-size', '11px')
            .style('fill', 'white')
            .style('opacity', d.isSelected ? 1 : 0.3)
            .text(d.name);

        // Add click handler for toggling
        legendItem.on('click', function() {
            // Get current state from ChartControls
            const currentState = ChartControls.state.selectedColumns;

            // Toggle this column
            currentState[d.name] = !currentState[d.name];

            // Update visual state
            if (!currentState[d.name]) {
                // Series is now hidden
                colorRect.style('opacity', 0.3);
                legendText.style('opacity', 0.3);
            } else {
                // Series is now visible
                colorRect.style('opacity', 1);
                legendText.style('opacity', 1);
            }

            // Redraw chart with new settings
            ChartFactory.createChart(
                container,
                data.countryCode,
                'heatmap',
                ChartControls.getSettings()
            );
        });
    });
};
