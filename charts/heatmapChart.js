// Heat Map Implementation
ChartFactory.heatmapChart = function(container, data) {
    const margin = { top: 50, right: 100, bottom: 80, left: 80 };
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
        .text(`${data.countryName} - Data Heat Map`);
    
    // Select metrics with sufficient data
    const metrics = Object.keys(data.series).filter(column => {
        const values = data.series[column].filter(v => v !== null && v !== undefined);
        return values.length > data.dates.length * 0.3; // At least 30% of dates have data
    });
    
    if (metrics.length < 2 || data.dates.length < 3) {
        this.showError(container, "Not enough data for heat map visualization");
        return;
    }
    
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
    
    if (heatmapData.length === 0) {
        this.showError(container, "No valid data for heat map visualization");
        return;
    }
    
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
    const colorScale = d3.scaleSequential(d3.interpolateInferno)
        .domain([0, maxValue]);
    
    // Add X axis
    svg.append('g')
        .attr('transform', `translate(0,${cellHeight * metrics.length})`)
        .call(d3.axisBottom(x)
            .tickFormat((d, i) => i % 2 === 0 ? selectedDisplayDates[i] : ''))
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
    const legendHeight = 150;
    
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
};
