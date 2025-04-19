// Radar Chart Implementation
ChartFactory.radarChart = function(container, data) {
    const width = container.clientWidth;
    const height = container.clientHeight;
    const radius = Math.min(width, height) / 2 * 0.7;

    // Create SVG
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${width/2},${height/2})`);

    // Add title
    svg.append('text')
        .attr('class', 'chart-title')
        .attr('x', 0)
        .attr('y', -height/2 + 30)
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .style('fill', 'white')
        .text(`${data.countryName} - Multi-Metric Comparison`);

    // Use the most recent date's data
    const latestIndex = data.dates.length - 1;

    // Get the metrics (columns) that have data and are selected
    const metrics = Object.keys(data.series).filter(column => {
        // Check if this column is selected
        const isSelected = data.columnSelectionState[column] !== false;

        // Only include selected columns with valid data
        if (isSelected) {
            const value = data.series[column][latestIndex];
            return value !== null && value !== undefined && value > 0;
        }
        return false;
    });

    if (metrics.length < 3) {
        this.showError(container, "Radar chart requires at least 3 data points");
        return;
    }

    // Get values for each metric
    const values = metrics.map(metric => ({
        metric: metric,
        value: data.series[metric][latestIndex]
    }));

    // Calculate angles for each metric
    const angleStep = (Math.PI * 2) / metrics.length;

    // Scale for data values
    const maxValue = d3.max(values, d => d.value) * 1.1; // 10% padding
    const rScale = d3.scaleLinear()
        .domain([0, maxValue])
        .range([0, radius]);

    // Draw radar background circles and labels
    const levels = 5;
    const levelStep = maxValue / levels;

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

        // Add value label to the right side
        svg.append('text')
            .attr('x', 5)
            .attr('y', -levelRadius + 4)
            .style('font-size', '10px')
            .style('fill', 'rgba(255,255,255,0.6)')
            .text(ChartFactory.formatValue(levelValue));
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

    // Create radar path points
    const radarPoints = values.map((d, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const radius = rScale(d.value);
        return {
            x: radius * Math.cos(angle),
            y: radius * Math.sin(angle),
            value: d.value,
            metric: d.metric
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
                <div>Value: ${ChartFactory.formatValue(d.value)}</div>
                <div>Date: ${data.displayDates[latestIndex]}</div>
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
        .attr('y', height/2 - 30)
        .style('font-size', '12px')
        .style('fill', 'rgba(255,255,255,0.7)')
        .text(`Date: ${data.displayDates[latestIndex]}`);
};
