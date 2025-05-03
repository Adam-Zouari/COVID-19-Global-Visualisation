// Globe Event Handling Methods
GlobeVis.prototype.setupEventListeners = function() {
    // Handle data type selector change
    document.getElementById('dataSelector').addEventListener('change', (event) => {
        dataService.changeColumn(event.target.value);
        this.updateGlobeColors();
    });

    // Handle reset button click
    document.getElementById('resetBtn').addEventListener('click', () => {
        this.resetView();
    });

    // Handle wheel event for stopping rotation when zooming
    this.svg.on('wheel', () => {
        this.stopAutoRotation();
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        this.resize();
    });
};

GlobeVis.prototype.dragstarted = function(event) {
    this.stopAutoRotation();
    this.drag.initialRotation = [...this.currentRotation];
    this.drag.startPos = [event.x, event.y];
};

GlobeVis.prototype.dragged = function(event) {
    if (!this.drag.initialRotation) this.drag.initialRotation = [...this.currentRotation];

    const dx = event.x - this.drag.startPos[0];
    const dy = event.y - this.drag.startPos[1];

    this.currentRotation[0] = this.drag.initialRotation[0] + dx / this.sensitivity;
    this.currentRotation[1] = Math.max(-90, Math.min(90, this.drag.initialRotation[1] - dy / this.sensitivity));

    this.projection.rotate(this.currentRotation);

    requestAnimationFrame(() => {
        this.globeGroup.selectAll('path')
            .attr('d', this.path);

        // If we're in transparent mode, update the depth-based rendering
        if (this.projection.clipAngle() > 90) {
            this.renderCountriesByDepth();
        } else {
            // In standard mode, maintain full opacity and interactivity
            this.globeGroup.selectAll('.country')
                .attr('fill-opacity', 1.0)
                .style('pointer-events', 'auto');
        }
    });
};

GlobeVis.prototype.dragended = function(event) {
    this.drag.initialRotation = undefined;
    this.drag.startPos = undefined;
};

GlobeVis.prototype.zoomed = function(event) {
    this.stopAutoRotation();

    const scale = event.transform.k;
    const adjustedRadius = this.radius * scale;

    this.projection.scale(adjustedRadius);

    this.globeGroup.selectAll('path')
        .attr('d', this.path);

    this.globeGroup.select('.ocean')
        .attr('r', adjustedRadius)
        .attr('stroke-width', (0.5 / scale) + 'px');

    this.globeGroup.select('.ocean-depth')
        .attr('r', adjustedRadius);

    this.svg.select('.globe-backdrop')
        .attr('r', adjustedRadius + 5);

    this.globeGroup.selectAll('.country')
        .attr('stroke-width', (0.5 / scale) + 'px');

    // If there's a selected country, make sure its stroke is thicker and visible
    if (this.selectedCountry) {
        d3.select(`#country-${this.selectedCountry}`)
            .attr('stroke', '#ffffff')
            .attr('stroke-width', (1.5 / scale) + 'px');
    }

    this.globeGroup.select('.graticule')
        .attr('stroke-width', (0.5 / scale) + 'px');
};

GlobeVis.prototype.handleMouseOver = function(event, d) {
    // Highlight the country with visible white stroke
    d3.select(event.currentTarget)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', '1px');

    // Get country code and data
    const countryCode = this.getCountryCode(d);
    const countryData = dataService.getCountryData(countryCode);

    // Show tooltip with flag and data
    if (countryData) {
        // Create tooltip content with flag and data
        let tooltipContent = `
            <div class="tooltip-header">
                <img class="country-flag" src="https://flagcdn.com/${countryCode.toLowerCase()}.svg"
                     onerror="this.src='https://via.placeholder.com/30x20/ddd/aaa?text=?'">
                <strong>${countryData.countryName}</strong>
            </div>
            <div class="tooltip-body">
                <div class="tooltip-date">Date: ${dataService.formatDate(countryData.date)}</div>
        `;

        // Add all available metrics for current dataset
        for (const key of dataService.availableColumns[dataService.currentDataset]) {
            if (key in countryData) {
                const value = countryData[key];
                const formattedValue = dataService.formatNumber(value);
                tooltipContent += `<div class="data-row"><span class="data-label">${key}:</span> <span class="data-value">${formattedValue}</span></div>`;
            }
        }

        tooltipContent += '</div>';

        this.tooltip
            .style('opacity', 1)
            .html(tooltipContent)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 20) + 'px');
    } else if (countryCode) {
        // If we have a country code but no data
        this.tooltip
            .style('opacity', 1)
            .html(`
                <div class="tooltip-header">
                    <img class="country-flag" src="https://flagcdn.com/${countryCode.toLowerCase()}.svg"
                         onerror="this.src='https://via.placeholder.com/30x20/ddd/aaa?text=?'">
                    <strong>${dataService.getCountryName(countryCode)}</strong>
                </div>
                <div class="tooltip-body">No data available</div>
            `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 20) + 'px');
    } else if (d.properties && d.properties.name) {
        // If we only have the country name
        this.tooltip
            .style('opacity', 1)
            .html(`
                <div class="tooltip-header">
                    <strong>${d.properties.name}</strong>
                </div>
                <div class="tooltip-body">No data available</div>
            `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 20) + 'px');
    }
};

