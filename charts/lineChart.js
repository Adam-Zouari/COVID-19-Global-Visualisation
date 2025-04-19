// Line Chart Implementation
ChartFactory.lineChart = function(container, data) {
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
        .text(`${data.countryName} - Trends Over Time`);
    
    // X scale - use all dates for line chart
    const x = d3.scaleTime()
        .domain(d3.extent(data.dates.map(d => new Date(d))))
        .range([0, width])
        .nice();
        
    // Add X axis
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x)
            .ticks(Math.min(data.dates.length / 2, 10))
            .tickFormat(d => d3.timeFormat('%b %d, %Y')(d)))
        .selectAll('text')
        .attr('transform', 'translate(-10,5)rotate(-45)')
        .style('text-anchor', 'end')
        .style('fill', 'white');
        
    // Calculate max Y value across all series to use a consistent scale
    const allValues = [];
    Object.keys(data.series).forEach(column => {
        allValues.push(...data.series[column].filter(v => v !== null && v !== undefined));
    });
    
    // Y scale with 10% padding at top
    const maxVal = d3.max(allValues) || 1;
    const y = d3.scaleLinear()
        .domain([0, maxVal * 1.1])
        .range([height, 0]);
        
    // Add Y axis
    svg.append('g')
        .call(d3.axisLeft(y)
            .ticks(5)
            .tickFormat(d => this.formatTickValue ? this.formatTickValue(d) : d3.format(',')(d)))
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
    seriesNames.forEach(column => {
        const seriesValues = data.series[column];
        
        // Skip if no valid data
        if (!seriesValues.some(v => v !== null && v !== undefined)) {
            return;
        }
        
        // Draw path
        svg.append('path')
            .datum(seriesValues)
            .attr('class', 'line-path')
            .attr('d', line)
            .attr('fill', 'none')
            .attr('stroke', colorScale(column))
            .attr('stroke-width', 2.5)
            .attr('opacity', 0.8)
            .attr('stroke-linejoin', 'round');
            
        // Add data points
        seriesValues.forEach((value, i) => {
            if (value === null || value === undefined) return;
            
            svg.append('circle')
                .attr('cx', x(new Date(data.dates[i])))
                .attr('cy', y(value))
                .attr('r', 4)
                .attr('fill', colorScale(column))
                .attr('opacity', 0.8)
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
    
    // Add legend
    const legend = svg.append('g')
        .attr('class', 'chart-legend')
        .attr('transform', `translate(${width + 20}, 0)`);
        
    seriesNames.forEach((column, i) => {
        const legendItem = legend.append('g')
            .attr('transform', `translate(0, ${i * 25})`);
            
        legendItem.append('rect')
            .attr('width', 15)
            .attr('height', 3)
            .attr('rx', 1)
            .attr('fill', colorScale(column))
            .attr('y', 6);
            
        legendItem.append('text')
            .attr('x', 25)
            .attr('y', 12)
            .style('fill', 'white')
            .style('font-size', '12px')
            .text(column);
    });
};
