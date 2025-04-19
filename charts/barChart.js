// Bar Chart Implementation
ChartFactory.barChart = function(container, data) {
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
        .text(`${data.countryName} - Data Comparison`);
    
    // Limit to most recent dates for readability
    const maxDates = Math.min(15, data.displayDates.length);
    const recentDates = data.displayDates.slice(-maxDates);
    
    // X scale
    const x = d3.scaleBand()
        .domain(recentDates)
        .range([0, width])
        .padding(0.2);
        
    // Add X axis
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x)
            .tickFormat((d, i) => i % 2 === 0 ? d : '')) // Show every other label to prevent overlap
        .selectAll('text')
        .attr('transform', 'translate(-10,5)rotate(-45)')
        .style('text-anchor', 'end')
        .style('fill', 'white');
        
    // Collect all series values for Y scale
    const allValues = [];
    Object.keys(data.series).forEach(column => {
        const values = data.series[column].slice(-maxDates);
        allValues.push(...values.filter(v => v !== null && v !== undefined));
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
            .tickFormat(d => this.formatTickValue(d)))
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
    const barWidth = (x.bandwidth() * (1 - groupPadding)) / columnCount;
    
    // Color scale for the series
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
    
    // Draw bars for each series
    let columnIndex = 0;
    Object.keys(data.series).forEach(column => {
        const seriesValues = data.series[column].slice(-maxDates);
        
        // Create a group for this series
        const seriesGroup = svg.append('g')
            .attr('class', `series-${columnIndex}`);
            
        // Add bars
        seriesGroup.selectAll('rect')
            .data(seriesValues)
            .enter()
            .append('rect')
            .attr('x', (d, i) => x(recentDates[i]) + (barWidth * columnIndex) + (x.bandwidth() * groupPadding / 2))
            .attr('y', d => d === null ? height : y(d))
            .attr('width', barWidth)
            .attr('height', d => d === null ? 0 : height - y(d))
            .attr('fill', colorScale(column))
            .attr('rx', 2) // Rounded corners
            .attr('opacity', 0.8)
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
                    <div>Date: ${recentDates[i]}</div>
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
    
    // Add legend
    const legend = svg.append('g')
        .attr('class', 'chart-legend')
        .attr('transform', `translate(${width + 20}, 0)`);
        
    Object.keys(data.series).forEach((column, i) => {
        const legendItem = legend.append('g')
            .attr('transform', `translate(0, ${i * 25})`);
            
        legendItem.append('rect')
            .attr('width', 15)
            .attr('height', 15)
            .attr('rx', 2)
            .attr('fill', colorScale(column));
            
        legendItem.append('text')
            .attr('x', 25)
            .attr('y', 12)
            .style('fill', 'white')
            .style('font-size', '12px')
            .text(column);
    });
};