GlobeVis.prototype.handleMouseOut = function(event, d) {
    // Remove highlight unless it's the selected country
    if (!this.selectedCountry || this.selectedCountry !== d.id) {
        d3.select(event.currentTarget)
            .attr('stroke', 'rgba(255,255,255,0.0)')
            .attr('stroke-width', '0.5px');
    }

    // Hide tooltip
    this.tooltip
        .style('opacity', 0);
};

GlobeVis.prototype.handleCountryClick = function(event, d) {
    const countryCode = this.getCountryCode(d);
    const countryData = dataService.getCountryData(countryCode);

    // Reset previous selection
    if (this.selectedCountry) {
        d3.select(`#country-${this.selectedCountry}`)
            .attr('stroke', 'rgba(255,255,255,0.0)')
            .attr('stroke-width', '0.5px')
            .classed('selected-country', false);
    }

    // Set new selection with visible stroke
    this.selectedCountry = d.id;
    d3.select(event.currentTarget)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', '1.5px')
        .classed('selected-country', true);

    // Update the country info panel
    this.updateCountryInfoPanel(countryData);
};

GlobeVis.prototype.updateCountryInfoPanel = function(countryData) {
    const countryNameEl = document.getElementById('countryName');
    const countryStatsEl = document.getElementById('countryStats');
    const countryInfoPanel = document.getElementById('countryInfo');
    const seeMoreBtn = document.getElementById('seeMoreBtn');

    if (countryData) {
        // Create header with flag and country name
        const countryCode = countryData.countryKey ? countryData.countryKey.toLowerCase() : '';

        // Update header with flag + name
        countryNameEl.innerHTML = `
            <div class="country-header">
                <img class="country-flag" src="https://flagcdn.com/${countryCode}.svg"
                     onerror="this.src='https://via.placeholder.com/30x20/ddd/aaa?text=?'">
                <span>${countryData.countryName}</span>
            </div>
        `;

        // Clear existing stats
        countryStatsEl.innerHTML = '';

        // Add all available metrics for this country
        for (const key of dataService.availableColumns[dataService.currentDataset]) {
            if (key in countryData) {
                const statItem = document.createElement('div');
                statItem.className = 'stat-item';

                const statLabel = document.createElement('div');
                statLabel.className = 'stat-label';
                statLabel.textContent = key + ':';

                const statValue = document.createElement('div');
                statValue.className = 'stat-value';
                statValue.textContent = dataService.formatNumber(countryData[key]);

                statItem.appendChild(statLabel);
                statItem.appendChild(statValue);
                countryStatsEl.appendChild(statItem);
            }
        }

        // Show the country info panel and See More button
        countryInfoPanel.style.display = 'block';
        seeMoreBtn.style.display = 'block';
    } else {
        countryNameEl.innerHTML = 'Select a country';
        countryStatsEl.innerHTML = `
            <div class="stat-item">
                <div class="stat-label">Select a country</div>
                <div class="stat-value">to see stats</div>
            </div>
        `;

        // Hide the panel and See More button when no country is selected
        countryInfoPanel.style.display = 'none';
        seeMoreBtn.style.display = 'none';
    }
};

GlobeVis.prototype.updateDataSelector = function() {
    const dataSelector = document.getElementById('dataSelector');
    dataSelector.innerHTML = ''; // Clear existing options

    // Add options based on available columns in current dataset
    const columns = dataService.availableColumns[dataService.currentDataset];
    columns.forEach(column => {
        const option = document.createElement('option');
        option.value = column;
        option.textContent = column;
        dataSelector.appendChild(option);
    });

    // Set currently selected column
    if (dataService.currentColumn) {
        dataSelector.value = dataService.currentColumn;
    }
};

