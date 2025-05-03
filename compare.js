// Compare Feature - Main JavaScript File

// Global state for the compare feature
const CompareState = {
    // Selected countries for comparison
    countries: [],
    
    // Maximum number of countries that can be compared
    maxCountries: 4,
    
    // Current display mode: 'separate' or 'combined'
    displayMode: 'separate',
    
    // Current slot being selected
    currentSlot: null,
    
    // Current visualization type
    vizType: 'line',
    
    // Reset the state
    reset() {
        this.countries = [];
        this.displayMode = 'separate';
        this.currentSlot = null;
        this.vizType = 'line';
    }
};

// Show the compare panel
function showComparePanel() {
    // Hide the globe and other elements
    const globe = document.getElementById('globe');
    const countryInfo = document.getElementById('countryInfo');
    const controlPanel = document.querySelector('.control-panel');
    const minimizedGlobe = document.getElementById('minimizedGlobe');
    
    // Hide elements
    if (globe) globe.style.display = 'none';
    if (countryInfo) countryInfo.style.display = 'none';
    if (controlPanel) controlPanel.style.display = 'none';
    if (minimizedGlobe) minimizedGlobe.style.display = 'none';
    
    // Show only the header elements
    const header = document.getElementById('header');
    if (header) header.style.display = 'flex';
    
    // Show the compare panel
    const comparePanel = document.getElementById('comparePanel');
    if (comparePanel) {
        comparePanel.style.display = 'block';
        
        // Reset the state
        CompareState.reset();
        
        // Reset the UI
        resetCompareUI();
    }
}

// Close the compare panel and restore the normal view
function closeComparePanel() {
    // Show the globe and other elements
    const globe = document.getElementById('globe');
    const countryInfo = document.getElementById('countryInfo');
    const controlPanel = document.querySelector('.control-panel');
    
    // Show elements
    if (globe) globe.style.display = 'block';
    if (countryInfo) countryInfo.style.display = 'block';
    if (controlPanel) controlPanel.style.display = 'flex';
    
    // Hide the compare panel
    const comparePanel = document.getElementById('comparePanel');
    if (comparePanel) comparePanel.style.display = 'none';
    
    // Hide the compare visualization panel
    const compareVisualizationPanel = document.getElementById('compareVisualizationPanel');
    if (compareVisualizationPanel) compareVisualizationPanel.style.display = 'none';
    
    // Reset the state
    CompareState.reset();
}

// Reset the compare UI
function resetCompareUI() {
    // Clear country slots
    for (let i = 1; i <= CompareState.maxCountries; i++) {
        const slotElement = document.getElementById(`countrySlot${i}`);
        if (slotElement) {
            if (i <= 2) {
                // Always show the first two slots
                slotElement.innerHTML = `
                    <div class="country-placeholder">Select Country ${i}</div>
                    <button class="select-country-btn" onclick="openCountrySelector(${i})">Select</button>
                `;
                slotElement.style.display = 'flex';
            } else {
                // Hide additional slots
                slotElement.style.display = 'none';
            }
        }
    }
    
    // Reset display mode buttons
    const separateBtn = document.getElementById('separateChartsBtn');
    const combinedBtn = document.getElementById('combinedChartBtn');
    
    if (separateBtn) separateBtn.classList.add('active');
    if (combinedBtn) combinedBtn.classList.remove('active');
    
    CompareState.displayMode = 'separate';
}

// Open the country selector for a specific slot
function openCountrySelector(slotNumber) {
    CompareState.currentSlot = slotNumber;
    
    const countrySelector = document.getElementById('compareCountrySelector');
    if (countrySelector) {
        countrySelector.style.display = 'block';
        
        // Clear the search input
        const searchInput = document.getElementById('compareCountrySearchInput');
        if (searchInput) searchInput.value = '';
        
        // Populate the country list
        populateCompareCountryList();
        
        // Focus on the search input
        if (searchInput) searchInput.focus();
    }
}

// Close the country selector
function closeCountrySelector() {
    const countrySelector = document.getElementById('compareCountrySelector');
    if (countrySelector) countrySelector.style.display = 'none';
    
    CompareState.currentSlot = null;
}

