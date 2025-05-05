// Bar Chart Implementation
ChartFactory.barChart = function(container, data) {
    // Create SVG element
    const margin = { top: 50, right: 150, bottom: 80, left: 80 };

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

    // Use the dates provided by the data (already filtered by date range/single date)
    const displayDates = data.displayDates;
    const maxDates = displayDates.length;

    // X scale
    const x = d3.scaleBand()
        .domain(displayDates)
        .range([0, width])
        .padding(0.2);

    // Add X axis
    svg.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x)
            .tickFormat((d, i) => i % 2 === 0 ? d : '')) // Show every other label to prevent overlap
        .selectAll('text')
        .attr('transform', 'translate(-10,5)rotate(-45)')
        .style('text-anchor', 'end')
        .style('fill', 'white');

    // Collect all series values for Y scale, but only from selected columns
    const allValues = [];
    Object.keys(data.series).forEach(column => {
        // Only include selected columns in the scale calculation
        const isSelected = data.columnSelectionState[column] !== false;
        if (isSelected) {
            const values = data.series[column].slice(-maxDates);
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

    // Add Y axis label
    svg.append('text')
        .attr('class', 'y-axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('y', -60)
        .attr('x', -height/2)
        .attr('text-anchor', 'middle')
        .style('fill', 'white')
        .text('Value');

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

    // Calculate bar width based on number of series
    const columnCount = Object.keys(data.series).length;
    const groupPadding = 0.2; // 20% of the band width for padding between groups

    // For single date mode, use a different layout
    let barWidth;
    if (data.isSingleDate) {
        // In single date mode, spread bars across the width
        barWidth = (width * 0.6) / columnCount;
    } else {
        // In range mode, calculate based on x-axis bandwidth
        barWidth = (x.bandwidth() * (1 - groupPadding)) / columnCount;
    }

    // Color scale for the series
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    // Draw bars for each series
    let columnIndex = 0;
    Object.keys(data.series).forEach(column => {
        const seriesValues = data.series[column].slice(-maxDates);

        // Check if this column is selected
        const isSelected = data.columnSelectionState[column] !== false;

        // Create a group for this series
        const seriesGroup = svg.append('g')
            .attr('class', `series-${columnIndex}`);

        // Store the column index for legend interaction
        seriesGroup.attr('data-column-index', columnIndex);

        // Set initial display and opacity based on selection state
        const initialOpacity = 0.8;
        if (!isSelected) {
            seriesGroup.style('display', 'none');
        }

        // Add bars
        seriesGroup.selectAll('rect')
            .data(seriesValues)
            .enter()
            .append('rect')
            .attr('x', (d, i) => {
                if (data.isSingleDate) {
                    // For single date mode, center the bars
                    return (width / 2) - ((columnCount * barWidth) / 2) + (columnIndex * barWidth);
                } else {
                    // For range mode, position based on x-axis
                    return x(displayDates[i]) + (barWidth * columnIndex) + (x.bandwidth() * groupPadding / 2);
                }
            })
            .attr('y', d => d === null ? height : y(d))
            .attr('width', barWidth)
            .attr('height', d => d === null ? 0 : height - y(d))
            .attr('fill', colorScale(column))
            .attr('rx', 2) // Rounded corners
            .attr('opacity', initialOpacity)
            .on('mouseover', function(event, d) {
                // Highlight on hover
                d3.select(this)
                    .attr('opacity', 1)
                    .attr('stroke', 'white')
                    .attr('stroke-width', 1);

                // Show tooltip
                const i = seriesValues.indexOf(d);
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
                    <div><strong>${column}</strong></div>
                    <div>Date: ${displayDates[i]}</div>
                    <div>Value: ${d === null ? 'No data' : ChartFactory.formatValue(d)}</div>
                `);

                // Position tooltip
                const tooltipNode = tooltip.node();
                const eventRect = this.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();

                tooltip
                    .style('left', `${eventRect.left - containerRect.left + eventRect.width/2}px`)
                    .style('top', `${eventRect.top - containerRect.top - tooltipNode.offsetHeight - 5}px`)
                    .style('transform', 'translateX(-50%)');
            })
            .on('mouseout', function() {
                // Remove highlight
                d3.select(this)
                    .attr('opacity', 0.8)
                    .attr('stroke', null);

                // Remove tooltip
                d3.select(container).selectAll('.chart-tooltip').remove();
            });

        columnIndex++;
    });

    // Add legend with interactive toggle functionality
    const legend = svg.append('g')
        .attr('class', 'chart-legend')
        .attr('transform', `translate(${width + 20}, 0)`);

    Object.keys(data.series).forEach((column, i) => {
        // Check if this column is selected
        const isSelected = data.columnSelectionState[column] !== false;

        const legendItem = legend.append('g')
            .attr('transform', `translate(0, ${i * 25})`)
            .attr('class', 'legend-item')
            .style('cursor', 'pointer');

        // Add a background rectangle for better click target
        legendItem.append('rect')
            .attr('width', width * 0.25)
            .attr('height', 20)
            .attr('x', -5)
            .attr('y', -5)
            .attr('fill', 'transparent')
            .attr('class', 'legend-hitbox');

        // Color indicator
        const colorRect = legendItem.append('rect')
            .attr('width', 15)
            .attr('height', 15)
            .attr('rx', 2)
            .attr('fill', colorScale(column))
            .attr('class', 'legend-color')
            .style('opacity', isSelected ? 1 : 0.3);

        // Label
        const legendText = legendItem.append('text')
            .attr('x', 25)
            .attr('y', 12)
            .style('fill', 'white')
            .style('font-size', '12px')
            .style('opacity', isSelected ? 1 : 0.3)
            .text(column);

        // Add click handler for toggling
        legendItem.on('click', function() {
            // Get current state from ChartControls
            const currentState = ChartControls.state.selectedColumns;

            // Toggle this column
            currentState[column] = !currentState[column];

            // Update visual state
            if (!currentState[column]) {
                // Series is now hidden but legend remains semi-transparent
                colorRect.style('opacity', 0.3);
                legendText.style('opacity', 0.3);
                d3.selectAll(`.series-${i}`).style('display', 'none');
            } else {
                // Series is now fully visible
                colorRect.style('opacity', 1);
                legendText.style('opacity', 1);
                d3.selectAll(`.series-${i}`).style('display', 'block');
                d3.selectAll(`.series-${i}`).style('opacity', 0.8);
            }

            // Update the Y scale based on visible columns
            const visibleValues = [];
            Object.keys(data.series).forEach((col, idx) => {
                if (currentState[col] !== false) {
                    const values = data.series[col].slice(-maxDates);
                    visibleValues.push(...values.filter(v => v !== null && v !== undefined));
                }
            });

            // Update Y scale with new max value
            const newMaxVal = d3.max(visibleValues) || 1;
            y.domain([0, newMaxVal * 1.1]);

            // Update Y axis with animation
            svg.select('.y-axis')
                .transition()
                .duration(500)
                .call(d3.axisLeft(y).tickFormat(d => ChartFactory.formatTickValue(d)));

            // Update grid lines
            svg.selectAll('.grid-lines line').remove();
            svg.select('.grid-lines')
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

            // Update all visible bars with new scale
            Object.keys(data.series).forEach((col, idx) => {
                if (currentState[col] !== false) {
                    const seriesValues = data.series[col].slice(-maxDates);
                    svg.selectAll(`.series-${idx} rect`)
                        .data(seriesValues)
                        .transition()
                        .duration(500)
                        .attr('y', d => d === null ? height : y(d))
                        .attr('height', d => d === null ? 0 : height - y(d));
                }
            });
        });
    });
};
