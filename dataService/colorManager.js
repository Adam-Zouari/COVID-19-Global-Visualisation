// Color management functionality

export async function indexAllData() {
    this.log("Indexing data for faster access");

    // Clear any existing indexed data
    this.indexedData = {
        epidem: {},
        hospitalizations: {},
        vaccinations: {}
    };

    // Function to index a dataset
    const indexDataset = (dataset, datasetName) => {
        return new Promise(resolve => {
            // Create an index for each country and date
            dataset.forEach(record => {
                if (!record.country_key || !record.date) return;

                const countryKey = record.country_key.toLowerCase();

                // Create country entry if not exists
                if (!this.indexedData[datasetName][countryKey]) {
                    this.indexedData[datasetName][countryKey] = {};
                }

                // Store the record indexed by date
                this.indexedData[datasetName][countryKey][record.date] = record;
            });

            // Report indexing progress
            const countries = Object.keys(this.indexedData[datasetName]).length;
            this.log(`Indexed ${datasetName} data: ${countries} countries`);

            resolve();
        });
    };

    // Process all datasets using Promise.all for parallel processing
    await Promise.all([
        indexDataset(this.epidemData, 'epidem'),
        indexDataset(this.hospitalizationsData, 'hospitalizations'),
        indexDataset(this.vaccinationsData, 'vaccinations')
    ]);

    this.log("Data indexing complete");
}

export async function precalculateColors() {
    this.log("Pre-calculating colors for all metrics");

    // Clear any existing color cache
    this.colorCache = {
        epidem: {},
        hospitalizations: {},
        vaccinations: {}
    };

    // First calculate global min/max values for each dataset and column
    // This ensures color consistency across all dates
    this.globalDataRanges = {
        epidem: {},
        hospitalizations: {},
        vaccinations: {}
    };

    // Calculate global data ranges first
    for (const datasetName of ['epidem', 'hospitalizations', 'vaccinations']) {
        document.getElementById('dataStatus').textContent =
            `Analyzing ${datasetName} data ranges...`;

        // For each column in this dataset
        for (const column of this.availableColumns[datasetName]) {
            // Get all non-zero values across all dates for this column
            let allValues = [];

            for (const date of this.availableDates) {
                const dataForDate = this.getDataForDate(datasetName, date);

                const values = dataForDate
                    .map(d => {
                        const value = d[column];
                        return value ? parseFloat(value) : 0;
                    })
                    .filter(v => !isNaN(v) && v > 0);

                allValues = allValues.concat(values);
            }

            if (allValues.length === 0) {
                this.globalDataRanges[datasetName][column] = { min: 0, max: 1 };
                continue;
            }

            // Calculate statistics for better scaling
            const max = d3.max(allValues);
            const min = d3.min(allValues);
            const q1 = d3.quantile(allValues.sort(d3.ascending), 0.25);
            const q3 = d3.quantile(allValues.sort(d3.ascending), 0.75);

            // Check if we have extreme outliers
            const iqr = q3 - q1;
            const upperOutlierThreshold = q3 + 1.5 * iqr;

            // Determine domain max (with outlier handling)
            let domainMax;
            if (max > upperOutlierThreshold && upperOutlierThreshold > 0) {
                domainMax = upperOutlierThreshold;
                this.log(`Using outlier-adjusted domain max for ${datasetName}.${column}: ${domainMax} (original max: ${max})`);
            } else {
                domainMax = max;
            }

            // Store the global range
            this.globalDataRanges[datasetName][column] = {
                min: 0,
                max: domainMax,
                originalMax: max,
                q1: q1,
                q3: q3
            };

            this.log(`Global range for ${datasetName}.${column}: [0, ${domainMax}]`);
        }
    }

    // Function to calculate colors for a dataset, column, and date
    const calculateColorsForDate = (datasetName, column, date) => {
        return new Promise(resolve => {
            // Get data for this date
            const dataForDate = this.getDataForDate(datasetName, date);

            if (dataForDate.length === 0) {
                resolve();
                return;
            }

            // Get the global range for this dataset and column
            const range = this.globalDataRanges[datasetName][column];
            if (!range) {
                resolve();
                return;
            }

            // Choose color scheme based on dataset - using even lighter base colors to black
            let colorInterpolator;
            if (datasetName === 'epidem') {
                colorInterpolator = d3.interpolateRgb('#cc5555', '#000000');
            } else if (datasetName === 'hospitalizations') {
                colorInterpolator = d3.interpolateRgb('#6688cc', '#000000');
            } else if (datasetName === 'vaccinations') {
                colorInterpolator = d3.interpolateRgb('#44cc99', '#000000');
            }

            // Power scale exponent for better visual distribution
            const exponent = 0.5;

            // Cache colors for each country
            if (!this.colorCache[datasetName][column]) {
                this.colorCache[datasetName][column] = {};
            }

            if (!this.colorCache[datasetName][column][date]) {
                this.colorCache[datasetName][column][date] = {};
            }

            // Calculate and cache color for each country using the GLOBAL range
            Object.keys(this.indexedData[datasetName]).forEach(countryKey => {
                const countryData = this.indexedData[datasetName][countryKey][date];
                if (!countryData) return;

                const value = countryData[column];
                if (!value) return;

                const parsedValue = parseFloat(value);
                if (isNaN(parsedValue) || parsedValue <= 0) return;

                // Calculate using the global range - this ensures consistent colors across dates
                const normalizedValue = Math.min(1, parsedValue / range.max);
                const scaledValue = Math.pow(normalizedValue, exponent);
                this.colorCache[datasetName][column][date][countryKey] = colorInterpolator(scaledValue);
            });

            resolve();
        });
    };

    // Now process all combinations with our global ranges
    for (const datasetName of ['epidem', 'hospitalizations', 'vaccinations']) {
        for (const column of this.availableColumns[datasetName]) {
            // Update status indicator to show progress
            document.getElementById('dataStatus').textContent =
                `Calculating colors: ${datasetName} - ${column}...`;

            // Process dates in smaller batches to avoid UI freezing
            const batchSize = 10;
            for (let i = 0; i < this.availableDates.length; i += batchSize) {
                const batch = this.availableDates.slice(i, i + batchSize);
                await Promise.all(batch.map(date =>
                    calculateColorsForDate(datasetName, column, date)
                ));
            }
        }
    }

    this.log("Color pre-calculation complete");
}