// Populate the country list for the compare selector
function populateCompareCountryList() {
    if (!window.globeInstance) return;
    
    const countryList = document.getElementById('compareCountryList');
    if (!countryList) return;
    
    countryList.innerHTML = '';
    
    // Get all countries from the dataService
    const countries = window.globeInstance.dataService.getAllCountries();
    
    if (countries.length === 0) {
        // If no countries are found, show a message
        countryList.innerHTML = '<div class="no-countries">Loading countries... Please wait.</div>';
        
        // Try again in a moment - data might still be loading
        setTimeout(() => {
            const retryCountries = window.globeInstance.dataService.getAllCountries();
            if (retryCountries.length > 0) {
                populateCompareCountryList();
            }
        }, 1000);
        return;
    }
    
    // Sort countries alphabetically by name
    countries.sort((a, b) => a.countryName.localeCompare(b.countryName));
    
    // Create elements for each country
    countries.forEach(country => {
        const countryItem = document.createElement('div');
        countryItem.className = 'compare-country-item';
        countryItem.innerHTML = `
            <img class="country-flag" src="https://flagcdn.com/${country.countryCode.toLowerCase()}.svg" 
                 onerror="this.src='https://via.placeholder.com/24x16/ddd/aaa?text=?'">
            <span>${country.countryName}</span>
        `;
        
        countryItem.addEventListener('click', () => {
            selectCountryForComparison(country.countryCode, country.countryName);
            closeCountrySelector();
        });
        
        countryList.appendChild(countryItem);
    });
    
    // Set up live filtering
    document.getElementById('compareCountrySearchInput').addEventListener('input', filterCompareCountries);
}

// Filter countries in the compare selector
function filterCompareCountries() {
    const input = document.getElementById('compareCountrySearchInput');
    const filter = input.value.toUpperCase();
    const countryList = document.getElementById('compareCountryList');
    const countryItems = countryList.getElementsByClassName('compare-country-item');
    
    for (let i = 0; i < countryItems.length; i++) {
        const span = countryItems[i].getElementsByTagName('span')[0];
        const txtValue = span.textContent || span.innerText;
        
        if (txtValue.toUpperCase().indexOf(filter) > -1) {
            countryItems[i].style.display = '';
        } else {
            countryItems[i].style.display = 'none';
        }
    }
}

// Select a country for comparison
function selectCountryForComparison(countryCode, countryName) {
    if (CompareState.currentSlot === null) return;
    
    // Update the country slot
    const slotElement = document.getElementById(`countrySlot${CompareState.currentSlot}`);
    if (slotElement) {
        slotElement.innerHTML = `
            <div class="country-selected">
                <img class="country-flag" src="https://flagcdn.com/${countryCode.toLowerCase()}.svg" 
                     onerror="this.src='https://via.placeholder.com/24x16/ddd/aaa?text=?'">
                <span>${countryName}</span>
            </div>
            <button class="remove-country-btn" onclick="removeCountry(${CompareState.currentSlot})">×</button>
        `;
    }
    
    // Update the state
    while (CompareState.countries.length < CompareState.currentSlot) {
        CompareState.countries.push(null);
    }
    
    CompareState.countries[CompareState.currentSlot - 1] = {
        code: countryCode,
        name: countryName
    };
}

// Remove a country from the comparison
function removeCountry(slotNumber) {
    // Update the country slot
    const slotElement = document.getElementById(`countrySlot${slotNumber}`);
    if (slotElement) {
        slotElement.innerHTML = `
            <div class="country-placeholder">Select Country ${slotNumber}</div>
            <button class="select-country-btn" onclick="openCountrySelector(${slotNumber})">Select</button>
        `;
    }
    
    // Update the state
    if (slotNumber <= CompareState.countries.length) {
        CompareState.countries[slotNumber - 1] = null;
    }
}

// Add a new country slot
function addCountrySlot() {
    // Find the next available slot
    let nextSlot = 3; // Start from slot 3 (slots 1 and 2 are always visible)
    
    while (nextSlot <= CompareState.maxCountries) {
        const slotElement = document.getElementById(`countrySlot${nextSlot}`);
        if (slotElement && slotElement.style.display === 'none') {
            // Found an available slot
            slotElement.innerHTML = `
                <div class="country-placeholder">Select Country ${nextSlot}</div>
                <button class="select-country-btn" onclick="openCountrySelector(${nextSlot})">Select</button>
            `;
            slotElement.style.display = 'flex';
            
            // If we've reached the maximum number of slots, hide the add button
            if (nextSlot === CompareState.maxCountries) {
                const addButton = document.getElementById('addCountryBtn');
                if (addButton) addButton.style.display = 'none';
            }
            
            break;
        }
        nextSlot++;
    }
}

