import { loadData, processUploadedFiles, showDataFileError, readCSVFile } from './dataLoader.js';
import { processData, validateDataStructure, buildCountryCodeMap, setDefaultValues } from './dataProcessor.js';
import { indexAllData, precalculateColors, getCountryColor, getColorScale, getDefaultColor, getCachedColor } from './colorManager.js';
import { generateSampleEpidemData, generateSampleHospitalizationsData, generateSampleVaccinationsData,
         generateSampleCountryIndex } from './sampleDataGenerator.js';
import { log, formatDate, formatNumber } from './utils.js';
import { getDataForDate, getCountryData, getCurrentDataset, getAllCountriesDataForCurrentDate, getDataValue } from './dataQuery.js';
import { getCountryName, getCountryKeyFromName } from './countryManager.js';
import { changeDataset, changeDate, changeColumn, getDateIndex, getDateFromIndex } from './stateManager.js';

export class DataService {
    constructor() {
        // Data storage
        this.epidemData = null;
        this.hospitalizationsData = null;
        this.vaccinationsData = null;
        this.countryIndex = null;

        // Current state
        this.currentDataset = 'epidem'; // Default dataset
        this.currentDate = null;
        this.availableDates = [];
        this.currentColumn = null;
        this.availableColumns = {
            epidem: [],
            hospitalizations: [],
            vaccinations: []
        };

        // Indexed data for faster lookup
        this.indexedData = {
            epidem: {},
            hospitalizations: {},
            vaccinations: {}
        };

        // Cache for calculated colors
        this.colorCache = {
            epidem: {},
            hospitalizations: {},
            vaccinations: {}
        };

        // Debug flag
        this.debug = true;

        // Sample data flag
        this.useSampleData = true;

        // API endpoints (when running with Express server)
        this.apiEndpoints = {
            epidem: 'http://localhost:3000/api/epidem',
            hospitalizations: 'http://localhost:3000/api/hospitalizations',
            vaccinations: 'http://localhost:3000/api/vaccinations',
            countryIndex: 'http://localhost:3000/api/country-index'
        };

        // Bind methods to this instance
        // Data loading
        this.loadData = loadData.bind(this);
        this.processUploadedFiles = processUploadedFiles.bind(this);
        this.showDataFileError = showDataFileError.bind(this);
        this.readCSVFile = readCSVFile.bind(this);

        // Data processing
        this.processData = processData.bind(this);
        this.validateDataStructure = validateDataStructure.bind(this);
        this.buildCountryCodeMap = buildCountryCodeMap.bind(this);
        this.setDefaultValues = setDefaultValues.bind(this);

        // Color management
        this.indexAllData = indexAllData.bind(this);
        this.precalculateColors = precalculateColors.bind(this);
        this.getCountryColor = getCountryColor.bind(this);
        this.getColorScale = getColorScale.bind(this);
        this.getDefaultColor = getDefaultColor.bind(this);
        this.getCachedColor = getCachedColor.bind(this);

        // Sample data generation
        this.generateSampleEpidemData = generateSampleEpidemData.bind(this);
        this.generateSampleHospitalizationsData = generateSampleHospitalizationsData.bind(this);
        this.generateSampleVaccinationsData = generateSampleVaccinationsData.bind(this);
        this.generateSampleCountryIndex = generateSampleCountryIndex.bind(this);

        // Utilities
        this.log = log.bind(this);
        this.formatDate = formatDate.bind(this);
        this.formatNumber = formatNumber.bind(this);

        // Data querying
        this.getDataForDate = getDataForDate.bind(this);
        this.getCountryData = getCountryData.bind(this);
        this.getCurrentDataset = getCurrentDataset.bind(this);
        this.getAllCountriesDataForCurrentDate = getAllCountriesDataForCurrentDate.bind(this);
        this.getDataValue = getDataValue.bind(this);

        // Country management
        this.getCountryName = getCountryName.bind(this);
        this.getCountryKeyFromName = getCountryKeyFromName.bind(this);

        // State management
        this.changeDataset = changeDataset.bind(this);
        this.changeDate = changeDate.bind(this);
        this.changeColumn = changeColumn.bind(this);
        this.getDateIndex = getDateIndex.bind(this);
        this.getDateFromIndex = getDateFromIndex.bind(this);
    }
}
