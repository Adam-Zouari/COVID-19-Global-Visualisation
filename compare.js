// Compare Mode - Main functionality for comparing multiple countries
window.CompareMode = {
    // State management
    state: {
        active: false,
        countries: [], // Array of country codes to compare
        displayMode: 'separate', // 'separate' or 'combined'
        chartType: 'bar', // Default chart type
        dateRange: {
            start: 0,
            end: 100
        },
        selectedColumn: null // Selected data column for combined chart
    },

    // Enter compare mode
    enter() {
        console.log("Entering compare mode");

        // Set state to active
        this.state.active = true;

        // Hide all UI elements except header
        this.hideMainUI();

        // Show compare panel
        CompareUI.show();

        // Update the compare panel colors based on current dataset
        CompareUI.updateCompareUIColors(window.globeInstance.dataService.currentDataset);

        // If no countries are selected, add the currently selected country if any
        if (this.state.countries.length === 0) {
            console.log("No countries in compare list, checking for selected country");

            // If a country is currently selected in the globe, add it as the first country
            if (window.globeInstance && window.globeInstance.selectedCountry) {
                const countryEl = document.getElementById(`country-${window.globeInstance.selectedCountry}`);
                const countryCode = countryEl ? countryEl.getAttribute('data-country-code') : null;

                console.log("Found selected country:", countryCode);

                if (countryCode) {
                    this.addCountry(countryCode);
                }
            } else {
                console.log("No country currently selected");
            }

            // Show the "no countries" message
            this.updateComparisonView();
        } else {
            // Update the comparison view with current countries
            console.log("Countries already in list:", this.state.countries);
            this.updateComparisonView();
        }
    },

    // Exit compare mode
    exit() {
        console.log("Exiting compare mode");

        // Set state to inactive
        this.state.active = false;

        // Hide compare panel
        CompareUI.hide();

        // Show main UI first to ensure elements are visible
        this.showMainUI();

        // Make sure the globe is properly displayed
        const globe = document.getElementById('globe');
        if (globe) {
            // Force display and opacity
            globe.style.display = 'block';
            globe.style.opacity = '1';
        }

        // Reset the globe view with a small delay to ensure DOM is updated
        setTimeout(() => {
            if (window.globeInstance) {
                // Ensure the globe is visible before resetting
                if (globe && globe.style.display === 'block') {
                    console.log("Resetting globe view");
                    window.globeInstance.resetView();
                }
            }
        }, 100);

        // Clear the countries list
        this.state.countries = [];
    },

    // Hide main UI elements
    hideMainUI() {
        // Hide globe
        const globe = document.getElementById('globe');
        if (globe) globe.style.display = 'none';

        // Hide country info panel
        const countryInfo = document.getElementById('countryInfo');
        if (countryInfo) countryInfo.style.display = 'none';

        // Hide control panel
        const controlPanel = document.querySelector('.control-panel');
        if (controlPanel) controlPanel.style.display = 'none';

        // Hide visualization panel if visible
        const vizPanel = document.getElementById('visualizationPanel');
        if (vizPanel) vizPanel.style.display = 'none';

        // Hide minimized globe if visible
        const miniGlobe = document.getElementById('minimizedGlobe');
        if (miniGlobe) miniGlobe.style.display = 'none';

        // Hide data status text
        const dataStatus = document.getElementById('dataStatus');
        if (dataStatus) dataStatus.style.display = 'none';
    },

    // Show main UI elements
    showMainUI() {
        // Show globe with proper visibility
        const globe = document.getElementById('globe');
        if (globe) {
            // Make sure the globe is visible
            globe.style.display = 'block';
            globe.style.opacity = '1';
            globe.classList.remove('globe-animating');
            globe.classList.remove('globe-restoring');

            // Ensure the globe SVG is visible
            const globeSvg = globe.querySelector('svg');
            if (globeSvg) {
                globeSvg.style.display = 'block';
                globeSvg.style.opacity = '1';
            }
        }

        // Show control panel
        const controlPanel = document.querySelector('.control-panel');
        if (controlPanel) controlPanel.style.display = 'flex';

        // Show data status text
        const dataStatus = document.getElementById('dataStatus');
        if (dataStatus) dataStatus.style.display = 'block';

        // Add a small delay to ensure the globe is properly rendered
        setTimeout(() => {
            if (window.globeInstance && window.globeInstance.renderCountriesByDepth) {
                window.globeInstance.renderCountriesByDepth();
            }
        }, 50);
    },

    // Add a country to the comparison
    addCountry(countryCode) {
        console.log("Adding country to comparison:", countryCode);

        // Check if country is already in the list
        if (this.state.countries.includes(countryCode)) {
            console.log("Country already in list, skipping");
            return;
        }

        // Add country to the list
        this.state.countries.push(countryCode);
        console.log("Country added, countries list now:", this.state.countries);

        // Update the UI
        CompareUI.updateCountryList();

        // Update the comparison view
        this.updateComparisonView();
    },

    // Remove a country from the comparison
    removeCountry(countryCode) {
        // Remove country from the list
        this.state.countries = this.state.countries.filter(code => code !== countryCode);

        // Update the UI
        CompareUI.updateCountryList();

        // Update the comparison view
        this.updateComparisonView();
    },

    // Change display mode (separate or combined charts)
    changeDisplayMode(mode) {
        console.log("Changing display mode to:", mode);

        // Update state
        this.state.displayMode = mode;

        // Update button states
        const separateBtn = document.getElementById('separateChartsBtn');
        const combinedBtn = document.getElementById('combinedChartBtn');

        if (separateBtn && combinedBtn) {
            if (mode === 'separate') {
                separateBtn.classList.add('active');
                combinedBtn.classList.remove('active');

                // Hide data column selector in separate mode
                const dataColumnSelector = document.getElementById('data-column-selector');
                if (dataColumnSelector) {
                    dataColumnSelector.style.display = 'none';
                }
            } else {
                combinedBtn.classList.add('active');
                separateBtn.classList.remove('active');

                // Show data column selector in combined mode
                const dataColumnSelector = document.getElementById('data-column-selector');
                if (dataColumnSelector) {
                    dataColumnSelector.style.display = 'flex';
                }
            }
        }

        // Update the comparison view
        this.updateComparisonView();
    },

    // Change chart type
    changeChartType(type) {
        console.log("Changing chart type to:", type);

        // Update state
        this.state.chartType = type;

        // Update select element if it doesn't match
        const chartTypeSelect = document.getElementById('compareChartType');
        if (chartTypeSelect && chartTypeSelect.value !== type) {
            chartTypeSelect.value = type;
        }

        // Update date sliders based on chart type
        CompareUI.updateDateSliders(type);

        // Update the comparison view
        this.updateComparisonView();
    },

    // Update date range (for bar and line charts)
    updateDateRange(start, end) {
        // Update state
        this.state.dateRange.start = start;
        this.state.dateRange.end = end;

        // Update the comparison view
        this.updateComparisonView();
    },

    // Update single date (for pie and radar charts)
    updateSingleDate(value) {
        console.log("Updating single date to:", value);

        // For pie and radar charts, we use the same value for both start and end
        // This ensures compatibility with existing code that uses dateRange
        this.state.dateRange.start = value;
        this.state.dateRange.end = value;

        // Update the comparison view
        this.updateComparisonView();
    },

    // Update the comparison view based on current state
    updateComparisonView() {
        console.log("Updating comparison view with mode:", this.state.displayMode, "chart type:", this.state.chartType);

        // If no countries selected, show message
        if (this.state.countries.length === 0) {
            console.log("No countries selected, showing message");
            CompareUI.showNoCountriesMessage();
            return;
        }

        // Clear the chart container
        const chartContainer = document.getElementById('compareChartContainer');
        if (!chartContainer) {
            console.error("Chart container not found");
            return;
        }

        console.log("Clearing chart container");
        chartContainer.innerHTML = '';

        // Create charts based on display mode
        if (this.state.displayMode === 'separate') {
            console.log("Creating separate charts");
            this.createSeparateCharts();
        } else {
            console.log("Creating combined chart");
            this.createCombinedChart();
        }
    },

    // Create separate charts for each country
    createSeparateCharts() {
        const chartContainer = document.getElementById('compareChartContainer');
        if (!chartContainer) return;

        // Create a container for the charts
        const chartsWrapper = document.createElement('div');
        chartsWrapper.className = 'compare-charts-wrapper';

        // Determine if we should use vertical layout (3+ countries)
        const countryCount = this.state.countries.length;
        if (countryCount >= 3) {
            chartsWrapper.classList.add('vertical-layout');
            console.log(`Using vertical layout for ${countryCount} countries`);
        } else {
            console.log(`Using horizontal layout for ${countryCount} countries`);
        }

        chartContainer.appendChild(chartsWrapper);

        // Check if we're using pie or radar chart
        const isPieOrRadar = (this.state.chartType === 'pie' || this.state.chartType === 'radar');

        // Create a chart for each country
        this.state.countries.forEach(countryCode => {
            // Create a container for this country's chart
            const countryChartContainer = document.createElement('div');
            countryChartContainer.className = 'country-chart-container';
            chartsWrapper.appendChild(countryChartContainer);

            // Get country data
            const countryData = window.globeInstance.dataService.getCountryData(countryCode);
            if (!countryData) return;

            // Create chart title with country name
            const chartTitle = document.createElement('div');
            chartTitle.className = 'chart-title';

            // Add flag and country name to the title
            chartTitle.innerHTML = `
                <img src="https://flagcdn.com/${countryCode.toLowerCase()}.svg" alt="${countryData.countryName}" class="chart-title-flag">
                <span>${countryData.countryName}</span>
            `;

            countryChartContainer.appendChild(chartTitle);

            // Create chart container
            const chartDiv = document.createElement('div');
            chartDiv.className = 'chart-div';
            countryChartContainer.appendChild(chartDiv);

            // Create chart settings based on chart type
            let settings;

            if (isPieOrRadar) {
                // For pie and radar charts, use single date mode
                settings = {
                    selectedColumns: {},
                    dateMode: 'single',
                    dateRange: this.state.dateRange, // For compatibility
                    singleDate: this.state.dateRange.end // Use the end value as the single date
                };
            } else {
                // For other charts, use date range mode
                settings = {
                    selectedColumns: {},
                    dateMode: 'range',
                    dateRange: this.state.dateRange,
                    singleDate: 100 // Default value, not used in range mode
                };
            }

            ChartFactory.createChart(chartDiv, countryCode, this.state.chartType, settings);
        });
    },

    // Create a combined chart with all countries
    createCombinedChart() {
        const chartContainer = document.getElementById('compareChartContainer');
        if (!chartContainer) return;

        // Create a container for the combined chart
        const combinedChartContainer = document.createElement('div');
        combinedChartContainer.className = 'combined-chart-container';
        chartContainer.appendChild(combinedChartContainer);

        // Check if we're using pie or radar chart
        const isPieOrRadar = (this.state.chartType === 'pie' || this.state.chartType === 'radar');

        // Create settings based on chart type
        const settings = {
            dateRange: this.state.dateRange,
            selectedColumn: this.state.selectedColumn, // Pass the selected column if any
        };

        // For pie and radar charts, add a flag to indicate single date mode
        if (isPieOrRadar) {
            settings.singleDateMode = true;
            settings.singleDate = this.state.dateRange.end; // Use the end value as the single date
        }

        // Create chart using the compare chart factory
        CompareCharts.createCombinedChart(
            combinedChartContainer,
            this.state.countries,
            this.state.chartType,
            settings
        );
    },

    // Update selected column for combined chart
    updateSelectedColumn(column) {
        console.log("Updating selected column to:", column);

        // Update state
        this.state.selectedColumn = column;

        // Update the comparison view if in combined mode
        if (this.state.displayMode === 'combined') {
            this.updateComparisonView();
        }
    },

    // Reorder countries in the comparison
    reorderCountries(draggedCountryCode, targetCountryCode) {
        console.log(`Reordering countries: moving ${draggedCountryCode} to position of ${targetCountryCode}`);

        // Find the indices of both countries
        const draggedIndex = this.state.countries.indexOf(draggedCountryCode);
        const targetIndex = this.state.countries.indexOf(targetCountryCode);

        if (draggedIndex === -1 || targetIndex === -1) {
            console.error("Could not find one of the countries in the state array");
            return;
        }

        // Remove the dragged country from its current position
        this.state.countries.splice(draggedIndex, 1);

        // Insert it at the target position
        this.state.countries.splice(targetIndex, 0, draggedCountryCode);

        console.log("New country order:", this.state.countries);

        // Update the UI
        CompareUI.updateCountryList();

        // Update the comparison view
        this.updateComparisonView();
    },

    // Handle country selection from search
    handleCountrySelection(countryCode) {
        console.log("Handling country selection in compare mode:", countryCode);

        // Add country to comparison
        this.addCountry(countryCode);

        // Close search modal
        closeSearch();
    }
};

// Override the handleCountryClick function
document.addEventListener('DOMContentLoaded', () => {
    console.log("Setting up compare mode country selection handler");

    // Store the original country selection function
    window.originalHandleCountryClick = window.handleCountryClick || function(countryCode) {
        if (window.globeInstance) {
            window.globeInstance.goToCountry(countryCode);
        }
        closeSearch();
    };

    // Override the country selection function
    window.handleCountryClick = function(countryCode) {
        console.log("handleCountryClick called with:", countryCode, "Compare mode active:", CompareMode.state.active);

        // If compare mode is active, add country to comparison
        if (CompareMode.state.active) {
            CompareMode.handleCountrySelection(countryCode);
        } else {
            // Otherwise, use the original function
            window.originalHandleCountryClick(countryCode);
        }
    };
});