// Set the display mode
function setDisplayMode(mode) {
    CompareState.displayMode = mode;
    
    // Update the UI
    const separateBtn = document.getElementById('separateChartsBtn');
    const combinedBtn = document.getElementById('combinedChartBtn');
    
    if (mode === 'separate') {
        if (separateBtn) separateBtn.classList.add('active');
        if (combinedBtn) combinedBtn.classList.remove('active');
    } else {
        if (separateBtn) separateBtn.classList.remove('active');
        if (combinedBtn) combinedBtn.classList.add('active');
    }
}

// Generate the comparison visualization
function generateComparison() {
    // Check if at least one country is selected
    const selectedCountries = CompareState.countries.filter(country => country !== null);
    
    if (selectedCountries.length === 0) {
        alert('Please select at least one country for comparison.');
        return;
    }
    
    // Hide the compare panel
    const comparePanel = document.getElementById('comparePanel');
    if (comparePanel) comparePanel.style.display = 'none';
    
    // Show the compare visualization panel
    const compareVisualizationPanel = document.getElementById('compareVisualizationPanel');
    if (compareVisualizationPanel) {
        compareVisualizationPanel.style.display = 'flex';
        
        // Set the visualization type selector to the current type
        const vizTypeSelector = document.getElementById('compareVizTypeSelector');
        if (vizTypeSelector) vizTypeSelector.value = CompareState.vizType;
        
        // Generate the visualization
        createComparisonVisualization();
    }
}

// Create the comparison visualization
function createComparisonVisualization() {
    const chartContainer = document.getElementById('compareChartContainer');
    if (!chartContainer) return;
    
    // Clear the container
    chartContainer.innerHTML = '';
    
    // Get the selected countries
    const selectedCountries = CompareState.countries.filter(country => country !== null);
    
    if (selectedCountries.length === 0) return;
    
    // Create the visualization based on the display mode
    if (CompareState.displayMode === 'separate') {
        // Create separate charts for each country
        selectedCountries.forEach(country => {
            // Create a container for this country's chart
            const countryChartContainer = document.createElement('div');
            countryChartContainer.className = 'country-chart-container';
            countryChartContainer.id = `chart-${country.code}`;
            
            // Add a title for this country
            const countryTitle = document.createElement('h3');
            countryTitle.className = 'country-chart-title';
            countryTitle.innerHTML = `
                <img class="country-flag" src="https://flagcdn.com/${country.code.toLowerCase()}.svg" 
                     onerror="this.src='https://via.placeholder.com/24x16/ddd/aaa?text=?'">
                <span>${country.name}</span>
            `;
            
            countryChartContainer.appendChild(countryTitle);
            
            // Add the chart container
            const chartDiv = document.createElement('div');
            chartDiv.className = 'chart-div';
            chartDiv.style.width = '100%';
            chartDiv.style.height = 'calc(100% - 40px)';
            
            countryChartContainer.appendChild(chartDiv);
            chartContainer.appendChild(countryChartContainer);
            
            // Create the chart
            ChartFactory.createChart(chartDiv, country.code, CompareState.vizType);
        });
    } else {
        // Create a combined chart for all countries
        const combinedChartContainer = document.createElement('div');
        combinedChartContainer.className = 'combined-chart-container';
        
        // Add a title
        const combinedTitle = document.createElement('h3');
        combinedTitle.className = 'combined-chart-title';
        combinedTitle.textContent = 'Combined Data';
        
        combinedChartContainer.appendChild(combinedTitle);
        
        // Add the chart container
        const chartDiv = document.createElement('div');
        chartDiv.className = 'chart-div';
        chartDiv.style.width = '100%';
        chartDiv.style.height = 'calc(100% - 40px)';
        
        combinedChartContainer.appendChild(chartDiv);
        chartContainer.appendChild(combinedChartContainer);
        
        // Create the combined chart
        createMultiCountryChart(chartDiv, selectedCountries, CompareState.vizType);
    }
}

