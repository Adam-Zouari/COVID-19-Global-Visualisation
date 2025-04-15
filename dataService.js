class DataService {
    constructor() {
        // Data storage
        this.epidemData = null;
        this.hospitalizationsData = null;
        this.vaccinationsData = null;  // Add vaccinations data storage
        this.countryIndex = null;
        
        // Current state
        this.currentDataset = 'epidem'; // Default dataset
        this.currentDate = null;
        this.availableDates = [];
        this.currentColumn = null;
        this.availableColumns = {
            epidem: [],
            hospitalizations: [],
            vaccinations: []  // Add vaccinations columns
        };
        
        // Indexed data for faster lookup
        this.indexedData = {
            epidem: {},
            hospitalizations: {},
            vaccinations: {}  // Add vaccinations index
        };
        
        // Cache for calculated colors
        this.colorCache = {
            epidem: {},
            hospitalizations: {},
            vaccinations: {}  // Add vaccinations cache
        };
        
        // Debug flag
        this.debug = true;
        
        // API endpoints (when running with Express server)
        this.apiEndpoints = {
            epidem: 'http://localhost:3000/api/epidem',
            hospitalizations: 'http://localhost:3000/api/hospitalizations',
            vaccinations: 'http://localhost:3000/api/vaccinations', // Add vaccinations endpoint
            countryIndex: 'http://localhost:3000/api/country-index'
        };
    }

    // Load all necessary data
    async loadData() {
        try {
            this.log("Starting data loading process");
            document.getElementById('dataStatus').textContent = "Connecting to server...";
            
            try {
                // Load data from API endpoints
                this.log("Loading data from API endpoints");
                
                console.log("API endpoints being accessed:", this.apiEndpoints);
                
                // Load all datasets in parallel
                const [epidemData, hospitalizationsData, vaccinationsData, countryIndex] = await Promise.all([
                    d3.csv(this.apiEndpoints.epidem),
                    d3.csv(this.apiEndpoints.hospitalizations),
                    d3.csv(this.apiEndpoints.vaccinations),
                    d3.csv(this.apiEndpoints.countryIndex)
                ]);
                
                // Log raw data for debugging
                console.log("Epidem data sample (first 2 records):", epidemData.slice(0, 2));
                console.log("Hospitalization data sample (first 2 records):", hospitalizationsData.slice(0, 2));
                console.log("Vaccination data sample (first 2 records):", vaccinationsData.slice(0, 2));
                console.log("Country index sample (first 5 records):", countryIndex.slice(0, 5));
                
                if (epidemData && epidemData.length && 
                    hospitalizationsData && hospitalizationsData.length && 
                    vaccinationsData && vaccinationsData.length && 
                    countryIndex && countryIndex.length) {
                    
                    this.log("Successfully loaded data from API endpoints");
                    document.getElementById('dataStatus').textContent = "Data loaded successfully!";
                    
                    this.epidemData = epidemData;
                    this.hospitalizationsData = hospitalizationsData;
                    this.vaccinationsData = vaccinationsData;
                    this.countryIndex = countryIndex;
                    
                    this.log(`Loaded ${this.epidemData.length} epidem records`);
                    this.log(`Loaded ${this.hospitalizationsData.length} hospitalization records`);
                    this.log(`Loaded ${this.vaccinationsData.length} vaccination records`);
                    this.log(`Loaded ${this.countryIndex.length} country index records`);
                    
                    // Check data structure to ensure required fields exist
                    this.validateDataStructure();
                    
                    // Build a lookup table for country codes
                    this.buildCountryCodeMap();
                    
                    // Process the data
                    this.processData();
                    
                    // Set defaults
                    this.setDefaultValues();
                    
                    // Index the data for faster lookups
                    document.getElementById('dataStatus').textContent = "Indexing data for performance...";
                    await this.indexAllData();
                    
                    // Pre-calculate colors for better performance
                    document.getElementById('dataStatus').textContent = "Pre-calculating colors...";
                    await this.precalculateColors();
                    
                    document.getElementById('dataStatus').textContent = "Ready!";
                    
                    // Success - return the data
                    return {
                        epidemData: this.epidemData,
                        hospitalizationsData: this.hospitalizationsData,
                        vaccinationsData: this.vaccinationsData,
                        countryIndex: this.countryIndex,
                        availableDates: this.availableDates,
                        availableColumns: this.availableColumns
                    };
                } else {
                    throw new Error("One or more datasets are empty or invalid");
                }
            } catch (error) {
                this.log(`API endpoints failed: ${error.message}`);
                document.getElementById('dataStatus').textContent = "Server connection failed";
                // Show error message and file upload option
                this.showDataFileError(`Server error: ${error.message}<br><br>Is the Express server running? Try running <code>node server.js</code> in the command line.`);
                throw error; // Propagate the error
            }
        } catch (error) {
            console.error('Error loading data:', error);
            document.getElementById('dataStatus').textContent = "Error loading data";
            this.showDataFileError(error.message);
            throw error; // Make sure the error propagates
        }
    }
    
    // New method: Index all data for fast access
    async indexAllData() {
        this.log("Indexing data for faster access");
        
        // Clear any existing indexed data
        this.indexedData = {
            epidem: {},
            hospitalizations: {},
            vaccinations: {}  // Add vaccinations index
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
        
        // Process both datasets using Promise.all for parallel processing
        await Promise.all([
            indexDataset(this.epidemData, 'epidem'),
            indexDataset(this.hospitalizationsData, 'hospitalizations'),
            indexDataset(this.vaccinationsData, 'vaccinations')
        ]);
        
        this.log("Data indexing complete");
    }
    
    // New method: Pre-calculate colors for all countries and dates
    async precalculateColors() {
        this.log("Pre-calculating colors for all metrics");
        
        // Clear any existing color cache
        this.colorCache = {
            epidem: {},
            hospitalizations: {},
            vaccinations: {}  // Add vaccinations cache
        };
        
        // Function to calculate colors for a dataset, column, and date
        const calculateColorsForDate = (datasetName, column, date) => {
            return new Promise(resolve => {
                // Get data for this date
                const dataForDate = this.getDataForDate(datasetName, date);
                
                // Extract values for this column
                const values = dataForDate
                    .map(d => {
                        const value = d[column];
                        return value ? parseFloat(value) : 0;
                    })
                    .filter(v => !isNaN(v) && v > 0); // Filter out zero values
                
                if (!values.length) {
                    resolve();
                    return;
                }
                
                // Calculate statistics for better scaling
                const max = d3.max(values);
                const min = d3.min(values);
                const median = d3.median(values);
                const q1 = d3.quantile(values.sort(d3.ascending), 0.25);
                const q3 = d3.quantile(values.sort(d3.ascending), 0.75);
                
                // Choose domain based on data distribution
                let domainMax;
                
                // Check if we have extreme outliers
                const iqr = q3 - q1;
                const upperOutlierThreshold = q3 + 1.5 * iqr;
                
                if (max > upperOutlierThreshold && upperOutlierThreshold > 0) {
                    // If we have outliers, cap at the upper outlier threshold for better visualization
                    domainMax = upperOutlierThreshold;
                } else {
                    domainMax = max;
                }
                
                // Choose color scheme based on dataset with more vibrant colors
                let colorInterpolator;
                if (datasetName === 'epidem') {
                    // Virus data: vibrant green to red gradient
                    colorInterpolator = d3.interpolateRgb('#2ECC40', '#FF4136');
                } else if (datasetName === 'hospitalizations') {
                    // Hospital data: vibrant green to blue gradient
                    colorInterpolator = d3.interpolateRgb('#2ECC40', '#0074D9');
                } else if (datasetName === 'vaccinations') {
                    // Vaccination data: vibrant green to purple gradient
                    colorInterpolator = d3.interpolateRgb('#2ECC40', '#9932CC');
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
                
                // Calculate and cache color for each country
                Object.keys(this.indexedData[datasetName]).forEach(countryKey => {
                    const countryData = this.indexedData[datasetName][countryKey][date];
                    if (!countryData) return;
                    
                    const value = countryData[column];
                    if (!value) return;
                    
                    const parsedValue = parseFloat(value);
                    if (isNaN(parsedValue) || parsedValue <= 0) return;
                    
                    // Calculate and store the color using our improved scaling
                    const normalizedValue = Math.min(1, parsedValue / domainMax);
                    const scaledValue = Math.pow(normalizedValue, exponent);
                    this.colorCache[datasetName][column][date][countryKey] = colorInterpolator(scaledValue);
                });
                
                resolve();
            });
        };
        
        // Process all combinations of datasets, columns, and dates
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
    
    // Get all data for a specific date from a dataset
    getDataForDate(datasetName, date) {
        if (datasetName === 'epidem') {
            return this.epidemData.filter(d => d.date === date);
        } else if (datasetName === 'hospitalizations') {
            return this.hospitalizationsData.filter(d => d.date === date);
        } else if (datasetName === 'vaccinations') {
            return this.vaccinationsData.filter(d => d.date === date);
        }
        return [];
    }
    
    // Get cached color for a country
    getCachedColor(countryKey, date) {
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
    
    // New method: Validate data structure
    validateDataStructure() {
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
    
    showDataFileError(errorDetails = null) {
        const errorDisplay = document.getElementById('errorDisplay');
        const errorMessage = document.getElementById('errorMessage');
        
        let message = `
            <p>Unable to load the required data files. Please try the following:</p>
            <ol>
                <li>Make sure the Express server is running: <code>cd server && node server.js</code></li>
                <li>Ensure you have a folder named <code>Covid19_Datasets/Google_Datasets</code> with the CSV files.</li>
                <li>Files needed: <code>country_level_epidem.csv</code>, <code>country_level_hopitalizations.csv</code>, <code>country_level_vaccinations.csv</code>, and <code>small_index.csv</code></li>
            </ol>
            <p>You can also upload the files directly:</p>
            <div class="file-upload-controls">
                <div class="file-upload">
                    <label>Epidemiology Data: <input type="file" id="epidemUpload" accept=".csv"></label>
                </div>
                <div class="file-upload">
                    <label>Hospital Data: <input type="file" id="hospitalUpload" accept=".csv"></label>
                </div>
                <div class="file-upload">
                    <label>Vaccination Data: <input type="file" id="vaccinationUpload" accept=".csv"></label>
                </div>
                <div class="file-upload">
                    <label>Country Index: <input type="file" id="indexUpload" accept=".csv"></label>
                </div>
                <button id="processUploads">Process Uploaded Files</button>
            </div>
        `;
        
        if (errorDetails) {
            message += `<p>Error details: ${errorDetails}</p>`;
        }
        
        errorMessage.innerHTML = message;
        errorDisplay.style.display = 'flex';
        
        // Set up file upload event listeners
        setTimeout(() => {
            document.getElementById('errorClose').addEventListener('click', () => {
                errorDisplay.style.display = 'none';
            });
            
            document.getElementById('processUploads').addEventListener('click', async () => {
                const epidemFile = document.getElementById('epidemUpload').files[0];
                const hospitalFile = document.getElementById('hospitalUpload').files[0];
                const vaccinationFile = document.getElementById('vaccinationUpload').files[0];
                const indexFile = document.getElementById('indexUpload').files[0];
                
                if (epidemFile && hospitalFile && vaccinationFile && indexFile) {
                    try {
                        await this.processUploadedFiles(epidemFile, hospitalFile, vaccinationFile, indexFile);
                        errorDisplay.style.display = 'none';
                    } catch (error) {
                        alert(`Error processing files: ${error.message}`);
                    }
                } else {
                    alert('Please select all four required files');
                }
            });
        }, 100);
    }
    
    async processUploadedFiles(epidemFile, hospitalFile, vaccinationFile, indexFile) {
        document.getElementById('dataStatus').textContent = "Processing uploaded files...";
        
        try {
            // Read and parse the CSV files
            this.epidemData = await this.readCSVFile(epidemFile);
            this.hospitalizationsData = await this.readCSVFile(hospitalFile);
            this.vaccinationsData = await this.readCSVFile(vaccinationFile);
            this.countryIndex = await this.readCSVFile(indexFile);
            
            if (!this.epidemData.length || !this.hospitalizationsData.length || !this.vaccinationsData.length || !this.countryIndex.length) {
                throw new Error('One or more files are empty or invalid');
            }
            
            this.log(`Loaded ${this.epidemData.length} epidem records from upload`);
            this.log(`Loaded ${this.hospitalizationsData.length} hospitalization records from upload`);
            this.log(`Loaded ${this.vaccinationsData.length} vaccination records from upload`);
            this.log(`Loaded ${this.countryIndex.length} country index records from upload`);
            
            document.getElementById('dataStatus').textContent = "Processing uploaded data...";
            
            // Build a lookup table for country codes
            this.buildCountryCodeMap();
            
            // Process the data
            this.processData();
            
            // Set defaults
            this.setDefaultValues();
            
            // Index the data for faster lookups
            document.getElementById('dataStatus').textContent = "Indexing uploaded data...";
            await this.indexAllData();
            
            // Pre-calculate colors for better performance
            document.getElementById('dataStatus').textContent = "Calculating colors...";
            await this.precalculateColors();
            
            document.getElementById('dataStatus').textContent = "Ready (using uploaded data)";
            
            // Refresh the visualization
            const globe = window.globeInstance;
            if (globe) {
                globe.updateDataSelector();
                globe.setupDateSlider();
                globe.updateGlobeColors();
                globe.updateCountryInfoPanel(null);
            }
            
            return {
                epidemData: this.epidemData,
                hospitalizationsData: this.hospitalizationsData,
                vaccinationsData: this.vaccinationsData,
                countryIndex: this.countryIndex,
                availableDates: this.availableDates,
                availableColumns: this.availableColumns
            };
        } catch (error) {
            console.error('Error processing uploaded files:', error);
            document.getElementById('dataStatus').textContent = "Error processing uploads";
            throw error;
        }
    }
    
    async readCSVFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const csvData = event.target.result;
                    const parsedData = d3.csvParse(csvData);
                    resolve(parsedData);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = (error) => reject(error);
            
            reader.readAsText(file);
        });
    }
    
    // Build a lookup table for quick country code mapping
    buildCountryCodeMap() {
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
    
    // Process the data to extract dates, columns, etc.
    processData() {
        this.log("Processing data");
        
        // Extract unique dates from all datasets
        const epidemDates = [...new Set(this.epidemData.map(d => d.date))];
        const hospDates = [...new Set(this.hospitalizationsData.map(d => d.date))];
        const vaccinationDates = this.vaccinationsData ? [...new Set(this.vaccinationsData.map(d => d.date))] : [];
        
        this.log(`Found ${epidemDates.length} unique dates in epidem data`);
        this.log(`Found ${hospDates.length} unique dates in hospitalization data`);
        this.log(`Found ${vaccinationDates.length} unique dates in vaccination data`);
        
        // Combine and sort dates
        this.availableDates = [...new Set([...epidemDates, ...hospDates, ...vaccinationDates])].sort();
        this.log(`Combined to ${this.availableDates.length} unique dates overall`);
        
        if (this.availableDates.length > 0) {
            // Set the current date to the latest date
            this.currentDate = this.availableDates[this.availableDates.length - 1];
            this.log(`Set current date to latest: ${this.currentDate}`);
        } else {
            console.error("No dates found in the data!");
        }
        
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
    
    // Set default values
    setDefaultValues() {
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
    
    // Get country name from country key
    getCountryName(countryKey) {
        if (!countryKey) return 'Unknown';
        if (!this.countryNameMap) return countryKey;
        
        return this.countryNameMap[countryKey.toLowerCase()] || countryKey;
    }
    
    // Get country key from country name
    getCountryKeyFromName(countryName) {
        if (!countryName) return null;
        if (!this.countryCodeMap) return null;
        
        const normalizedName = countryName.toLowerCase().trim();
        return this.countryCodeMap[normalizedName] || null;
    }
    
    // Get data for a specific country on the current date
    getCountryData(countryKey) {
        if (!countryKey) return null;
        
        // Check in the indexed data first for better performance
        const normalizedKey = countryKey.toLowerCase();
        const datasetName = this.currentDataset;
        
        if (
            this.indexedData[datasetName] && 
            this.indexedData[datasetName][normalizedKey] && 
            this.indexedData[datasetName][normalizedKey][this.currentDate]
        ) {
            const countryData = this.indexedData[datasetName][normalizedKey][this.currentDate];
            return {
                countryKey,
                countryName: this.getCountryName(countryKey),
                date: this.currentDate,
                ...countryData
            };
        }
        
        // If not found for current date, try to find closest date
        if (this.indexedData[datasetName] && this.indexedData[datasetName][normalizedKey]) {
            const availableDates = Object.keys(this.indexedData[datasetName][normalizedKey]).sort();
            
            if (availableDates.length > 0) {
                // Find closest date
                availableDates.sort((a, b) => {
                    const dateA = new Date(a);
                    const dateB = new Date(b);
                    return Math.abs(dateA - new Date(this.currentDate)) - 
                           Math.abs(dateB - new Date(this.currentDate));
                });
                
                const closestDate = availableDates[0];
                const countryData = this.indexedData[datasetName][normalizedKey][closestDate];
                
                this.log(`Using closest date ${closestDate} for ${countryKey}`);
                
                return {
                    countryKey,
                    countryName: this.getCountryName(countryKey),
                    date: closestDate,
                    ...countryData
                };
            }
        }
        
        // If still not found, return null
        return null;
    }
    
    // Get current dataset based on selection
    getCurrentDataset() {
        if (this.currentDataset === 'epidem') {
            return this.epidemData;
        } else if (this.currentDataset === 'hospitalizations') {
            return this.hospitalizationsData;
        } else if (this.currentDataset === 'vaccinations') {
            return this.vaccinationsData;
        }
        return null;
    }
    
    // Get data for all countries on current date
    getAllCountriesDataForCurrentDate() {
        const dataset = this.getCurrentDataset();
        if (!dataset) return [];
        
        return dataset.filter(d => d.date === this.currentDate);
    }
    
    // Get value for current column for a country
    getDataValue(countryKey) {
        const countryData = this.getCountryData(countryKey);
        if (!countryData || !this.currentColumn) return 0;
        
        const value = countryData[this.currentColumn];
        return value ? parseFloat(value) : 0;
    }
    
    // Get color for a country using pre-calculated cache
    getCountryColor(countryKey) {
        if (!countryKey) return '#5da85d'; // Default color
        
        const normalizedKey = countryKey.toLowerCase();
        const cachedColor = this.getCachedColor(normalizedKey, this.currentDate);
        
        if (cachedColor) {
            return cachedColor;
        }
        
        // If no cached color, fall back to calculating it
        try {
            const value = this.getDataValue(countryKey);
            
            if (!value || value === 0) {
                return '#5da85d'; // Default for no data
            }
            
            const colorScale = this.getColorScale();
            // Log color values for debugging
            if (['us', 'gb', 'fr', 'de', 'jp'].includes(normalizedKey)) {
                console.log(`Dynamic color for ${normalizedKey}: value=${value}, color=${colorScale(value)}`);
            }
            return colorScale(value);
        } catch (e) {
            console.error('Error calculating country color:', e);
            return '#5da85d'; // Default on error
        }
    }
    
    // Change dataset
    changeDataset(dataset) {
        this.currentDataset = dataset;
        // Set first column of new dataset as current or pick a common one
        if (this.availableColumns[dataset].includes('new_confirmed')) {
            this.currentColumn = 'new_confirmed';
        } else if (this.availableColumns[dataset].includes('cumulative_confirmed')) {
            this.currentColumn = 'cumulative_confirmed';
        } else {
            this.currentColumn = this.availableColumns[dataset][0] || null;
        }
        
        this.log(`Changed dataset to ${dataset}, column set to ${this.currentColumn}`);
        
        return {
            columns: this.availableColumns[dataset],
            currentColumn: this.currentColumn
        };
    }
    
    // Change date
    changeDate(date) {
        if (this.availableDates.includes(date)) {
            this.currentDate = date;
            this.log(`Changed date to ${date}`);
            return true;
        }
        return false;
    }
    
    // Change column
    changeColumn(column) {
        if (this.availableColumns[this.currentDataset].includes(column)) {
            this.currentColumn = column;
            this.log(`Changed column to ${column}`);
            return true;
        }
        return false;
    }
    
    // Get color scale for current data column
    getColorScale() {
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
        
        // Choose color scheme based on current dataset with more vibrant colors
        let colorInterpolator;
        if (this.currentDataset === 'epidem') {
            // Virus data: vibrant green to red gradient
            colorInterpolator = d3.interpolateRgb('#2ECC40', '#FF4136');
        } else if (this.currentDataset === 'hospitalizations') {
            // Hospital data: vibrant green to blue gradient
            colorInterpolator = d3.interpolateRgb('#2ECC40', '#0074D9');
        } else if (this.currentDataset === 'vaccinations') {
            // Vaccination data: vibrant green to purple gradient
            colorInterpolator = d3.interpolateRgb('#2ECC40', '#9932CC');
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
    
    // Get date index for slider
    getDateIndex(date) {
        return this.availableDates.indexOf(date);
    }
    
    // Get date from index
    getDateFromIndex(index) {
        return this.availableDates[index] || this.currentDate;
    }
    
    // Format date for display
    formatDate(dateString) {
        if (!dateString) return '';
        
        // Assuming dates are in YYYY-MM-DD format
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
    
    // Format number for display
    formatNumber(num) {
        if (num === undefined || num === null || isNaN(num)) return '-';
        return parseFloat(num).toLocaleString();
    }
    
    // Utility method for conditional logging
    log(message, data) {
        if (this.debug) {
            if (data) {
                console.log(`[DataService] ${message}`, data);
            } else {
                console.log(`[DataService] ${message}`);
            }
        }
    }
}

// Initialize the data service
const dataService = new DataService();