export function getCachedColor(countryKey, date) {
    if (!countryKey) return null;

    const normalizedKey = countryKey.toLowerCase();

    try {
        // Check if we have a cached color
        if (
            this.colorCache[this.currentDataset] &&
            this.colorCache[this.currentDataset][this.currentColumn] &&
            this.colorCache[this.currentDataset][this.currentColumn][date] &&
            this.colorCache[this.currentDataset][this.currentColumn][date][normalizedKey]
        ) {
            return this.colorCache[this.currentDataset][this.currentColumn][date][normalizedKey];
        }

        // If no cached color, return null to use default
        return null;
    } catch (e) {
        console.error('Error retrieving cached color:', e);
        return null;
    }
}

export function getCountryColor(countryKey) {
    if (!countryKey) return this.getDefaultColor(); // Default color based on dataset

    const normalizedKey = countryKey.toLowerCase();
    const cachedColor = this.getCachedColor(normalizedKey, this.currentDate);

    if (cachedColor) {
        return cachedColor;
    }

    // If no cached color, fall back to calculating it
    try {
        const value = this.getDataValue(countryKey);

        if (!value || value === 0) {
            return this.getDefaultColor(); // Default for no data based on dataset
        }

        const colorScale = this.getColorScale();
        // Log color values for debugging
        if (['us', 'gb', 'fr', 'de', 'jp'].includes(normalizedKey)) {
            console.log(`Dynamic color for ${normalizedKey}: value=${value}, color=${colorScale(value)}`);
        }
        return colorScale(value);
    } catch (e) {
        console.error('Error calculating country color:', e);
        return this.getDefaultColor(); // Default on error based on dataset
    }
}

export function getDefaultColor() {
    // Return the background color for the current dataset
    if (this.currentDataset === 'epidem') {
        return '#4a0000'; // Red background for epidemiology
    } else if (this.currentDataset === 'hospitalizations') {
        return '#1a315a'; // Blue background for hospitalizations
    } else if (this.currentDataset === 'vaccinations') {
        return '#004d40'; // Green background for vaccinations
    }
    return '#4a0000'; // Default to epidem color
}