// Change the comparison visualization type
function changeComparisonVisualization() {
    const vizTypeSelector = document.getElementById('compareVizTypeSelector');
    if (vizTypeSelector) {
        CompareState.vizType = vizTypeSelector.value;
        createComparisonVisualization();
    }
}

// Go back to the compare panel
function backToComparePanel() {
    // Hide the compare visualization panel
    const compareVisualizationPanel = document.getElementById('compareVisualizationPanel');
    if (compareVisualizationPanel) compareVisualizationPanel.style.display = 'none';
    
    // Show the compare panel
    const comparePanel = document.getElementById('comparePanel');
    if (comparePanel) comparePanel.style.display = 'block';
}

// Create a multi-country chart
function createMultiCountryChart(container, countries, vizType) {
    // Clear the container
    container.innerHTML = '';
    
    // Add loading state
    container.innerHTML = '<div class="loading">Loading chart data...</div>';
    
    // Prepare data for all countries
    const countriesData = countries.map(country => {
        return {
            code: country.code,
            name: country.name,
            data: ChartFactory.prepareDataForCountry(country.code)
        };
    }).filter(item => item.data !== null);
    
    if (countriesData.length === 0) {
        container.innerHTML = '<div class="error">No data available for the selected countries</div>';
        return;
    }
    
    // Clear loading indicator
    container.innerHTML = '';
    
    // Create the appropriate chart
    switch (vizType) {
        case 'bar':
            createMultiCountryBarChart(container, countriesData);
            break;
        case 'line':
            createMultiCountryLineChart(container, countriesData);
            break;
        case 'pie':
            // Pie charts don't make sense for multiple countries, so we'll create a bar chart instead
            createMultiCountryBarChart(container, countriesData);
            break;
        case 'radar':
            // Radar charts are complex for multiple countries, so we'll create a bar chart instead
            createMultiCountryBarChart(container, countriesData);
            break;
        case 'heatmap':
            // Heatmaps don't make sense for multiple countries, so we'll create a line chart instead
            createMultiCountryLineChart(container, countriesData);
            break;
        default:
            container.innerHTML = '<div class="error">Chart type not supported for multiple countries</div>';
    }
}

// Create a multi-country bar chart
function createMultiCountryBarChart(container, countriesData) {
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
        .text('Country Comparison - Latest Data');
    
    // Get the current dataset and column
    const dataService = window.globeInstance.dataService;
    const currentDataset = dataService.currentDataset;
    const currentColumn = dataService.currentColumn;
    
    // Prepare data for the chart
    const chartData = countriesData.map(country => {
        // Get the latest date with data
        const latestDate = country.data.dates[country.data.dates.length - 1];
        
        // Get the value for the current column
        const value = country.data.series[currentColumn] ? 
            country.data.series[currentColumn][country.data.series[currentColumn].length - 1] : 0;
        
        return {
            country: country.name,
            value: value || 0
        };
    });
    
    // Sort data by value
    chartData.sort((a, b) => b.value - a.value);
    
    // Create scales
    const x = d3.scaleBand()
        .domain(chartData.map(d => d.country))
        .range([0, width])
        .padding(0.2);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.value) * 1.1])
        .range([height, 0]);
    
    // Create axes
    const xAxis = d3.axisBottom(x)
        .tickSize(0);
    
    const yAxis = d3.axisLeft(y)
        .ticks(5)
        .tickFormat(d => ChartFactory.formatTickValue(d));
    
    // Add x-axis
    svg.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis)
        .selectAll('text')
        .style('text-anchor', 'end')
        .attr('dx', '-.8em')
        .attr('dy', '.15em')
        .attr('transform', 'rotate(-45)')
        .style('fill', 'white');
    
    // Add y-axis
    svg.append('g')
        .attr('class', 'y-axis')
        .call(yAxis)
        .selectAll('text')
        .style('fill', 'white');
    
    // Add y-axis label
    svg.append('text')
        .attr('class', 'y-axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('y', -60)
        .attr('x', -height / 2)
        .attr('text-anchor', 'middle')
        .style('fill', 'white')
        .text(currentColumn.replace(/_/g, ' '));
    
    // Color scale for countries
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
    
    // Add bars
    svg.selectAll('.bar')
        .data(chartData)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.country))
        .attr('width', x.bandwidth())
        .attr('y', d => y(d.value))
        .attr('height', d => height - y(d.value))
        .attr('fill', (d, i) => colorScale(i))
        .attr('rx', 2)
        .attr('ry', 2);
    
    // Add value labels
    svg.selectAll('.value-label')
        .data(chartData)
        .enter()
        .append('text')
        .attr('class', 'value-label')
        .attr('x', d => x(d.country) + x.bandwidth() / 2)
        .attr('y', d => y(d.value) - 5)
        .attr('text-anchor', 'middle')
        .style('fill', 'white')
        .style('font-size', '12px')
        .text(d => ChartFactory.formatValue(d.value));
}