GlobeVis.prototype.setupDateSlider = function() {
    const dateSlider = document.getElementById('dateSlider');
    const currentDateEl = document.getElementById('currentDate');
    const prevDateBtn = document.getElementById('prevDateBtn');
    const nextDateBtn = document.getElementById('nextDateBtn');

    // Set slider range based on available dates with data
    if (dataService.availableDates && dataService.availableDates.length > 0) {
        dateSlider.min = 0;
        dateSlider.max = dataService.availableDates.length - 1;

        // If we have few dates, use them all
        const availableDatesCount = dataService.availableDates.length;
        this.log(`Setting up date slider with ${availableDatesCount} dates`);

        // Start at latest useful date
        const latestDateIndex = availableDatesCount > 0 ? availableDatesCount - 1 : 0;
        dateSlider.value = latestDateIndex;

        // Set current date to the selected index
        dataService.currentDate = dataService.availableDates[latestDateIndex];

        // Update current date display
        currentDateEl.textContent = dataService.formatDate(dataService.currentDate);
    } else {
        // No dates with data
        this.log("No dates with data available");
        currentDateEl.textContent = "No dates with data";
        dateSlider.disabled = true;
        prevDateBtn.disabled = true;
        nextDateBtn.disabled = true;
    }

    // Handle slider input - use direct mapping to available dates array
    // Use debouncing to prevent excessive updates when sliding quickly
    let updateTimeout = null;

    dateSlider.addEventListener('input', () => {
        const index = parseInt(dateSlider.value);
        // Ensure the index is valid
        if (index >= 0 && index < dataService.availableDates.length) {
            const newDate = dataService.availableDates[index];

            // Update date display immediately for responsive feel
            currentDateEl.textContent = dataService.formatDate(newDate);

            // Debounce the actual data update
            if (updateTimeout) clearTimeout(updateTimeout);
            updateTimeout = setTimeout(() => {
                dataService.changeDate(newDate);
                this.updateGlobeColors();

                // Update country info if needed
                if (this.selectedCountry) {
                    const countryEl = document.getElementById(`country-${this.selectedCountry}`);
                    if (countryEl) {
                        const countryCode = countryEl.getAttribute('data-country-code');
                        const countryData = dataService.getCountryData(countryCode);
                        this.updateCountryInfoPanel(countryData);
                    }
                }
            }, 50); // Small delay to improve performance during sliding
        }
    });

    // Previous date button
    prevDateBtn.addEventListener('click', () => {
        const currentIndex = parseInt(dateSlider.value);
        if (currentIndex > 0) {
            dateSlider.value = currentIndex - 1;
            dateSlider.dispatchEvent(new Event('input'));
        }
    });

    // Next date button
    nextDateBtn.addEventListener('click', () => {
        const currentIndex = parseInt(dateSlider.value);
        if (currentIndex < dateSlider.max) {
            dateSlider.value = currentIndex + 1;
            dateSlider.dispatchEvent(new Event('input'));
        }
    });
};

GlobeVis.prototype.changeDataset = function(dataset) {
    // Update the dataset indicator in the UI
    const datasetDisplayNames = {
        'epidem': 'Epidemiology',
        'hospitalizations': 'Hospitalizations',
        'vaccinations': 'Vaccinations'
    };

    const currentDatasetEl = document.getElementById('currentDataset');
    if (currentDatasetEl) {
        currentDatasetEl.textContent = datasetDisplayNames[dataset] || dataset;
    }

    // Change dataset in data service
    const result = dataService.changeDataset(dataset);

    // Update data selector with new columns
    this.updateDataSelector();

    // Update globe colors
    this.updateGlobeColors();

    // Direct implementation of background and button color updates
    // Define color gradients for each dataset
    const backgroundGradients = {
        'epidem': 'radial-gradient(#4a0000, #000)',         // Red theme for epidemiology
        'hospitalizations': 'radial-gradient(#1a315a, #000)', // Blue theme for hospitalizations
        'vaccinations': 'radial-gradient(#004d40, #000)'      // Green theme for vaccinations
    };

    // Apply the background gradient to the body
    document.body.style.background = backgroundGradients[dataset] || backgroundGradients['epidem'];

    // Update the reset button color
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        const buttonColors = {
            'epidem': '#8b0000',         // Dark red for epidemiology
            'hospitalizations': '#1a315a', // Dark blue for hospitalizations
            'vaccinations': '#004d40'      // Dark green for vaccinations
        };
        resetBtn.style.backgroundColor = buttonColors[dataset] || buttonColors['epidem'];

        // Update hover styles
        const hoverColors = {
            'epidem': '#a00000',         // Lighter red for hover
            'hospitalizations': '#2a4570', // Lighter blue for hover
            'vaccinations': '#00695c'      // Lighter green for hover
        };

        const styleId = 'reset-button-style';
        let styleEl = document.getElementById(styleId);

        // Remove existing style element if it exists
        if (styleEl) {
            styleEl.remove();
        }

        // Create new style element with updated hover color
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = `
            #resetBtn:hover {
                background-color: ${hoverColors[dataset] || hoverColors['epidem']} !important;
            }
        `;

        // Add the style element to the document head
        document.head.appendChild(styleEl);
    }

    this.log(`Updated colors for dataset: ${dataset}`);

    // If a country is selected, update its info
    if (this.selectedCountry) {
        const countryEl = document.getElementById(`country-${this.selectedCountry}`);
        if (countryEl) {
            const countryCode = countryEl.getAttribute('data-country-code');
            const countryData = dataService.getCountryData(countryCode);
            this.updateCountryInfoPanel(countryData);
        }
    }

    // Update the miniglobe if it exists
    const minimizedGlobe = document.getElementById('minimizedGlobe');
    if (minimizedGlobe && minimizedGlobe.style.display !== 'none') {
        // Recreate the miniglobe with updated colors
        this.miniGlobe.recreate();
        
        this.log(`Updated miniglobe colors for dataset: ${dataset}`);
    }
};
