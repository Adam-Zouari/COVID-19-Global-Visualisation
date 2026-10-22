import { isValidDate, numericValue, MIN_OBSERVATION_DATE, COUNTRY_IDENTIFIER_FIELDS, countryKey, isCountryRow } from './utils.js';

const DATASETS = { epidem: 'epidemData', hospitalizations: 'hospitalizationsData', vaccinations: 'vaccinationsData' };
const METADATA = new Set(['date', 'country_key', 'location_key', 'key', 'country_code', 'country',
    'iso_code', 'country_name', 'aggregation_level', 'subregion1_code', 'subregion1_name',
    'subregion2_code', 'subregion2_name', '3166-1-alpha-2', '3166-1-alpha-3']);

function headers(rows) {
    const fields = new Set();
    for (const row of rows) for (const field of Object.keys(row)) fields.add(field);
    return [...fields];
}

function normalizeDataset(rows, name) {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error(`${name}: the CSV file is empty.`);
    if (rows.columns && new Set(rows.columns).size !== rows.columns.length) {
        throw new Error(`${name}: duplicate CSV column headers.`);
    }
    const fields = headers(rows);
    if (!fields.includes('date')) throw new Error(`${name}: missing required date column.`);
    if (!COUNTRY_IDENTIFIER_FIELDS.some(field => fields.includes(field))) {
        throw new Error(`${name}: missing country identifier (location_key, key or country_key).`);
    }
    const metrics = fields.filter(field => !METADATA.has(field) &&
        (/^(new|current|cumulative)_/.test(field) || rows.some(row => numericValue(row[field]) !== null)));
    if (!metrics.length) throw new Error(`${name}: no numeric metric columns found.`);
    const records = [];
    const seen = new Set();
    const today = new Date().toISOString().slice(0, 10);
    for (const row of rows) {
        const key = countryKey(row);
        // Official files include states/counties. Never aggregate them into country totals.
        if (!isCountryRow(row, key)) continue;
        const date = String(row.date || '').trim();
        if (!isValidDate(date)) throw new Error(`${name}: invalid date "${date}" for ${key}. Expected YYYY-MM-DD.`);
        if (date < MIN_OBSERVATION_DATE || date > today) {
            throw new Error(`${name}: implausible observation date "${date}" for ${key}. Run prepare-data to filter and report source date anomalies.`);
        }
        const id = `${key}:${date}`;
        if (seen.has(id)) throw new Error(`${name}: duplicate country/date record for ${key} on ${date}.`);
        seen.add(id);
        const record = { country_key: key, date };
        for (const metric of metrics) {
            const value = row[metric];
            record[metric] = numericValue(value);
            if (record[metric] === null && value !== null && value !== undefined && String(value).trim() !== '') {
                throw new Error(`${name}: invalid numeric value in ${metric} for ${key} on ${date}.`);
            }
        }
        records.push(record);
    }
    if (!records.length) throw new Error(`${name}: no country-level rows found. Use ISO two-letter country keys.`);
    return records;
}