export function getColorScale() {
    // Use the pre-calculated global range if available
    if (this.globalDataRanges &&
        this.globalDataRanges[this.currentDataset] &&
        this.globalDataRanges[this.currentDataset][this.currentColumn]) {

        const range = this.globalDataRanges[this.currentDataset][this.currentColumn];

        // Choose color scheme based on current dataset - using even lighter base colors to black
        let colorInterpolator;
        if (this.currentDataset === 'epidem') {
            colorInterpolator = d3.interpolateRgb('#cc5555', '#000000');
        } else if (this.currentDataset === 'hospitalizations') {
            colorInterpolator = d3.interpolateRgb('#6688cc', '#000000');
        } else if (this.currentDataset === 'vaccinations') {
            colorInterpolator = d3.interpolateRgb('#44cc99', '#000000');
        }

        // Create a power scale with adjustable exponent for better visual scaling
        const exponent = 0.5;

        return d3.scaleSequential()
            .domain([0, range.max])
            .interpolator(value => {
                // Apply power scale for better visual distribution
                const normalizedValue = Math.min(1, value / range.max);
                const scaledValue = Math.pow(normalizedValue, exponent);
                return colorInterpolator(scaledValue);
            });
    }

    // Fall back to original method if global ranges aren't available
    const dataset = this.getAllCountriesDataForCurrentDate();

    if (!dataset.length || !this.currentColumn) {
        this.log("Using default color scale (no data)");
        return d3.scaleSequential(d3.interpolateGreens).domain([0, 1]);
    }

    // Extract values for current column
    const values = dataset.map(d => {
        const value = d[this.currentColumn];
        return value ? parseFloat(value) : 0;
    }).filter(v => !isNaN(v) && v > 0); // Filter out zero values for better scaling

    if (!values.length) {
        this.log("Using default color scale (no valid values)");
        return d3.scaleSequential(d3.interpolateGreens).domain([0, 1]);
    }

    // Calculate statistics for better scaling
    const max = d3.max(values);
    const min = d3.min(values);
    const median = d3.median(values);
    const q1 = d3.quantile(values.sort(d3.ascending), 0.25);
    const q3 = d3.quantile(values.sort(d3.ascending), 0.75);

    console.log(`Color scale stats for ${this.currentColumn}: min=${min}, Q1=${q1}, median=${median}, Q3=${q3}, max=${max}`);

    // Choose domain based on data distribution
    // Use quantile-based domain to handle skewed distributions better
    let domainMax;

    // Check if we have extreme outliers
    const iqr = q3 - q1;
    const upperOutlierThreshold = q3 + 1.5 * iqr;

    if (max > upperOutlierThreshold && upperOutlierThreshold > 0) {
        // If we have outliers, cap at the upper outlier threshold for better visualization
        domainMax = upperOutlierThreshold;
        console.log(`Using outlier-adjusted domain max: ${domainMax} (original max: ${max})`);
    } else {
        domainMax = max;
    }

    // Choose color scheme based on current dataset - using even lighter base colors to black
    let colorInterpolator;
    if (this.currentDataset === 'epidem') {
        // Virus data: even lighter red to black gradient
        colorInterpolator = d3.interpolateRgb('#cc5555', '#000000');
    } else if (this.currentDataset === 'hospitalizations') {
        // Hospital data: even lighter blue to black gradient
        colorInterpolator = d3.interpolateRgb('#6688cc', '#000000');
    } else if (this.currentDataset === 'vaccinations') {
        // Vaccination data: even lighter green to black gradient
        colorInterpolator = d3.interpolateRgb('#44cc99', '#000000');
    }

    // Create a power scale with adjustable exponent for better visual scaling
    // Lower exponent (0.5) gives more emphasis to lower values
    // Higher exponent (2) gives more emphasis to higher values
    const exponent = 0.5; // Emphasize lower values for better visualization

    return d3.scaleSequential()
        .domain([0, domainMax])
        .interpolator(value => {
            // Apply power scale for better visual distribution
            const normalizedValue = Math.min(1, value / domainMax);
            const scaledValue = Math.pow(normalizedValue, exponent);
            return colorInterpolator(scaledValue);
        });
}
