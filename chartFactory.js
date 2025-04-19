// Chart Factory - A modular approach to creating visualizations
const ChartFactory = {
    // Core visualization methods
    createChart(container, countryCode, vizType, settings) {
        // Clear the container
        container.innerHTML = '';

        // Add loading state
        this.showLoading(container);

        // Get the data
        const data = this.prepareDataForCountry(countryCode);

        if (!data || !data.dates || data.dates.length === 0) {
            this.showError(container, "No data available for this country");
            return;
        }

        // Initialize chart controls if not provided
        if (!settings) {
            // Initialize chart controls and get initial settings
            settings = ChartControls.initialize(container, countryCode, vizType);
        }

        // Apply settings to filter data
        const filteredData = this.applySettings(data, settings);

        // Clear loading indicator
        container.innerHTML = '';

        // Create the appropriate chart
        switch (vizType) {
            case 'bar':
                this.barChart(container, filteredData);
                break;
            case 'line':
                this.lineChart(container, filteredData);
                break;
            case 'pie':
                this.pieChart(container, filteredData);
                break;
            case 'radar':
                this.radarChart(container, filteredData);
                break;
            case 'heatmap':
                this.heatmapChart(container, filteredData);
                break;
            default:
                this.showError(container, `Chart type "${vizType}" not supported`);
        }
    },

    // Apply user settings to filter data
    applySettings(data, settings) {
        // Create a copy of the data to avoid modifying the original
        const result = {
            ...data,
            columns: [],
            series: {}
        };

        // Include all columns but mark selected state
        result.columns = [...data.columns];
        result.series = {...data.series};

        // Add selection state to the result for rendering
        result.columnSelectionState = settings.selectedColumns || {};

        // Apply date filtering
        if (settings.dateMode === 'single') {
            // For single date mode, only include the selected date
            const dateIndex = Math.floor(settings.singleDate / 100 * (data.dates.length - 1));

            result.dates = [data.dates[dateIndex]];
            result.displayDates = [data.displayDates[dateIndex]];

            // Filter series data to only include the selected date
            result.columns.forEach(column => {
                result.series[column] = [data.series[column][dateIndex]];
            });
        }
        else if (settings.dateMode === 'range') {
            // For range mode, include dates within the selected range
            const startIndex = Math.floor(settings.dateRange.start / 100 * (data.dates.length - 1));
            const endIndex = Math.floor(settings.dateRange.end / 100 * (data.dates.length - 1));

            result.dates = data.dates.slice(startIndex, endIndex + 1);
            result.displayDates = data.displayDates.slice(startIndex, endIndex + 1);

            // Filter series data to only include dates in the range
            result.columns.forEach(column => {
                result.series[column] = data.series[column].slice(startIndex, endIndex + 1);
            });
        }

        return result;
    },

    // Data preparation
    prepareDataForCountry(countryCode) {
        const dataService = window.globeInstance.dataService;

        // Validate we have a data service
        if (!dataService || !dataService.availableDates) {
            console.error("Data service or available dates not found");
            return null;
        }

        // Get current dataset name
        const currentDataset = dataService.currentDataset;
        const columns = dataService.availableColumns[currentDataset] || [];

        if (columns.length === 0) {
            console.warn("No columns available for dataset", currentDataset);
            return null;
        }

        // Initialize the result structure
        const result = {
            countryCode,
            countryName: dataService.getCountryName(countryCode),
            dates: [],
            displayDates: [], // formatted dates
            columns,
            series: {}
        };

        // Initialize series data
        columns.forEach(col => {
            result.series[col] = [];
        });

        // FIXED: Access indexed data directly using the correct structure
        const normalizedKey = countryCode.toLowerCase();

        // Log for debugging
        console.log(`Trying to access data for country ${normalizedKey} in dataset ${currentDataset}`);
        console.log(`Available indexed datasets:`, Object.keys(dataService.indexedData));

        // Check if we have data for this country in the current dataset
        if (dataService.indexedData[currentDataset] && dataService.indexedData[currentDataset][normalizedKey]) {
            // Get all dates available for this country
            const countryDates = Object.keys(dataService.indexedData[currentDataset][normalizedKey]).sort();
            console.log(`Found ${countryDates.length} dates for country ${normalizedKey}`);

            // Use these dates to collect data
            countryDates.forEach(date => {
                const countryDateData = dataService.indexedData[currentDataset][normalizedKey][date];

                // Check if there's actual data for this date
                const hasData = columns.some(col =>
                    col in countryDateData &&
                    countryDateData[col] !== null &&
                    countryDateData[col] !== undefined
                );

                if (hasData) {
                    result.dates.push(date);
                    result.displayDates.push(dataService.formatDate(date));

                    // For each column, add the value (or null)
                    columns.forEach(col => {
                        const value = countryDateData[col];
                        result.series[col].push(value);
                    });
                }
            });
        } else {
            // Try using sample data if available
            console.log(`No indexed data found for ${normalizedKey}. Trying to generate sample data...`);

            // For demo purposes, generate some sample data if there's nothing
            if (result.dates.length === 0 && dataService.useSampleData) {
                const today = new Date();
                for (let i = 30; i >= 0; i--) {
                    const date = new Date();
                    date.setDate(today.getDate() - i);
                    const dateStr = date.toISOString().split('T')[0];

                    result.dates.push(dateStr);
                    result.displayDates.push(dataService.formatDate(dateStr));

                    columns.forEach(col => {
                        // Generate random sample data based on column name
                        let value = Math.floor(Math.random() * 10000 * (1 + Math.sin(i/3)));

                        // Adjust based on column name characteristics
                        if (col.includes('cumulative')) {
                            value = 50000 + i * 5000 + Math.random() * 10000;
                        }
                        else if (col.includes('deceased') || col.includes('death')) {
                            value = Math.floor(value / 20); // Lower death counts
                        }

                        result.series[col].push(value);
                    });
                }
                console.log("Generated sample visualization data");
            }
        }

        console.log(`Prepared data for ${countryCode}: ${result.dates.length} dates across ${columns.length} columns`);
        return result;
    },

    // Helper UI methods
    showLoading(container) {
        const loader = document.createElement('div');
        loader.className = 'chart-loader';
        loader.innerHTML = `
            <div class="spinner"></div>
            <div class="loading-text">Loading data...</div>
        `;
        container.appendChild(loader);
    },

    showError(container, message) {
        container.innerHTML = `
            <div class="chart-error">
                <div class="error-icon">⚠️</div>
                <div class="error-message">${message}</div>
                <div class="error-suggestion">Try selecting a different country or visualization type.</div>
            </div>
        `;
    },

    // Helper methods for formatting
    formatValue(value) {
        if (value === null || value === undefined) return 'N/A';
        return value >= 1000000 ?
            `${(value / 1000000).toFixed(2)}M` :
            value >= 1000 ?
            `${(value / 1000).toFixed(1)}K` :
            value.toLocaleString();
    },

    formatTickValue(value) {
        if (value === 0) return '0';
        return value >= 1000000 ?
            `${(value / 1000000).toFixed(1)}M` :
            value >= 1000 ?
            `${(value / 1000).toFixed(1)}K` :
            value;
    }
};

// Chart implementations are loaded via script tags in index.html
