// Line Chart Implementation
ChartFactory.lineChart = function(container, data) {
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

    // X scale - use all dates for line chart
    const x = d3.scaleTime()
        .domain(d3.extent(data.dates.map(d => new Date(d))))
        .range([0, width])
        .nice();

    // Add X axis
    svg.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x)
            .ticks(Math.min(data.dates.length / 2, 10))
            .tickFormat(d => d3.timeFormat('%b %d, %Y')(d)))
        .selectAll('text')
        .attr('transform', 'translate(-10,5)rotate(-45)')
        .style('text-anchor', 'end')
        .style('fill', 'white');

    // Calculate max Y value across all selected series to use a consistent scale
    const allValues = [];
    Object.keys(data.series).forEach(column => {
        // Only include selected columns in the scale calculation
        const isSelected = data.columnSelectionState[column] !== false;
        if (isSelected) {
            allValues.push(...data.series[column].filter(v => v !== null && v !== undefined));
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

    // Color scale for the series
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    // Create line generator
    const line = d3.line()
        .defined(d => d !== null && d !== undefined)
        .x((d, i) => x(new Date(data.dates[i])))
        .y(d => y(d))
        .curve(d3.curveMonotoneX); // Smoother curve

    // Draw lines for each series
    const seriesNames = Object.keys(data.series);
    seriesNames.forEach((column, seriesIndex) => {
        const seriesValues = data.series[column];

        // Skip if no valid data
        if (!seriesValues.some(v => v !== null && v !== undefined)) {
            return;
        }

        // Check if this column is selected
        const isSelected = data.columnSelectionState[column] !== false;

        // Set initial opacity and display based on selection state
        const initialOpacity = 0.8;
        const initialDisplay = isSelected ? 'block' : 'none';

        // Draw path
        svg.append('path')
            .datum(seriesValues)
            .attr('class', `line-path line-path-${seriesIndex}`)
            .attr('d', line)
            .attr('fill', 'none')
            .attr('stroke', colorScale(column))
            .attr('stroke-width', 2.5)
            .attr('opacity', initialOpacity)
            .attr('stroke-linejoin', 'round')
            .style('display', initialDisplay);

        // Add data points
        seriesValues.forEach((value, i) => {
            if (value === null || value === undefined) return;

            svg.append('circle')
                .attr('cx', x(new Date(data.dates[i])))
                .attr('cy', y(value))
                .attr('r', 4)
                .attr('fill', colorScale(column))
                .attr('opacity', initialOpacity)
                .attr('class', `data-point-${seriesIndex}`)
                .style('display', initialDisplay)
                .on('mouseover', (event) => {
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
                        <div><strong>${column}</strong></div>
                        <div>Date: ${data.displayDates[i]}</div>
                        <div>Value: ${ChartFactory.formatValue(value)}</div>
                    `);

                    // Position tooltip
                    const tooltipNode = tooltip.node();
                    const eventPos = d3.pointer(event, container);

                    tooltip
                        .style('left', `${eventPos[0]}px`)
                        .style('top', `${eventPos[1] - tooltipNode.offsetHeight - 10}px`);

                    // Highlight point
                    d3.select(event.currentTarget)
                        .attr('r', 6)
                        .attr('stroke', 'white')
                        .attr('stroke-width', 2);
                })
                .on('mouseout', (event) => {
                    // Remove tooltip
                    d3.select(container).selectAll('.chart-tooltip').remove();

                    // Reset point size
                    d3.select(event.currentTarget)
                        .attr('r', 4)
                        .attr('stroke', null);
                });
        });
    });

    // Add legend with interactive toggle functionality
    const legend = svg.append('g')
        .attr('class', 'chart-legend')
        .attr('transform', `translate(${width + 20}, 0)`);

    seriesNames.forEach((column, i) => {
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

        // Color indicator - line style for line chart
        const colorRect = legendItem.append('rect')
            .attr('width', 15)
            .attr('height', 3)
            .attr('rx', 1)
            .attr('fill', colorScale(column))
            .attr('y', 6)
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
            const seriesPath = svg.select(`.line-path-${i}`);
            const seriesPoints = svg.selectAll(`.data-point-${i}`);

            if (!currentState[column]) {
                // Series is now hidden but legend remains semi-transparent
                colorRect.style('opacity', 0.3);
                legendText.style('opacity', 0.3);
                seriesPath.style('display', 'none');
                seriesPoints.style('display', 'none');
            } else {
                // Series is now fully visible
                colorRect.style('opacity', 1);
                legendText.style('opacity', 1);
                seriesPath.style('display', 'block');
                seriesPoints.style('display', 'block');
                seriesPath.style('opacity', 0.8);
                seriesPoints.style('opacity', 0.8);
            }

            // Update the Y scale based on visible columns
            const visibleValues = [];
            Object.keys(data.series).forEach((col, idx) => {
                if (currentState[col] !== false) {
                    visibleValues.push(...data.series[col].filter(v => v !== null && v !== undefined));
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

            // Update all visible paths with new scale
            Object.keys(data.series).forEach((col, idx) => {
                if (currentState[col] !== false) {
                    // Update path
                    svg.select(`.line-path-${idx}`)
                        .transition()
                        .duration(500)
                        .attr('d', line(data.series[col]));

                    // Update points
                    data.series[col].forEach((value, i) => {
                        if (value !== null && value !== undefined) {
                            svg.selectAll(`.data-point-${idx}`)
                                .filter((d, j) => j === i)
                                .transition()
                                .duration(500)
                                .attr('cy', y(value));
                        }
                    });
                }
            });
        });
    });
};
