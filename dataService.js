class DataService {
    constructor() {
        // Data storage
        this.epidemData = null;
        this.hospitalizationsData = null;
        this.countryIndex = null;
        
        // Current state
        this.currentDataset = 'epidem'; // Default dataset
        this.currentDate = null;
        this.availableDates = [];
        this.currentColumn = null;
        this.availableColumns = {
            epidem: [],
            hospitalizations: []
        };
        
        // Debug flag
        this.debug = true;
        
        // API endpoints (when running with Express server)
        this.apiEndpoints = {
            epidem: 'http://localhost:3000/api/epidem',
            hospitalizations: 'http://localhost:3000/api/hospitalizations',
            countryIndex: 'http://localhost:3000/api/country-index'
        };
        
        // Fallback mode flag
        this.usingFallbackData = false;
    }

    // Load all necessary data
    async loadData() {
        try {
            this.log("Starting data loading process");
            document.getElementById('dataStatus').textContent = "Connecting to server...";
            
            try {
                // Try loading data from API endpoints
                this.log("Trying to load data from API endpoints");
                
                // Load all datasets in parallel
                const [epidemData, hospitalizationsData, countryIndex] = await Promise.all([
                    d3.csv(this.apiEndpoints.epidem),
                    d3.csv(this.apiEndpoints.hospitalizations),
                    d3.csv(this.apiEndpoints.countryIndex)
                ]);
                
                if (epidemData && epidemData.length && 
                    hospitalizationsData && hospitalizationsData.length && 
                    countryIndex && countryIndex.length) {
                    
                    this.log("Successfully loaded data from API endpoints");
                    document.getElementById('dataStatus').textContent = "Data loaded successfully!";
                    
                    this.epidemData = epidemData;
                    this.hospitalizationsData = hospitalizationsData;
                    this.countryIndex = countryIndex;
                    
                    this.log(`Loaded ${this.epidemData.length} epidem records`);
                    this.log(`Loaded ${this.hospitalizationsData.length} hospitalization records`);
                    this.log(`Loaded ${this.countryIndex.length} country index records`);
                    
                    // Build a lookup table for country codes
                    this.buildCountryCodeMap();
                    
                    // Process the data
                    this.processData();
                    
                    // Set defaults
                    this.setDefaultValues();
                    
                    // Success - return the data
                    return {
                        epidemData: this.epidemData,
                        hospitalizationsData: this.hospitalizationsData,
                        countryIndex: this.countryIndex,
                        availableDates: this.availableDates,
                        availableColumns: this.availableColumns
                    };
                }
            } catch (error) {
                this.log(`API endpoints failed: ${error.message}`);
                document.getElementById('dataStatus').textContent = "Server connection failed";
                // Show error and file upload option
                this.showDataFileError(`Server error: ${error.message}<br><br>Is the Express server running? Try running <code>node server.js</code> in the command line.`);
            }
            
            // If API endpoints fail, show error and switch to fallback mode
            this.log("API endpoints failed, switching to fallback data mode");
            document.getElementById('dataStatus').textContent = "Using sample data (server not running)";
            
            // Use fallback data
            return await this.loadFallbackData();
        } catch (error) {
            console.error('Error loading data:', error);
            document.getElementById('dataStatus').textContent = "Error loading data";
            this.showDataFileError(error.message);
            
            // Still try fallback data
            return await this.loadFallbackData();
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
                <li>Files needed: <code>country_level_epidem.csv</code>, <code>country_level_hopitalizations.csv</code>, and <code>small_index.csv</code></li>
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
                const indexFile = document.getElementById('indexUpload').files[0];
                
                if (epidemFile && hospitalFile && indexFile) {
                    try {
                        await this.processUploadedFiles(epidemFile, hospitalFile, indexFile);
                        errorDisplay.style.display = 'none';
                    } catch (error) {
                        alert(`Error processing files: ${error.message}`);
                    }
                } else {
                    alert('Please select all three required files');
                }
            });
        }, 100);
    }
    
    async processUploadedFiles(epidemFile, hospitalFile, indexFile) {
        document.getElementById('dataStatus').textContent = "Processing uploaded files...";
        
        try {
            // Read and parse the CSV files
            this.epidemData = await this.readCSVFile(epidemFile);
            this.hospitalizationsData = await this.readCSVFile(hospitalFile);
            this.countryIndex = await this.readCSVFile(indexFile);
            
            if (!this.epidemData.length || !this.hospitalizationsData.length || !this.countryIndex.length) {
                throw new Error('One or more files are empty or invalid');
            }
            
            this.log(`Loaded ${this.epidemData.length} epidem records from upload`);
            this.log(`Loaded ${this.hospitalizationsData.length} hospitalization records from upload`);
            this.log(`Loaded ${this.countryIndex.length} country index records from upload`);
            
            // Clear fallback flag
            this.usingFallbackData = false;
            document.getElementById('dataStatus').textContent = "Using uploaded data files";
            
            // Build a lookup table for country codes
            this.buildCountryCodeMap();
            
            // Process the data
            this.processData();
            
            // Set defaults
            this.setDefaultValues();
            
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
    
    async loadFallbackData() {
        this.log("Loading fallback sample data");
        this.usingFallbackData = true;
        
        // Create sample data for visualization
        const sampleCountryIndex = this.createSampleCountryIndex();
        const sampleEpidemData = this.createSampleEpidemData();
        const sampleHospitalData = this.createSampleHospitalData();
        
        this.epidemData = sampleEpidemData;
        this.hospitalizationsData = sampleHospitalData;
        this.countryIndex = sampleCountryIndex;
        
        this.log(`Created ${this.epidemData.length} sample epidem records`);
        this.log(`Created ${this.hospitalizationsData.length} sample hospital records`);
        this.log(`Created ${this.countryIndex.length} sample country index records`);
        
        // Build a lookup table for country codes
        this.buildCountryCodeMap();
        
        // Process the data
        this.processData();
        
        // Set defaults
        this.setDefaultValues();
        
        return {
            epidemData: this.epidemData,
            hospitalizationsData: this.hospitalizationsData,
            countryIndex: this.countryIndex,
            availableDates: this.availableDates,
            availableColumns: this.availableColumns
        };
    }
    
    createSampleCountryIndex() {
        // Create a simple mapping of country codes to names
        return [
            { location_key: 'us', country_name: 'United States' },
            { location_key: 'gb', country_name: 'United Kingdom' },
            { location_key: 'fr', country_name: 'France' },
            { location_key: 'de', country_name: 'Germany' },
            { location_key: 'it', country_name: 'Italy' },
            { location_key: 'es', country_name: 'Spain' },
            { location_key: 'cn', country_name: 'China' },
            { location_key: 'jp', country_name: 'Japan' },
            { location_key: 'kr', country_name: 'South Korea' },
            { location_key: 'in', country_name: 'India' },
            { location_key: 'br', country_name: 'Brazil' },
            { location_key: 'ru', country_name: 'Russia' },
            { location_key: 'au', country_name: 'Australia' },
            { location_key: 'ca', country_name: 'Canada' },
            { location_key: 'za', country_name: 'South Africa' }
        ];
    }
    
    createSampleEpidemData() {
        const countries = this.createSampleCountryIndex();
        const data = [];
        
        // Generate dates for the last 90 days
        const dates = [];
        const endDate = new Date();
        for (let i = 90; i >= 0; i--) {
            const date = new Date();
            date.setDate(endDate.getDate() - i);
            const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
            dates.push(dateStr);
        }
        
        // Generate sample data for each country and date
        for (const country of countries) {
            let cumulativeConfirmed = Math.floor(Math.random() * 1000000);
            let cumulativeDeaths = Math.floor(cumulativeConfirmed * (Math.random() * 0.05));
            let cumulativeRecovered = Math.floor(cumulativeConfirmed * (Math.random() * 0.7));
            
            for (const date of dates) {
                // Increase values slightly for each day
                cumulativeConfirmed += Math.floor(Math.random() * 10000);
                cumulativeDeaths += Math.floor(Math.random() * 100);
                cumulativeRecovered += Math.floor(Math.random() * 8000);
                const active = cumulativeConfirmed - cumulativeDeaths - cumulativeRecovered;
                
                // Add daily record
                data.push({
                    country_key: country.location_key,
                    date: date,
                    new_confirmed: Math.floor(Math.random() * 5000),
                    new_deceased: Math.floor(Math.random() * 50),
                    new_recovered: Math.floor(Math.random() * 4000),
                    new_tested: Math.floor(Math.random() * 20000),
                    cumulative_confirmed: cumulativeConfirmed,
                    cumulative_deceased: cumulativeDeaths,
                    cumulative_recovered: cumulativeRecovered,
                    cumulative_tested: cumulativeConfirmed * 5 + Math.floor(Math.random() * 100000),
                    active_cases: active
                });
            }
        }
        
        return data;
    }
    
    createSampleHospitalData() {
        const countries = this.createSampleCountryIndex();
        const data = [];
        
        // Generate dates for the last 90 days
        const dates = [];
        const endDate = new Date();
        for (let i = 90; i >= 0; i--) {
            const date = new Date();
            date.setDate(endDate.getDate() - i);
            const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
            dates.push(dateStr);
        }
        
        // Generate sample data for each country and date
        for (const country of countries) {
            let hospitalBeds = Math.floor(Math.random() * 200000) + 50000;
            let icuBeds = Math.floor(hospitalBeds * (Math.random() * 0.1 + 0.05));
            
            for (const date of dates) {
                const hospitalized = Math.floor(Math.random() * hospitalBeds * 0.6);
                const icuPatients = Math.floor(Math.random() * icuBeds * 0.7);
                
                // Add daily record
                data.push({
                    country_key: country.location_key,
                    date: date,
                    current_hospitalized: hospitalized,
                    current_icu: icuPatients,
                    current_ventilator: Math.floor(icuPatients * (Math.random() * 0.6 + 0.2)),
                    new_hospital_admissions: Math.floor(Math.random() * 1000),
                    new_icu_admissions: Math.floor(Math.random() * 100),
                    total_hospital_beds: hospitalBeds,
                    total_icu_beds: icuBeds,
                    hospital_occupancy_rate: (hospitalized / hospitalBeds).toFixed(2),
                    icu_occupancy_rate: (icuPatients / icuBeds).toFixed(2)
                });
            }
        }
        
        return data;
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
    
    // Get country name from country key
    getCountryName(countryKey) {
        if (!countryKey) return 'Unknown';
        
        // Normalize the country key to lowercase
        const normalizedKey = countryKey.toLowerCase();
        
        // Check for direct match in the mapping table
        if (this.countryNameMap && this.countryNameMap[normalizedKey]) {
            return this.countryNameMap[normalizedKey];
        }
        
        // Check if it's already a country name
        if (this.countryCodeMap && this.countryCodeMap[normalizedKey]) {
            return normalizedKey.charAt(0).toUpperCase() + normalizedKey.slice(1);
        }
        
        // Return the original code as fallback, but capitalized
        return countryKey.toUpperCase();
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
        
        const dataset = this.getCurrentDataset();
        if (!dataset || dataset.length === 0) {
            this.log(`No dataset available for ${this.currentDataset}`);
            return null;
        }
        
        // Normalize country key to lowercase
        const normalizedKey = countryKey.toLowerCase();
        
        // Try to find exact match
        let countryData = dataset.find(d => 
            d.country_key && 
            d.country_key.toLowerCase() === normalizedKey && 
            d.date === this.currentDate
        );
        
        if (countryData) {
            return {
                countryKey,
                countryName: this.getCountryName(countryKey),
                date: this.currentDate,
                ...countryData
            };
        }
        
        // Try with next closest date if no data for current date
        if (!countryData) {
            // Get all entries for this country
            const allCountryEntries = dataset.filter(d => 
                d.country_key && d.country_key.toLowerCase() === normalizedKey
            );
            
            if (allCountryEntries.length > 0) {
                this.log(`Found ${allCountryEntries.length} entries for ${countryKey}, but none on ${this.currentDate}`);
                
                // Sort by date to find closest
                allCountryEntries.sort((a, b) => {
                    const dateA = new Date(a.date);
                    const dateB = new Date(b.date);
                    return Math.abs(dateA - new Date(this.currentDate)) - 
                           Math.abs(dateB - new Date(this.currentDate));
                });
                
                // Use closest date
                countryData = allCountryEntries[0];
                this.log(`Using closest date ${countryData.date} for ${countryKey}`);
                
                return {
                    countryKey,
                    countryName: this.getCountryName(countryKey),
                    date: countryData.date,
                    ...countryData
                };
            }
        }
        
        this.log(`No data at all for country key: ${countryKey}`);
        return null;
    }
    
    // Process the data to extract dates, columns, etc.
    processData() {
        this.log("Processing data");
        
        // Extract unique dates from epidem data
        const epidemDates = [...new Set(this.epidemData.map(d => d.date))];
        this.log(`Found ${epidemDates.length} unique dates in epidem data`);
        
        // Extract unique dates from hospitalizations data
        const hospDates = [...new Set(this.hospitalizationsData.map(d => d.date))];
        this.log(`Found ${hospDates.length} unique dates in hospitalization data`);
        
        // Combine and sort dates
        this.availableDates = [...new Set([...epidemDates, ...hospDates])].sort();
        this.log(`Combined to ${this.availableDates.length} unique dates overall`);
        
        if (this.availableDates.length > 0) {
            // Set the current date to the latest date
            this.currentDate = this.availableDates[this.availableDates.length - 1];
            this.log(`Set current date to latest: ${this.currentDate}`);
        } else {
            console.error("No dates found in the data!");
        }
        
        // Extract available columns for each dataset (excluding date and country_key)
        if (this.epidemData && this.epidemData.length > 0) {
            this.availableColumns.epidem = Object.keys(this.epidemData[0])
                .filter(col => col !== 'date' && col !== 'country_key');
            this.log(`Found ${this.availableColumns.epidem.length} columns in epidem data:`, this.availableColumns.epidem);
        } else {
            console.error("No epidem data records found!");
        }
            
        if (this.hospitalizationsData && this.hospitalizationsData.length > 0) {
            this.availableColumns.hospitalizations = Object.keys(this.hospitalizationsData[0])
                .filter(col => col !== 'date' && col !== 'country_key');
            this.log(`Found ${this.availableColumns.hospitalizations.length} columns in hospitalization data:`, this.availableColumns.hospitalizations);
        } else {
            console.error("No hospitalization data records found!");
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
            
            this.log(`${countryKey} (${this.getCountryName(countryKey)}): Epidem: ${epidemCount}, Hospital: ${hospCount}`);
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
        
        return this.countryNameMap[countryKey] || countryKey;
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
        
        const dataset = this.getCurrentDataset();
        if (!dataset) return null;
        
        // Try to find exact match
        let countryData = dataset.find(d => 
            d.country_key === countryKey && 
            d.date === this.currentDate
        );
        
        // If we still don't have data, check if the date exists at all
        if (!countryData) {
            // Try another date
            const anyDateData = dataset.find(d => d.country_key === countryKey);
            if (anyDateData) {
                this.log(`No data for ${countryKey} on ${this.currentDate}, but found on another date`);
            } else {
                this.log(`No data at all for country key: ${countryKey}`);
            }
            return null;
        }
        
        return {
            countryKey,
            countryName: this.getCountryName(countryKey),
            date: this.currentDate,
            ...countryData
        };
    }
    
    // Get current dataset based on selection
    getCurrentDataset() {
        return this.currentDataset === 'epidem' ? 
            this.epidemData : this.hospitalizationsData;
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
        }).filter(v => !isNaN(v) && v >= 0);
        
        if (!values.length) {
            this.log("Using default color scale (no valid values)");
            return d3.scaleSequential(d3.interpolateGreens).domain([0, 1]);
        }
        
        const max = d3.max(values);
        const min = d3.min(values);
        
        this.log(`Color scale range: ${min} to ${max}`);
        
        // Choose color scheme based on current dataset
        const colorInterpolator = this.currentDataset === 'epidem' ? 
            // Virus data: green to red gradient (starting more visible)
            d3.interpolateRgb('#5da85d', '#FF4500') :
            // Hospital data: green to blue gradient (starting more visible)
            d3.interpolateRgb('#5da85d', '#1E90FF');
            
        return d3.scaleSequential()
            .domain([0, max])
            .interpolator(d => colorInterpolator(Math.sqrt(d / max))); // Square root scale for better visualization
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
