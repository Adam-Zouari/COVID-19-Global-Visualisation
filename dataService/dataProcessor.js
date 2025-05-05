// Data processing functionality

export function processData() {
    this.log("Processing data");

    // Extract dates with actual data (not just all dates)
    const extractDatesWithData = (dataset) => {
        if (!dataset || !dataset.length) return [];

        // Count records with actual data for each date
        const dateDataCounts = {};

        dataset.forEach(d => {
            if (!d.date) return;

            // Check if this record has actual data
            let hasData = false;
            let dataCount = 0;

            for (const key in d) {
                if (key !== 'date' && key !== 'country_key' && key !== 'location_key' && d[key]) {
                    const value = parseFloat(d[key]);
                    if (!isNaN(value) && value > 0) {
                        hasData = true;
                        dataCount++;
                    }
                }
            }

            if (hasData) {
                if (!dateDataCounts[d.date]) {
                    dateDataCounts[d.date] = 0;
                }
                dateDataCounts[d.date] += dataCount;
            }
        });

        // Get dates where we have enough data points (at least 10 countries with data)
        return Object.entries(dateDataCounts)
            .filter(([date, count]) => count >= 10)
            .map(([date]) => date);
    };

    // Get dates with actual data from each dataset
    const epidemDates = extractDatesWithData(this.epidemData);
    const hospDates = extractDatesWithData(this.hospitalizationsData);
    const vaccinationDates = extractDatesWithData(this.vaccinationsData);

    this.log(`Found ${epidemDates.length} dates with data in epidem dataset`);
    this.log(`Found ${hospDates.length} dates with data in hospitalization dataset`);
    this.log(`Found ${vaccinationDates.length} dates with data in vaccination dataset`);

    // Combine and sort dates
    let combinedDates = [...new Set([...epidemDates, ...hospDates, ...vaccinationDates])].sort();

    // Remove any outlier dates (first/last dates if they're too far from others)
    if (combinedDates.length > 3) {
        // Check if the first date is too isolated
        const firstDate = new Date(combinedDates[0]);
        const secondDate = new Date(combinedDates[1]);
        const daysBetweenFirst = Math.abs((secondDate - firstDate) / (1000 * 60 * 60 * 24));

        // Check if the last date is too isolated
        const lastDate = new Date(combinedDates[combinedDates.length - 1]);
        const secondLastDate = new Date(combinedDates[combinedDates.length - 2]);
        const daysBetweenLast = Math.abs((lastDate - secondLastDate) / (1000 * 60 * 60 * 24));

        // If more than 30 days gap, consider it an outlier
        if (daysBetweenFirst > 30) {
            this.log(`First date ${combinedDates[0]} seems isolated, removing it`);
            combinedDates = combinedDates.slice(1);
        }

        if (daysBetweenLast > 30) {
            this.log(`Last date ${combinedDates[combinedDates.length-1]} seems isolated, removing it`);
            combinedDates = combinedDates.slice(0, -1);
        }
    }

    this.availableDates = combinedDates;
    this.log(`Combined to ${this.availableDates.length} unique dates with actual data`);

    // Extract available columns for each dataset (excluding date, country_key, and location_key)
    if (this.epidemData && this.epidemData.length > 0) {
        this.availableColumns.epidem = Object.keys(this.epidemData[0])
            .filter(col => col !== 'date' && col !== 'country_key' && col !== 'location_key');
        this.log(`Found ${this.availableColumns.epidem.length} columns in epidem data:`, this.availableColumns.epidem);
    } else {
        console.error("No epidem data records found!");
    }

    if (this.hospitalizationsData && this.hospitalizationsData.length > 0) {
        this.availableColumns.hospitalizations = Object.keys(this.hospitalizationsData[0])
            .filter(col => col !== 'date' && col !== 'country_key' && col !== 'location_key');
        this.log(`Found ${this.availableColumns.hospitalizations.length} columns in hospitalization data:`, this.availableColumns.hospitalizations);
    } else {
        console.error("No hospitalization data records found!");
    }

    if (this.vaccinationsData && this.vaccinationsData.length > 0) {
        this.availableColumns.vaccinations = Object.keys(this.vaccinationsData[0])
            .filter(col => col !== 'date' && col !== 'country_key' && col !== 'location_key');
        this.log(`Found ${this.availableColumns.vaccinations.length} columns in vaccination data:`, this.availableColumns.vaccinations);
    } else {
        console.error("No vaccination data records found!");
    }

    // Analyze some sample data for a few countries
    const sampleCountries = ['us', 'gb', 'fr', 'de'];
    this.log("Checking for data availability for sample countries:");

    for (const countryKey of sampleCountries) {
        const epidemCount = this.epidemData.filter(d =>
            d.country_key && d.country_key.toLowerCase() === countryKey.toLowerCase()
        ).length;

        const hospCount = this.hospitalizationsData.filter(d =>
            d.country_key && d.country_key.toLowerCase() === countryKey.toLowerCase()
        ).length;

        const vaccinationCount = this.vaccinationsData.filter(d =>
            d.country_key && d.country_key.toLowerCase() === countryKey.toLowerCase()
        ).length;

        this.log(`${countryKey} (${this.getCountryName(countryKey)}): Epidem: ${epidemCount}, Hospital: ${hospCount}, Vaccination: ${vaccinationCount}`);
    }

    // List the first few country_key values from the data to help debugging
    if (this.epidemData && this.epidemData.length > 0) {
        const uniqueKeys = [...new Set(this.epidemData.slice(0, 100).map(d => d.country_key))];
        this.log(`Sample country keys in epidem data: ${uniqueKeys.slice(0, 10).join(', ')}`);
    }
}

