import { setStatus } from './utils.js';

function parseCSVText(text, name) {
    if (!globalThis.d3?.csvParse) throw new Error('The CSV library did not load.');
    const csv = text.replace(/^\uFEFF/, '');
    if (!csv.trim()) throw new Error(`${name} is empty.`);
    const parsed = globalThis.d3.csvParse(csv);
    if (new Set(parsed.columns).size !== parsed.columns.length) {
        throw new Error(`${name} contains duplicate column headers.`);
    }
    return parsed;
}

async function readCSVEndpoint(url, optional = false) {
    const response = await fetch(url);
    if (optional && response.status === 404) return [];
    if (!response.ok) throw new Error(`Unable to load ${url}: HTTP ${response.status}.`);
    return parseCSVText(await response.text(), url);
}

function result(service) {
    return {
        epidemData: service.epidemData,
        hospitalizationsData: service.hospitalizationsData,
        vaccinationsData: service.vaccinationsData,
        countryIndex: service.countryIndex,
        demographicsData: service.demographicsData,
        availableDates: service.availableDates,
        availableColumns: service.availableColumns
    };
}

async function prepareData(service, data, source) {
    // A rejected upload/load leaves the existing usable data and caches intact.
    const candidate = new service.constructor({
        useSampleData: source === 'sample', debug: service.debug, apiEndpoints: service.apiEndpoints
    });
    Object.assign(candidate, data);
    candidate.currentDataset = service.currentDataset;
    candidate.currentDate = service.currentDate;
    candidate.displayUnit = service.displayUnit;
    candidate.smoothing = service.smoothing;
    candidate.dataSource = source;
    candidate.validateDataStructure();
    candidate.buildCountryCodeMap();
    candidate.processData();
    candidate.setDefaultValues();
    await candidate.indexAllData();
    await candidate.precalculateColors();
    Object.assign(service, candidate);
    setStatus(source === 'sample' ? 'Sample data · fictional demonstration' :
        source === 'upload' ? 'Ready · uploaded CSV data' : 'Ready · CSV data');
    return result(service);
}

export async function loadData() {
    setStatus('Loading data…');
    try {
        if (this.useSampleData) {
            return await prepareData(this, {
                epidemData: this.generateSampleEpidemData(),
                hospitalizationsData: this.generateSampleHospitalizationsData(),
                vaccinationsData: this.generateSampleVaccinationsData(),
                countryIndex: this.generateSampleCountryIndex(),
                demographicsData: this.generateSampleDemographicsData()
            }, 'sample');
        }
        if (!globalThis.d3?.csvParse) throw new Error('The CSV library did not load. Check the connection and reload.');
        const [epidemData, hospitalizationsData, vaccinationsData, countryIndex, demographicsData] = await Promise.all([
            readCSVEndpoint(this.apiEndpoints.epidem),
            readCSVEndpoint(this.apiEndpoints.hospitalizations),
            readCSVEndpoint(this.apiEndpoints.vaccinations),
            readCSVEndpoint(this.apiEndpoints.countryIndex),
            readCSVEndpoint(this.apiEndpoints.demographics, true)
        ]);
        return await prepareData(this, { epidemData, hospitalizationsData, vaccinationsData, countryIndex, demographicsData }, 'csv');
    } catch (error) {
        setStatus('Error loading data');
        this.showDataFileError(error.message);
        throw error;
    }
}

export function showDataFileError(errorDetails = '') {
    if (typeof document === 'undefined') return;
    const display = document.getElementById('errorDisplay');
    const message = document.getElementById('errorMessage');
    if (!display || !message) return;
    // The template is static; CSV contents and exception messages are assigned as text.
    message.innerHTML = `
        <p>Unable to load the CSV data. Start the app with <code>npm start</code> and put
        the Google files in the configured data directory, or upload all four files below.</p>
        <p>Use epidemiology.csv, hospitalizations.csv, vaccinations.csv and index.csv
        (the existing country_level filenames and small_index.csv also work on the server).</p>
        <div class="file-upload-controls">
            <label>Epidemiology <input type="file" id="epidemUpload" accept=".csv,text/csv"></label>
            <label>Hospitalizations <input type="file" id="hospitalUpload" accept=".csv,text/csv"></label>
            <label>Vaccinations <input type="file" id="vaccinationUpload" accept=".csv,text/csv"></label>
            <label>Country index <input type="file" id="indexUpload" accept=".csv,text/csv"></label>
            <label>Population (optional) <input type="file" id="demographicsUpload" accept=".csv,text/csv"></label>
            <button type="button" id="processUploads">Load uploaded CSV files</button>
        </div>
        <p id="uploadErrorDetails" role="status"></p>`;
    const details = document.getElementById('uploadErrorDetails');
    details.textContent = errorDetails;
    display.style.display = 'flex';
    const close = document.getElementById('errorClose');
    if (close) close.onclick = () => { display.style.display = 'none'; };
    const button = document.getElementById('processUploads');
    button.onclick = async () => {
        const files = ['epidemUpload', 'hospitalUpload', 'vaccinationUpload', 'indexUpload']
            .map(id => document.getElementById(id).files[0]);
        if (files.some(file => !file)) {
            details.textContent = 'Please select all four CSV files.';
            return;
        }
        button.disabled = true;
        try {
            await this.processUploadedFiles(...files, document.getElementById('demographicsUpload').files[0]);
            display.style.display = 'none';
        } catch (error) {
            details.textContent = error.message;
        } finally {
            button.disabled = false;
        }
    };
}

export async function processUploadedFiles(epidemFile, hospitalFile, vaccinationFile, indexFile, demographicsFile) {
    setStatus('Processing uploaded files…');
    try {
        const [epidemData, hospitalizationsData, vaccinationsData, countryIndex] = await Promise.all(
            [epidemFile, hospitalFile, vaccinationFile, indexFile].map(file => this.readCSVFile(file))
        );
        const demographicsData = demographicsFile ? await this.readCSVFile(demographicsFile) : [];
        const loaded = await prepareData(this, { epidemData, hospitalizationsData, vaccinationsData, countryIndex, demographicsData }, 'upload');
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('data-loaded', { detail: { dataSource: 'upload' } }));
        }
        return loaded;
    } catch (error) {
        setStatus('Upload rejected · previous data preserved');
        throw error;
    }
}

export async function readCSVFile(file) {
    if (!file || typeof file.text !== 'function') throw new Error('Select a valid CSV file.');
    return parseCSVText(await file.text(), file.name || 'CSV file');
}
