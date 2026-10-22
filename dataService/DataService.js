import * as loading from './dataLoader.js';
import * as processing from './dataProcessor.js';
import * as colors from './colorManager.js';
import * as samples from './sampleDataGenerator.js';
import * as queries from './dataQuery.js';
import * as countries from './countryManager.js';
import * as state from './stateManager.js';
import * as display from './displayData.js';
import { getMetricMetadata, getUnitLabel } from './metrics.js';
import { formatDate, formatNumber } from './utils.js';

/** Country-level Google COVID-19 data, independent of the globe and chart UI. */
export class DataService {
    constructor({ useSampleData = false, apiEndpoints = {} } = {}) {
        this.epidemData = [];
        this.hospitalizationsData = [];
        this.vaccinationsData = [];
        this.countryIndex = [];
        this.demographicsData = [];
        this.populationByCountry = Object.create(null);
        this.populationSource = null;
        this.displayUnit = 'count';
        this.smoothing = 'raw';
        this.seriesCache = new Map();
        this.displayDomainCache = new Map();
        this.metricDatesCache = new Map();
        this.currentDataset = 'epidem';
        this.currentDate = null;
        this.currentColumn = null;
        this.availableDates = [];
        this.availableColumns = { epidem: [], hospitalizations: [], vaccinations: [] };
        this.datesByDataset = { epidem: [], hospitalizations: [], vaccinations: [] };
        this.indexedData = {};
        this.dataByDate = {};
        this.colorCache = new Map();
        this.countryCodeMap = Object.create(null);
        this.countryNameMap = Object.create(null);
        this.useSampleData = useSampleData;
        this.dataSource = useSampleData ? 'sample' : 'csv';
        this.apiEndpoints = {
            epidem: '/api/epidem',
            hospitalizations: '/api/hospitalizations',
            vaccinations: '/api/vaccinations',
            countryIndex: '/api/country-index',
            demographics: '/api/demographics',
            ...apiEndpoints
        };
    }
}

Object.assign(DataService.prototype, loading, processing, colors, samples, queries, countries, state, display,
    { formatDate, formatNumber, getMetricMetadata, getUnitLabel });