// Create a multi-country line chart
function createMultiCountryLineChart(container, countriesData) {
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
        .text('Country Comparison - Trends Over Time');
    
    // Get the current dataset and column
    const dataService = window.globeInstance.dataService;
    const currentDataset = dataService.currentDataset;
    const currentColumn = dataService.currentColumn;
    
    // Find the common date range
    let allDates = new Set();
    countriesData.forEach(country => {
        country.data.dates.forEach(date => allDates.add(date));
    });
    
    // Convert to array and sort
    allDates = Array.from(allDates).sort();
    
    // Create scales
    const x = d3.scaleTime()
        .domain([new Date(allDates[0]), new Date(allDates[allDates.length - 1])])
        .range([0, width]);
    
    // Find the maximum value across all countries
    let maxValue = 0;
    countriesData.forEach(country => {
        const values = country.data.series[currentColumn] || [];
        const countryMax = d3.max(values) || 0;
        maxValue = Math.max(maxValue, countryMax);
    });
    
    const y = d3.scaleLinear()
        .domain([0, maxValue * 1.1])
        .range([height, 0]);
    
    // Create axes
    const xAxis = d3.axisBottom(x)
        .ticks(5)
        .tickFormat(d3.timeFormat('%b %Y'));
    
    const yAxis = d3.axisLeft(y)
        .ticks(5)
        .tickFormat(d => ChartFactory.formatTickValue(d));
    
    // Add x-axis
    svg.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis)
        .selectAll('text')
        .style('fill', 'white');
    
    // Add y-axis
    svg.append('g')
        .attr('class', 'y-axis')
        .call(yAxis)
        .selectAll('text')
        .style('fill', 'white');
    
    // Add y-axis label
    svg.append('text')
        .attr('class', 'y-axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('y', -60)
        .attr('x', -height / 2)
        .attr('text-anchor', 'middle')
        .style('fill', 'white')
        .text(currentColumn.replace(/_/g, ' '));
    
    // Color scale for countries
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
    
    // Create line generator
    const line = d3.line()
        .defined(d => d.value !== null && d.value !== undefined)
        .x(d => x(new Date(d.date)))
        .y(d => y(d.value))
        .curve(d3.curveMonotoneX);
    
    // Add lines for each country
    countriesData.forEach((country, i) => {
        // Prepare data for this country
        const countryData = country.data.dates.map((date, j) => {
            return {
                date: date,
                value: country.data.series[currentColumn] ? country.data.series[currentColumn][j] : null
            };
        }).filter(d => d.value !== null && d.value !== undefined);
        
        // Add the line
        svg.append('path')
            .datum(countryData)
            .attr('class', 'line')
            .attr('d', line)
            .attr('fill', 'none')
            .attr('stroke', colorScale(i))
            .attr('stroke-width', 2);
        
        // Add dots for data points
        svg.selectAll(`.dot-${i}`)
            .data(countryData)
            .enter()
            .append('circle')
            .attr('class', `dot-${i}`)
            .attr('cx', d => x(new Date(d.date)))
            .attr('cy', d => y(d.value))
            .attr('r', 3)
            .attr('fill', colorScale(i));
    });
    
    // Add legend
    const legend = svg.append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(${width + 20}, 0)`);
    
    countriesData.forEach((country, i) => {
        const legendItem = legend.append('g')
            .attr('transform', `translate(0, ${i * 25})`);
        
        legendItem.append('rect')
            .attr('width', 15)
            .attr('height', 15)
            .attr('fill', colorScale(i));
        
        legendItem.append('text')
            .attr('x', 25)
            .attr('y', 12)
            .style('fill', 'white')
            .text(country.name);
    });
}
