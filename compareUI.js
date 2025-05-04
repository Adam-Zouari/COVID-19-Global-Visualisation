// Compare UI - User interface components for the compare mode
const CompareUI = {
    // Show the compare panel
    show() {
        console.log("Showing compare panel");

        // Get the panel
        const comparePanel = document.getElementById('comparePanel');
        if (!comparePanel) {
            console.error("Compare panel not found");
            return;
        }

        // Show the panel
        comparePanel.style.display = 'flex';
        comparePanel.classList.add('panel-appearing');

        // Initialize date range slider
        this.initializeDateRangeSlider();

        // Update the country list (this will also set up the header with title and + button)
        this.updateCountryList();

        console.log("Compare panel displayed");
    },

    // Hide the compare panel
    hide() {
        console.log("Hiding compare panel");

        const comparePanel = document.getElementById('comparePanel');
        if (comparePanel) {
            comparePanel.style.display = 'none';
            comparePanel.classList.remove('panel-appearing');
            console.log("Compare panel hidden");
        } else {
            console.error("Compare panel not found for hiding");
        }
    },

    // Create the compare panel - REMOVED as we're using the HTML in index.html
    createComparePanel() {
        // We're now using the panel directly from index.html
        // No need to create it dynamically
        console.log("Using compare panel from index.html");
    },

    // Initialize the date range slider
    initializeDateRangeSlider() {
        console.log("Initializing date range slider");

        // This would typically use a library like noUiSlider
        // For simplicity, we'll use a basic implementation with two range inputs
        const dateRangeSlider = document.getElementById('dateRangeSlider');
        if (!dateRangeSlider) {
            console.error("Date range slider element not found");
            return;
        }

        dateRangeSlider.innerHTML = `
            <input type="range" id="startDateSlider" min="0" max="100" value="0" class="date-slider">
            <input type="range" id="endDateSlider" min="0" max="100" value="100" class="date-slider">
        `;

        // Add event listeners
        const startSlider = document.getElementById('startDateSlider');
        const endSlider = document.getElementById('endDateSlider');
        const startLabel = document.getElementById('startDateLabel');
        const endLabel = document.getElementById('endDateLabel');

        if (startSlider && endSlider) {
            // Update labels with formatted dates
            const updateLabels = () => {
                if (window.globeInstance && window.globeInstance.dataService) {
                    const dataService = window.globeInstance.dataService;
                    const dates = dataService.availableDates;

                    if (dates && dates.length > 0) {
                        const startIdx = Math.floor(dates.length * (startSlider.value / 100));
                        const endIdx = Math.floor(dates.length * (endSlider.value / 100));

                        startLabel.textContent = dataService.formatDate(dates[startIdx]);
                        endLabel.textContent = dataService.formatDate(dates[endIdx]);
                    }
                }
            };

            // Initial update
            updateLabels();

            // Add direct onchange and oninput attributes
            startSlider.oninput = function() {
                console.log("Start slider input:", this.value);
                // Ensure start doesn't go past end
                if (parseInt(this.value) > parseInt(endSlider.value)) {
                    this.value = endSlider.value;
                }
                updateLabels();
            };

            startSlider.onchange = function() {
                console.log("Start slider change:", this.value);
                CompareMode.updateDateRange(parseInt(this.value), parseInt(endSlider.value));
            };

            endSlider.oninput = function() {
                console.log("End slider input:", this.value);
                // Ensure end doesn't go before start
                if (parseInt(this.value) < parseInt(startSlider.value)) {
                    this.value = startSlider.value;
                }
                updateLabels();
            };

            endSlider.onchange = function() {
                console.log("End slider change:", this.value);
                CompareMode.updateDateRange(parseInt(startSlider.value), parseInt(this.value));
            };
        } else {
            console.error("Date sliders not found");
        }
    },

    // Add event listeners to the compare panel
    addEventListeners() {
        console.log("Adding event listeners to compare panel");

        // Exit compare mode button
        const exitBtn = document.getElementById('exitCompareBtn');
        if (exitBtn) {
            console.log("Adding click listener to exit button");
            exitBtn.onclick = () => {
                console.log("Exit compare mode button clicked");
                CompareMode.exit();
            };
        } else {
            console.error("Exit button not found");
        }

        // Display mode buttons
        const separateBtn = document.getElementById('separateChartsBtn');
        const combinedBtn = document.getElementById('combinedChartBtn');

        if (separateBtn && combinedBtn) {
            separateBtn.onclick = () => {
                console.log("Separate charts button clicked");
                separateBtn.classList.add('active');
                combinedBtn.classList.remove('active');
                CompareMode.changeDisplayMode('separate');
            };

            combinedBtn.onclick = () => {
                console.log("Combined chart button clicked");
                combinedBtn.classList.add('active');
                separateBtn.classList.remove('active');
                CompareMode.changeDisplayMode('combined');
            };
        } else {
            console.error("Display mode buttons not found");
        }

        // Chart type selector
        const chartTypeSelect = document.getElementById('compareChartType');
        if (chartTypeSelect) {
            chartTypeSelect.onchange = () => {
                console.log("Chart type changed to:", chartTypeSelect.value);
                CompareMode.changeChartType(chartTypeSelect.value);
            };
        } else {
            console.error("Chart type selector not found");
        }

        // Add country button
        const addCountryBtn = document.getElementById('addCountryBtn');
        if (addCountryBtn) {
            addCountryBtn.onclick = () => {
                console.log("Add country button clicked");
                openSearch();
            };
        } else {
            console.error("Add country button not found");
        }
    },

    // Update the list of selected countries
    updateCountryList() {
        console.log("Updating country list with countries:", CompareMode.state.countries);

        // Update the header countries list
        const headerCountriesList = document.getElementById('headerCountriesList');
        if (!headerCountriesList) {
            console.error("Header countries list element not found");
            return;
        }

        // Clear the header list
        headerCountriesList.innerHTML = '';

        // If no countries, show title and add button
        if (CompareMode.state.countries.length === 0) {
            // Add title and + button to header
            headerCountriesList.innerHTML = '<h2>Compare Countries</h2>';

            // Add the + button to header
            const addBtn = document.createElement('button');
            addBtn.id = 'addCountryBtn';
            addBtn.className = 'add-country-btn';
            addBtn.innerHTML = '+';
            addBtn.onclick = function() {
                openSearch();
            };
            headerCountriesList.appendChild(addBtn);
            return;
        }

        // Add each country to the header list
        CompareMode.state.countries.forEach(countryCode => {
            const countryData = window.globeInstance.dataService.getCountryData(countryCode);
            if (!countryData) {
                console.error("Country data not found for code:", countryCode);
                return;
            }

            console.log("Adding country to header:", countryData.countryName);

            // Add to header list
            const headerCountryItem = document.createElement('div');
            headerCountryItem.className = 'header-country-item';
            headerCountryItem.innerHTML = `
                <img src="https://flagcdn.com/${countryCode.toLowerCase()}.svg" alt="${countryData.countryName}" class="header-country-flag">
                <span>${countryData.countryName}</span>
                <button class="remove-country-btn" data-country="${countryCode}">×</button>
            `;

            // Add event listener directly to the remove button
            const removeBtn = headerCountryItem.querySelector('.remove-country-btn');
            if (removeBtn) {
                removeBtn.onclick = function() {
                    console.log("Remove button clicked for country:", countryCode);
                    CompareMode.removeCountry(countryCode);
                };
            }

            headerCountriesList.appendChild(headerCountryItem);
        });

        // Add the + button to header after all countries
        const addBtn = document.createElement('button');
        addBtn.id = 'addCountryBtn';
        addBtn.className = 'add-country-btn';
        addBtn.innerHTML = '+';
        addBtn.onclick = function() {
            openSearch();
        };
        headerCountriesList.appendChild(addBtn);
    },

    // Show message when no countries are selected
    showNoCountriesMessage() {
        const chartContainer = document.getElementById('compareChartContainer');
        if (!chartContainer) return;

        chartContainer.innerHTML = `
            <div class="no-countries-message">
                <p>No countries selected for comparison.</p>
                <p>Click "+" in the header to select countries to compare.</p>
            </div>
        `;
    },

    // Update the compare button color based on dataset
    updateCompareButtonColor(datasetKey) {
        const compareBtn = document.getElementById('compareBtn');
        if (!compareBtn) return;

        // Define colors for each dataset (matching the Reset View button colors)
        const buttonColors = {
            'epidem': '#8b0000',            // Dark red for epidemiology
            'hospitalizations': '#1a315a',  // Dark blue for hospitalizations
            'vaccinations': '#004d40'       // Dark green for vaccinations
        };

        // Define hover colors for each dataset
        const hoverColors = {
            'epidem': '#a00000',            // Lighter red for hover
            'hospitalizations': '#2a4570',  // Lighter blue for hover
            'vaccinations': '#00695c'       // Lighter green for hover
        };

        // Apply the color without transition
        compareBtn.style.backgroundColor = buttonColors[datasetKey] || '#8b0000';

        // Update hover style
        const styleId = 'compare-button-style';
        let styleEl = document.getElementById(styleId);

        // Remove existing style element if it exists
        if (styleEl) {
            styleEl.remove();
        }

        // Create new style element with updated hover color
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = `
            #compareBtn:hover {
                background-color: ${hoverColors[datasetKey] || hoverColors['epidem']} !important;
            }
        `;

        // Add the style element to the document head
        document.head.appendChild(styleEl);
    }
};