export function validateDataStructure() {
    if (this.epidemData.length > 0) {
        const firstRecord = this.epidemData[0];
        console.log("Epidem data fields:", Object.keys(firstRecord));

        // Check for required fields
        if (!('date' in firstRecord)) {
            console.error("Epidem data is missing 'date' field!");
        }

        // Check what field is used for country identification
        const possibleCountryFields = ['country_key', 'country_code', 'location_key', 'country', 'iso_code'];
        const foundCountryField = possibleCountryFields.find(field => field in firstRecord);

        if (foundCountryField && foundCountryField !== 'country_key') {
            console.log(`Found country identifier in field '${foundCountryField}' instead of 'country_key'`);
            // If we found a different field name, map it to country_key
            this.epidemData = this.epidemData.map(record => {
                return {
                    ...record,
                    country_key: record[foundCountryField]
                };
            });
            console.log("Mapped data to include 'country_key' field");
        } else if (!foundCountryField) {
            console.error("Could not find any country identifier field in epidem data!");
        }
    }

    if (this.hospitalizationsData.length > 0) {
        const firstRecord = this.hospitalizationsData[0];
        console.log("Hospitalization data fields:", Object.keys(firstRecord));

        // Check for required fields
        if (!('date' in firstRecord)) {
            console.error("Hospitalization data is missing 'date' field!");
        }

        // Check what field is used for country identification
        const possibleCountryFields = ['country_key', 'country_code', 'location_key', 'country', 'iso_code'];
        const foundCountryField = possibleCountryFields.find(field => field in firstRecord);

        if (foundCountryField && foundCountryField !== 'country_key') {
            console.log(`Found country identifier in field '${foundCountryField}' instead of 'country_key'`);
            // If we found a different field name, map it to country_key
            this.hospitalizationsData = this.hospitalizationsData.map(record => {
                return {
                    ...record,
                    country_key: record[foundCountryField]
                };
            });
            console.log("Mapped data to include 'country_key' field");
        } else if (!foundCountryField) {
            console.error("Could not find any country identifier field in hospitalization data!");
        }
    }

    if (this.vaccinationsData.length > 0) {
        const firstRecord = this.vaccinationsData[0];
        console.log("Vaccination data fields:", Object.keys(firstRecord));

        // Check for required fields
        if (!('date' in firstRecord)) {
            console.error("Vaccination data is missing 'date' field!");
        }

        // Check what field is used for country identification
        const possibleCountryFields = ['country_key', 'country_code', 'location_key', 'country', 'iso_code'];
        const foundCountryField = possibleCountryFields.find(field => field in firstRecord);

        if (foundCountryField && foundCountryField !== 'country_key') {
            console.log(`Found country identifier in field '${foundCountryField}' instead of 'country_key'`);
            // If we found a different field name, map it to country_key
            this.vaccinationsData = this.vaccinationsData.map(record => {
                return {
                    ...record,
                    country_key: record[foundCountryField]
                };
            });
            console.log("Mapped data to include 'country_key' field");
        } else if (!foundCountryField) {
            console.error("Could not find any country identifier field in vaccination data!");
        }
    }
}

export function buildCountryCodeMap() {
    this.countryCodeMap = {};
    this.countryNameMap = {};

    if (!this.countryIndex) return;

    for (const entry of this.countryIndex) {
        if (entry.location_key && entry.country_name) {
            // Store both uppercase and lowercase for better matching
            this.countryCodeMap[entry.country_name.toLowerCase()] = entry.location_key;
            this.countryNameMap[entry.location_key.toLowerCase()] = entry.country_name;
        }
    }

    this.log(`Built country code map with ${Object.keys(this.countryCodeMap).length} entries`);

    // Add common name variations for major countries
    const commonAliases = {
        'united states': 'us',
        'united states of america': 'us',
        'usa': 'us',
        'united kingdom': 'gb',
        'uk': 'gb',
        'russia': 'ru',
        'russian federation': 'ru',
        'china': 'cn',
        'people\'s republic of china': 'cn',
        'korea, republic of': 'kr',
        'south korea': 'kr',
        'korea, democratic people\'s republic of': 'kp',
        'north korea': 'kp',
        'iran': 'ir',
        'iran, islamic republic of': 'ir'
    };

    for (const [alias, code] of Object.entries(commonAliases)) {
        this.countryCodeMap[alias] = code;
    }

    // Print some sample mappings for debugging
    this.log("Sample country mappings:");
    const sampleCountries = ['us', 'gb', 'fr', 'de'];
    for (const code of sampleCountries) {
        this.log(`${code} -> ${this.getCountryName(code)}`);
    }
}

export function setDefaultValues() {
    // Set default column for visualization (pick one that's likely to have data)
    if (this.availableColumns[this.currentDataset].includes('new_confirmed')) {
        this.currentColumn = 'new_confirmed';
    } else if (this.availableColumns[this.currentDataset].includes('cumulative_confirmed')) {
        this.currentColumn = 'cumulative_confirmed';
    } else {
        this.currentColumn = this.availableColumns[this.currentDataset][0] || null;
    }

    this.log(`Set default column to: ${this.currentColumn}`);
}
