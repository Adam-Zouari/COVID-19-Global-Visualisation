// Pie Chart Implementation
ChartFactory.pieChart = function(container, data) {
    // Determine if we're in compare mode with separate charts
    const isCompareModeSeparate = container.closest('.country-chart-container') !== null;

    let width, height, radius;

    if (isCompareModeSeparate) {
        // Use 90% of the container dimensions for a smaller chart
        width = container.clientWidth * 0.9;
        height = container.clientHeight * 0.9;
        radius = Math.min(width, height) / 2 * 0.65; // Slightly smaller radius
    } else {
        width = container.clientWidth;
        height = container.clientHeight;
        radius = Math.min(width, height) / 2 * 0.7;
    }

    // Create SVG with the helper method
    let svg;

    if (isCompareModeSeparate) {
        // For pie charts, we need to center the chart in the SVG
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

    // Use the most recent date's data for the pie chart
    const latestIndex = data.dates.length - 1;
    const pieData = [];

    // Collect all columns for the legend
    const allColumns = [];

    // Collect data for pie chart from the latest date
    Object.keys(data.series).forEach(column => {
        // Check if this column is selected
        const isSelected = data.columnSelectionState[column] !== false;

        // Get the value for this column
        const value = data.series[column][latestIndex];

        // Add to allColumns for the legend
        if (value !== null && value !== undefined && value > 0) {
            allColumns.push({
                name: column,
                value: value,
                isSelected: isSelected
            });
        }

        // Only include selected columns in the actual pie chart
        if (isSelected && value !== null && value !== undefined && value > 0) {
            pieData.push({
                name: column,
                value: value
            });
        }
    });

    // Check if we have enough data for the pie chart
    const hasEnoughData = pieData.length > 0;

    // If not enough data, show error but continue to draw the legend
    if (!hasEnoughData) {
        this.showError(container, "No data available for pie chart visualization");
    }

    // Color scale
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    // Only draw the pie chart if we have enough data
    if (hasEnoughData) {
        // Create pie layout
        const pie = d3.pie()
            .value(d => d.value)
            .sort(null); // Don't sort to maintain original order

        const pieArcs = pie(pieData);

        // Create arc generator
        const arc = d3.arc()
            .innerRadius(radius * 0.4) // Create a donut chart with inner radius
            .outerRadius(radius);

        // Add pie slices
        svg.selectAll('path')
            .data(pieArcs)
            .enter()
            .append('path')
            .attr('d', arc)
            .attr('fill', d => colorScale(d.data.name))
            .attr('stroke', '#1a1a1a')
            .style('stroke-width', '1px')
            .style('opacity', 0.8)
            .on('mouseover', (event, d) => {
                // Highlight slice
                d3.select(event.currentTarget)
                    .style('opacity', 1)
                    .style('stroke', '#ffffff')
                    .style('stroke-width', '2px')
                    .attr('transform', 'scale(1.03)');

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

                // Calculate percentage
                const total = d3.sum(pieData, d => d.value);
                const percent = d.data.value / total * 100;

                tooltip.html(`
                    <div><strong>${d.data.name}</strong></div>
                    <div>Value: ${ChartFactory.formatValue(d.data.value)}</div>
                    <div>Percentage: ${percent.toFixed(1)}%</div>
                `);

                // Position tooltip
                const tooltipNode = tooltip.node();
                const eventPos = d3.pointer(event, container);

                tooltip
                    .style('left', `${eventPos[0]}px`)
                    .style('top', `${eventPos[1] - tooltipNode.offsetHeight - 10}px`);
            })
            .on('mouseout', (event) => {
                // Reset slice style
                d3.select(event.currentTarget)
                    .style('opacity', 0.8)
                    .style('stroke', '#1a1a1a')
                    .style('stroke-width', '1px')
                    .attr('transform', 'scale(1)');

                // Remove tooltip
                d3.select(container).selectAll('.chart-tooltip').remove();
            });

        // Add date info
        svg.append('text')
            .attr('class', 'date-info')
            .attr('text-anchor', 'middle')
            .attr('x', 0)
            .attr('y', height/2 - 30)
            .style('font-size', '14px')
            .style('fill', 'rgba(255,255,255,0.7)')
            .text(`Date: ${data.displayDates[latestIndex]}`);
    }

    // Add legend with interactive toggle functionality
    const legend = svg.append('g')
        .attr('class', 'chart-legend')
        .attr('transform', `translate(${radius + 20}, ${-radius + 20})`);

    allColumns.forEach((d, i) => {
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
                'pie',
                ChartControls.getSettings()
            );
        });
    });


};
