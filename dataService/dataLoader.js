// Data loading functionality

export async function loadData() {
    try {
        this.log("Starting data loading process");
        document.getElementById('dataStatus').textContent = "Loading data...";

        if (this.useSampleData) {
            this.log("Using sample data for testing");
            document.getElementById('dataStatus').textContent = "Generating sample data...";

            // Generate sample data
            this.epidemData = this.generateSampleEpidemData();
            this.hospitalizationsData = this.generateSampleHospitalizationsData();
            this.vaccinationsData = this.generateSampleVaccinationsData();
            this.countryIndex = this.generateSampleCountryIndex();

            // Log sample data for debugging
            console.log("Epidem data sample (first 2 records):", this.epidemData.slice(0, 2));
            console.log("Hospitalization data sample (first 2 records):", this.hospitalizationsData.slice(0, 2));
            console.log("Vaccination data sample (first 2 records):", this.vaccinationsData.slice(0, 2));
            console.log("Country index sample (first 5 records):", this.countryIndex.slice(0, 5));

            document.getElementById('dataStatus').textContent = "Sample data generated!";

            this.log(`Generated ${this.epidemData.length} epidem records`);
            this.log(`Generated ${this.hospitalizationsData.length} hospitalization records`);
            this.log(`Generated ${this.vaccinationsData.length} vaccination records`);
            this.log(`Generated ${this.countryIndex.length} country index records`);

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
        }
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('dataStatus').textContent = "Error loading data";
        this.showDataFileError(error.message);
        throw error; // Make sure the error propagates
    }
}

export function showDataFileError(errorDetails = null) {
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

export async function processUploadedFiles(epidemFile, hospitalFile, vaccinationFile, indexFile) {
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

export async function readCSVFile(file) {
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
