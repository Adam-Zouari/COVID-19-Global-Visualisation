// Radar Chart Implementation
ChartFactory.radarChart = function(container, data) {
    // If data contains both filtered and full, use them accordingly
    let filtered = data.filtered ? data.filtered : data;
    let full = data.full ? data.full : data;

    // Determine if we're in compare mode with separate charts
    console.log("Radar chart data:", filtered, full);
    const isCompareModeSeparate = container.closest('.country-chart-container') !== null;

    let width, height, radius;

    if (isCompareModeSeparate) {
        // Use 90% of the container dimensions for a smaller chart
        width = container.clientWidth * 0.9;
        height = container.clientHeight * 0.9;
        radius = Math.min(width, height) / 2 * 0.6;
    } else {
        width = container.clientWidth;
        height = container.clientHeight;
        radius = Math.min(width, height) / 2 * 0.7;
    }

    // Create SVG with the helper method
    let svg;

    if (isCompareModeSeparate) {
        // For radar charts, we need to center the chart in the SVG
        svg = ChartFactory.createSmallerSVG(container)
            .append('g')
            .attr('transform', `translate(${width/2},${height/2})`);
    } else {
        // Regular SVG creation for non-compare mode
        svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .append('g')
            .attr('transform', `translate(${width/2},${height/2})`);
    }

    // No title

    // Use filtered for value lookups, full for scale
    let dateIndex = 0;
    if (filtered.displayDates && filtered.displayDates.length === 1 && filtered.dates.length > 0) {
        const selectedDate = filtered.dates[0];
        dateIndex = full.dates.indexOf(selectedDate);
        if (dateIndex === -1) dateIndex = 0;
    } else if (filtered.displayDates && filtered.displayDates.length > 1) {
        // Use the last date (or the one corresponding to the slider)
        dateIndex = filtered.displayDates.length - 1;
    }

    // Compute max for each metric across all dates (for scale)
    const metricMax = {};
    Object.keys(full.series).forEach(column => {
        // Ignore null/undefined values
        metricMax[column] = d3.max(full.series[column].filter(v => v !== null && v !== undefined));
    });

    // Get all metrics for the legend
    const allMetrics = [];

    // Get the metrics (columns) that have data
    Object.keys(filtered.series).forEach(column => {
        const value = filtered.series[column][0];
        const isSelected = filtered.columnSelectionState[column] !== false;

        // Add to allMetrics if it has valid data
        if (value !== null && value !== undefined && value > 0) {
            allMetrics.push({
                name: column,
                value: value,
                isSelected: isSelected
            });
        }
    });

    // Get selected metrics for the chart
    const metrics = Object.keys(filtered.series).filter(column => {
        // Check if this column is selected
        const isSelected = filtered.columnSelectionState[column] !== false;

        // Only include selected columns with valid data
        if (isSelected) {
            const value = filtered.series[column][0];
            return value !== null && value !== undefined && value > 0;
        }
        return false;
    });

    // Check if we have enough metrics for the radar chart
    const hasEnoughMetrics = metrics.length >= 3;

    // If not enough metrics, show error but continue to draw the legend
    if (!hasEnoughMetrics) {
        this.showError(container, "Radar chart requires at least 3 data points");
    }

    // Only draw the radar chart if we have enough metrics
    if (hasEnoughMetrics) {
        // Get normalized values for each metric
        const values = metrics.map(metric => ({
            metric: metric,
            value: filtered.series[metric][0] / (metricMax[metric] || 1) // Avoid division by zero
        }));

        // Calculate angles for each metric
        const angleStep = (Math.PI * 2) / metrics.length;

        // Scale for normalized data values [0, 1]
        const rScale = d3.scaleLinear()
            .domain([0, 1])
            .range([0, radius]);

        // Draw radar background circles and labels
        const levels = 5;
        const levelStep = 1 / levels;

        // Draw circular grid lines
        for (let level = 1; level <= levels; level++) {
            const levelValue = levelStep * level;
            const levelRadius = rScale(levelValue);

            // Draw circle
            svg.append('circle')
                .attr('cx', 0)
                .attr('cy', 0)
                .attr('r', levelRadius)
                .attr('fill', 'none')
                .attr('stroke', 'rgba(255,255,255,0.1)')
                .attr('stroke-dasharray', '3,3');

            // Add value label to the right side (show as percentage)
            svg.append('text')
                .attr('x', 5)
                .attr('y', -levelRadius + 4)
                .style('font-size', '10px')
                .style('fill', 'rgba(255,255,255,0.6)')
                .text(`${Math.round(levelValue * 100)}%`);
        }

        // Draw axes and labels
        metrics.forEach((metric, i) => {
            const angle = i * angleStep - Math.PI / 2; // Start from top (- PI/2)
            const lineEndX = radius * Math.cos(angle);
            const lineEndY = radius * Math.sin(angle);

            // Draw axis line
            svg.append('line')
                .attr('x1', 0)
                .attr('y1', 0)
                .attr('x2', lineEndX)
                .attr('y2', lineEndY)
                .attr('stroke', 'rgba(255,255,255,0.3)')
                .attr('stroke-width', 1);

            // Add axis label with proper positioning
            const labelDistance = radius * 1.15; // Place label slightly outside the radar
            const labelX = labelDistance * Math.cos(angle);
            const labelY = labelDistance * Math.sin(angle);

            // Handle text anchor based on angle position
            let textAnchor = 'middle';
            if (angle > -Math.PI/4 && angle < Math.PI/4) textAnchor = 'start';
            else if (angle > Math.PI*3/4 || angle < -Math.PI*3/4) textAnchor = 'end';

            svg.append('text')
                .attr('x', labelX)
                .attr('y', labelY)
                .attr('text-anchor', textAnchor)
                .attr('dy', '0.3em')
                .style('font-size', '11px')
                .style('fill', 'white')
                .text(metric);
        });

        // Create radar path points (normalized)
        const radarPoints = values.map((d, i) => {
            const angle = i * angleStep - Math.PI / 2;
            const r = rScale(d.value);
            return {
                x: r * Math.cos(angle),
                y: r * Math.sin(angle),
                value: d.value,
                metric: d.metric,
                originalValue: filtered.series[d.metric][0]
            };
        });

        // Draw radar path
        const radarLine = d3.line()
            .x(d => d.x)
            .y(d => d.y)
            .curve(d3.curveLinearClosed);

        svg.append('path')
            .datum(radarPoints)
            .attr('d', radarLine)
            .attr('fill', '#8b0000')
            .attr('fill-opacity', 0.3)
            .attr('stroke', '#ff4136')
            .attr('stroke-width', 2);

        // Add data points with tooltips
        svg.selectAll('.radar-point')
            .data(radarPoints)
            .enter()
            .append('circle')
            .attr('class', 'radar-point')
            .attr('cx', d => d.x)
            .attr('cy', d => d.y)
            .attr('r', 5)
            .attr('fill', '#ff4136')
            .on('mouseover', (event, d) => {
                // Highlight point
                d3.select(event.currentTarget)
                    .attr('r', 7)
                    .attr('stroke', 'white');

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
                    <div>Value: ${ChartFactory.formatValue(d.originalValue)}</div>
                    <div>Normalized: ${(d.value * 100).toFixed(1)}%</div>
                    <div>Date: ${filtered.displayDates[dateIndex]}</div>
                `);

                // Position tooltip
                const tooltipNode = tooltip.node();
                const eventPos = d3.pointer(event, container);

                tooltip
                    .style('left', `${eventPos[0]}px`)
                    .style('top', `${eventPos[1] - tooltipNode.offsetHeight - 10}px`);
            })
            .on('mouseout', (event) => {
                // Reset point
                d3.select(event.currentTarget)
                    .attr('r', 5)
                    .attr('stroke', null);

                // Remove tooltip
                d3.select(container).selectAll('.chart-tooltip').remove();
            });

        // Add date info
        svg.append('text')
            .attr('class', 'date-info')
            .attr('text-anchor', 'middle')
            .attr('x', 0)
            .attr('y', height/2 - 10) // Lower the date text a bit
            .style('font-size', '13px')
            .style('fill', 'rgba(255,255,255,0.7)')
            .text(`Date: ${filtered.displayDates && filtered.displayDates[0] ? filtered.displayDates[0] : ''}`);
    }

    // Add legend with interactive toggle functionality
    const legend = svg.append('g')
        .attr('class', 'chart-legend')
        .attr('transform', `translate(${radius + 20}, ${-radius + 20})`);

    // Color scale for consistency
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    allMetrics.forEach((d, i) => {
        const legendItem = legend.append('g')
            .attr('transform', `translate(0, ${i * 20})`)
            .attr('class', 'legend-item')
            .style('cursor', 'pointer');

        // Add a background rectangle for better click target
        legendItem.append('rect')
            .attr('width', radius * 0.8)
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
            .attr('fill', colorScale(d.name))
            .attr('class', 'legend-color legend-rect') // Add additional class for selection
            .style('opacity', d.isSelected ? 1 : 0.3);

        // Label
        const legendText = legendItem.append('text')
            .attr('class', 'legend-text') // Add class for selection
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

            // Instead of redrawing the entire chart, update the existing chart
            // Get selected metrics for the chart based on updated selection
            const updatedMetrics = Object.keys(filtered.series).filter(column => {
                // Check if this column is selected
                const isSelected = currentState[column] !== false;

                // Only include selected columns with valid data
                if (isSelected) {
                    const value = filtered.series[column][0];
                    return value !== null && value !== undefined && value > 0;
                }
                return false;
            });

            // Check if we have enough metrics for the radar chart
            const hasEnoughMetrics = updatedMetrics.length >= 3;

            // If not enough metrics, show error but don't redraw the chart
            if (!hasEnoughMetrics) {
                ChartFactory.showError(container, "Radar chart requires at least 3 data points");
                return;
            }

            // Remove the error message if it exists
            const existingError = container.querySelector('.chart-error');
            if (existingError) {
                existingError.remove();
            }

            // Get normalized values for each metric
            const updatedValues = updatedMetrics.map(metric => ({
                metric: metric,
                value: filtered.series[metric][0] / (metricMax[metric] || 1) // Avoid division by zero
            }));

            // Calculate angles for each metric
            const angleStep = (Math.PI * 2) / updatedMetrics.length;

            // Scale for normalized data values [0, 1]
            const rScale = d3.scaleLinear()
                .domain([0, 1])
                .range([0, radius]);

            // Create radar path points (normalized)
            const updatedRadarPoints = updatedValues.map((d, i) => {
                const angle = i * angleStep - Math.PI / 2;
                const r = rScale(d.value);
                return {
                    x: r * Math.cos(angle),
                    y: r * Math.sin(angle),
                    value: d.value,
                    metric: d.metric,
                    originalValue: filtered.series[d.metric][0]
                };
            });

            // Update the radar path
            const radarLine = d3.line()
                .x(d => d.x)
                .y(d => d.y)
                .curve(d3.curveLinearClosed);

            // Update the existing path
            svg.select('path')
                .datum(updatedRadarPoints)
                .attr('d', radarLine);

            // Remove existing points and axes, but be more selective about what we remove

            // First, save the legend group so we don't lose it
            const legendGroup = svg.select('.chart-legend');

            // Remove radar points
            svg.selectAll('.radar-point').remove();

            // Remove axis lines and grid circles, but not legend elements
            svg.selectAll('line').filter(function() {
                // Keep lines that are part of the legend
                return !d3.select(this).classed('legend-line') &&
                       !this.parentNode.classList.contains('legend-item') &&
                       !this.closest('.chart-legend');
            }).remove();

            svg.selectAll('circle').filter(function() {
                // Keep circles that are part of the legend
                return !d3.select(this).classed('legend-circle') &&
                       !this.parentNode.classList.contains('legend-item') &&
                       !this.closest('.chart-legend');
            }).remove();

            // Remove text elements except legend text
            svg.selectAll('text').filter(function() {
                // Keep text that is part of the legend
                return !d3.select(this).classed('legend-text') &&
                       !this.parentNode.classList.contains('legend-item') &&
                       !this.closest('.chart-legend');
            }).remove();

            // Redraw circular grid lines
            const levels = 5;
            const levelStep = 1 / levels;

            // Draw circular grid lines
            for (let level = 1; level <= levels; level++) {
                const levelValue = levelStep * level;
                const levelRadius = rScale(levelValue);

                // Draw circle
                svg.append('circle')
                    .attr('cx', 0)
                    .attr('cy', 0)
                    .attr('r', levelRadius)
                    .attr('fill', 'none')
                    .attr('stroke', 'rgba(255,255,255,0.1)')
                    .attr('stroke-dasharray', '3,3');

                // Add value label to the right side (show as percentage)
                svg.append('text')
                    .attr('x', 5)
                    .attr('y', -levelRadius + 4)
                    .style('font-size', '10px')
                    .style('fill', 'rgba(255,255,255,0.6)')
                    .text(`${Math.round(levelValue * 100)}%`);
            }

            // Draw axes and labels
            updatedMetrics.forEach((metric, i) => {
                const angle = i * angleStep - Math.PI / 2; // Start from top (- PI/2)
                const lineEndX = radius * Math.cos(angle);
                const lineEndY = radius * Math.sin(angle);

                // Draw axis line
                svg.append('line')
                    .attr('x1', 0)
                    .attr('y1', 0)
                    .attr('x2', lineEndX)
                    .attr('y2', lineEndY)
                    .attr('stroke', 'rgba(255,255,255,0.3)')
                    .attr('stroke-width', 1);

                // Add axis label with proper positioning
                const labelDistance = radius * 1.15; // Place label slightly outside the radar
                const labelX = labelDistance * Math.cos(angle);
                const labelY = labelDistance * Math.sin(angle);

                // Handle text anchor based on angle position
                let textAnchor = 'middle';
                if (angle > -Math.PI/4 && angle < Math.PI/4) textAnchor = 'start';
                else if (angle > Math.PI*3/4 || angle < -Math.PI*3/4) textAnchor = 'end';

                svg.append('text')
                    .attr('x', labelX)
                    .attr('y', labelY)
                    .attr('text-anchor', textAnchor)
                    .attr('dy', '0.3em')
                    .style('font-size', '11px')
                    .style('fill', 'white')
                    .text(metric);
            });

            // Add data points with tooltips
            svg.selectAll('.radar-point')
                .data(updatedRadarPoints)
                .enter()
                .append('circle')
                .attr('class', 'radar-point')
                .attr('cx', d => d.x)
                .attr('cy', d => d.y)
                .attr('r', 5)
                .attr('fill', '#ff4136')
                .on('mouseover', (event, d) => {
                    // Highlight point
                    d3.select(event.currentTarget)
                        .attr('r', 7)
                        .attr('stroke', 'white');

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
                        <div>Value: ${ChartFactory.formatValue(d.originalValue)}</div>
                        <div>Normalized: ${(d.value * 100).toFixed(1)}%</div>
                        <div>Date: ${filtered.displayDates[dateIndex]}</div>
                    `);

                    // Position tooltip
                    const tooltipNode = tooltip.node();
                    const eventPos = d3.pointer(event, container);

                    tooltip
                        .style('left', `${eventPos[0]}px`)
                        .style('top', `${eventPos[1] - tooltipNode.offsetHeight - 10}px`);
                })
                .on('mouseout', (event) => {
                    // Reset point
                    d3.select(event.currentTarget)
                        .attr('r', 5)
                        .attr('stroke', null);

                    // Remove tooltip
                    d3.select(container).selectAll('.chart-tooltip').remove();
                });

            // Add date info - first remove any existing date info
            svg.select('.date-info').remove();

            // Then add the new date info
            svg.append('text')
                .attr('class', 'date-info')
                .attr('text-anchor', 'middle')
                .attr('x', 0)
                .attr('y', height/2 - 10) // Lower the date text a bit
                .style('font-size', '13px')
                .style('fill', 'rgba(255,255,255,0.7)')
                .text(`Date: ${filtered.displayDates && filtered.displayDates[0] ? filtered.displayDates[0] : ''}`);
        });
    });
};