export function validateDataStructure() {
    // Prepare everything first so validation failures do not leave half-normalized state.
    const normalized = {};
    for (const [name, property] of Object.entries(DATASETS)) normalized[property] = normalizeDataset(this[property], name);
    if (!Array.isArray(this.countryIndex) || !this.countryIndex.length) throw new Error('The country index is empty.');
    const countries = new Map();
    for (const row of this.countryIndex) {
        const key = countryKey(row);
        if (!isCountryRow(row, key)) continue;
        const name = String(row.country_name || row.country || '').trim();
        if (!name) throw new Error(`Country index: missing country_name for ${key}.`);
        if (countries.has(key)) throw new Error(`Country index: duplicate country key ${key}.`);
        countries.set(key, { location_key: key, country_name: name });
    }
    if (!countries.size) throw new Error('The country index has no country-level entries.');
    for (const rows of Object.values(normalized)) {
        for (const row of rows) {
            if (!countries.has(row.country_key)) throw new Error(`Country index: no name for ${row.country_key}.`);
        }
    }
    const populationByCountry = Object.create(null);
    const demographics = [];
    if (!Array.isArray(this.demographicsData)) throw new Error('Demographics: expected CSV rows.');
    const demographicsHeaders = headers(this.demographicsData);
    if (this.demographicsData.length && !demographicsHeaders.includes('population')) {
        throw new Error('Demographics: missing required population column.');
    }
    if (this.demographicsData.length && !COUNTRY_IDENTIFIER_FIELDS.some(field => demographicsHeaders.includes(field))) {
        throw new Error('Demographics: missing country identifier (location_key, key or country_key).');
    }
    const seenPopulation = new Set();
    for (const row of this.demographicsData) {
        const key = countryKey(row);
        if (!isCountryRow(row, key) || !countries.has(key)) continue;
        if (seenPopulation.has(key)) throw new Error(`Demographics: duplicate country key ${key}.`);
        seenPopulation.add(key);
        const population = numericValue(row.population);
        if ((population === null && String(row.population ?? '').trim()) || population < 0) {
            throw new Error(`Demographics: invalid population for ${key}.`);
        }
        // A source population of zero cannot be a denominator.
        if (population !== null && population > 0) populationByCountry[key] = population;
        demographics.push({ location_key: key, population });
    }
    Object.assign(this, normalized, {
        countryIndex: [...countries.values()], demographicsData: demographics, populationByCountry,
        populationSource: demographics.length ? (this.dataSource === 'sample' ? 'fictional demonstration estimates' :
            this.dataSource === 'upload' ? 'uploaded demographics CSV' : 'Google COVID-19 Open Data demographics') : null
    });
}

export function processData() {
    const allDates = new Set();
    for (const [name, property] of Object.entries(DATASETS)) {
        const rows = this[property];
        this.availableColumns[name] = Object.keys(rows[0] || {}).filter(field => !METADATA.has(field));
        // Reported zeroes and negative corrections must remain selectable.
        this.datesByDataset[name] = [...new Set(rows.filter(row =>
            this.availableColumns[name].some(column => row[column] !== null)).map(row => row.date))].sort();
        for (const date of this.datesByDataset[name]) allDates.add(date);
    }
    this.availableDates = [...allDates].sort();
    if (!this.availableDates.length) throw new Error('The data contains no reported numeric values.');
    if (!this.availableDates.includes(this.currentDate)) this.currentDate = this.availableDates.at(-1);
}

export function buildCountryCodeMap() {
    this.countryCodeMap = Object.create(null);
    this.countryNameMap = Object.create(null);
    for (const row of this.countryIndex) {
        this.countryCodeMap[row.country_name.toLowerCase().trim()] = row.location_key;
        this.countryNameMap[row.location_key] = row.country_name;
    }
    const aliases = {
        'united states': 'us', 'united states of america': 'us', usa: 'us',
        'united kingdom': 'gb', uk: 'gb', russia: 'ru', 'russian federation': 'ru',
        china: 'cn', "people's republic of china": 'cn',
        'south korea': 'kr', 'korea, republic of': 'kr', 'republic of korea': 'kr',
        'north korea': 'kp', "korea, democratic people's republic of": 'kp',
        iran: 'ir', 'iran, islamic republic of': 'ir',
        'ivory coast': 'ci', "côte d'ivoire": 'ci', 'czech republic': 'cz', czechia: 'cz',
        'democratic republic of the congo': 'cd', 'dem. rep. congo': 'cd',
        'republic of the congo': 'cg', congo: 'cg', taiwan: 'tw',
        'united republic of tanzania': 'tz', 's. sudan': 'ss', 'central african rep.': 'cf',
        'bosnia and herz.': 'ba', 'dominican rep.': 'do', 'eq. guinea': 'gq',
        'solomon is.': 'sb', 'falkland is.': 'fk', 'w. sahara': 'eh',
        'n. cyprus': 'cy', eswatini: 'sz', swaziland: 'sz', 'timor-leste': 'tl',
        'east timor': 'tl', 'the bahamas': 'bs', bahamas: 'bs', 'the gambia': 'gm'
    };
    for (const [alias, key] of Object.entries(aliases)) {
        if (this.countryNameMap[key]) this.countryCodeMap[alias] = key;
    }
}

export function setDefaultValues() {
    const columns = this.availableColumns[this.currentDataset] || [];
    const preferred = { epidem: 'new_confirmed', hospitalizations: 'current_hospitalized_patients', vaccinations: 'new_persons_vaccinated' };
    this.currentColumn = columns.includes(preferred[this.currentDataset]) ? preferred[this.currentDataset] : columns[0] || null;
}
