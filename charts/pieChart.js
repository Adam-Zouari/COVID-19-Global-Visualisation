// Pie Chart Implementation
ChartFactory.pieChart = function(container, data) {
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
        .text(`${data.countryName} - Latest Data Distribution`);
    
    // Use the most recent date's data for the pie chart
    const latestIndex = data.dates.length - 1;
    const pieData = [];
    
    // Collect data for pie chart from the latest date
    Object.keys(data.series).forEach(column => {
        const value = data.series[column][latestIndex];
        if (value !== null && value !== undefined && value > 0) {
            pieData.push({
                name: column,
                value: value
            });
        }
    });
    
    if (pieData.length === 0) {
        this.showError(container, "No data available for pie chart visualization");
        return;
    }
    
    // Color scale
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
    
    // Create pie layout
    const pie = d3.pie()
        .value(d => d.value)
        .sort(null); // Don't sort to maintain original order
        
    const pieArcs = pie(pieData);
    
    // Create arc generator
    const arc = d3.arc()
        .innerRadius(radius * 0.4) // Create a donut chart with inner radius
        .outerRadius(radius);
        
    // Create smaller arc for labels
    const labelArc = d3.arc()
        .innerRadius(radius * 0.7)
        .outerRadius(radius * 0.7);
    
    // Add pie slices
    const slices = svg.selectAll('path')
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
    
    // Add legend
    const legend = svg.append('g')
        .attr('class', 'chart-legend')
        .attr('transform', `translate(${radius + 20}, ${-radius + 20})`);
        
    pieData.forEach((d, i) => {
        const legendItem = legend.append('g')
            .attr('transform', `translate(0, ${i * 20})`);
            
        legendItem.append('rect')
            .attr('width', 12)
            .attr('height', 12)
            .attr('rx', 2)
            .attr('fill', colorScale(d.name));
            
        legendItem.append('text')
            .attr('x', 20)
            .attr('y', 9)
            .style('font-size', '11px')
            .style('fill', 'white')
            .text(d.name);
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
};
