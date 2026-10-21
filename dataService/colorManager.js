import { numericValue } from './utils.js';

const DATASETS = { epidem: 'epidemData', hospitalizations: 'hospitalizationsData', vaccinations: 'vaccinationsData' };
const PALETTES = {
    epidem: ['#402a35', '#693544', '#994350', '#c75b63', '#ed8281', '#ffd0bd'],
    hospitalizations: ['#302b4c', '#4c3c72', '#6b4fa0', '#8e70c6', '#b398e7', '#dfd1fc'],
    vaccinations: ['#173c42', '#1c5a5e', '#237d7a', '#39a89b', '#77cdb5', '#bff2d7']
};

function interpolate(start, end, amount) {
    const a = start.slice(1).match(/../g).map(value => parseInt(value, 16));
    const b = end.slice(1).match(/../g).map(value => parseInt(value, 16));
    return `rgb(${a.map((value, i) => Math.round(value + (b[i] - value) * amount)).join(', ')})`;
}

function valueColor(dataset, value, range) {
    if (value === null) return '#475569';
    if (value < 0) return interpolate('#fff3d6', '#aa6611', Math.sqrt(Math.min(1, value / Math.min(-1, range.min))));
    const palette = PALETTES[dataset] || PALETTES.epidem;
    // Fixed logarithmic bands distinguish ordinary observations from exceptional
    // peaks. Coverage percentages keep a linear, directly interpretable scale.
    const bounded = Math.max(0, Math.min(range.max, value));
    const ratio = range.linear ? bounded / (range.max || 1) :
        Math.log1p(bounded / range.anchor) / (Math.log1p(range.max / range.anchor) || 1);
    return palette[Math.min(palette.length - 1, Math.floor(ratio * palette.length))];
}

export async function indexAllData() {
    this.indexedData = Object.create(null);
    this.dataByDate = Object.create(null);
    this.seriesCache = new Map();
    this.displayDomainCache = new Map();
    this.metricDatesCache = new Map();
    for (const [name, property] of Object.entries(DATASETS)) {
        const countries = this.indexedData[name] = Object.create(null);
        const dates = this.dataByDate[name] = Object.create(null);
        for (const record of this[property]) {
            (countries[record.country_key] ||= Object.create(null))[record.date] = record;
            (dates[record.date] ||= []).push(record);
        }
    }
}

export async function precalculateColors() {
    // Only ranges are precomputed. Materializing every country/date/column color
    // multiplies memory usage and used to rescan the entire CSV for every date.
    this.globalDataRanges = Object.create(null);
    this.colorCache = new Map();
    for (const [name, property] of Object.entries(DATASETS)) {
        const ranges = this.globalDataRanges[name] = Object.create(null);
        for (const column of this.availableColumns[name]) ranges[column] = { min: 0, max: 0 };
        for (const row of this[property]) {
            for (const column of this.availableColumns[name]) {
                const value = numericValue(row[column]);
                if (value === null) continue;
                const range = ranges[column];
                range.min = Math.min(range.min, value);
                range.max = Math.max(range.max, value);
            }
        }
        for (const [column, range] of Object.entries(ranges)) {
            this.displayDomainCache.set(`${name}:${column}:count:raw`, [range.min, range.max]);
        }
    }
}

export function getCachedColor(countryKey, date) {
    if (typeof countryKey !== 'string') return null;
    const key = `${this.currentDataset}:${this.currentColumn}:${this.displayUnit}:${this.smoothing}:${date}:${countryKey.trim().toLowerCase()}`;
    return this.colorCache instanceof Map ? this.colorCache.get(key) || null : null;
}

export function getCountryColor(countryKey) {
    if (typeof countryKey !== 'string') return this.getDefaultColor();
    const cached = this.getCachedColor(countryKey, this.currentDate);
    if (cached) return cached;
    const value = this.getDisplayValue(countryKey);
    if (value === null) return this.getDefaultColor();
    const color = this.getColorScale()(value);
    if (!(this.colorCache instanceof Map)) this.colorCache = new Map();
    if (this.colorCache.size >= 2048) this.colorCache.clear();
    this.colorCache.set(`${this.currentDataset}:${this.currentColumn}:${this.displayUnit}:${this.smoothing}:${this.currentDate}:${countryKey.trim().toLowerCase()}`, color);
    return color;
}

export function getDefaultColor() {
    return '#475569';
}

export function getColorScale() {
    const [min, max] = this.getDisplayDomain();
    const range = { min, max, linear: this.displayUnit === 'percent',
        anchor: this.displayUnit === 'per100k' ? 0.01 : this.displayUnit === 'per100' ? 0.1 : 1 };
    const scale = value => valueColor(this.currentDataset, numericValue(value), range);
    scale.domain = () => [range.min, range.max];
    scale.colors = () => [...(PALETTES[this.currentDataset] || PALETTES.epidem)];
    scale.type = range.linear ? 'linear' : 'logarithmic';
    scale.breaks = () => Array.from({ length: 7 }, (_, index) => range.linear ? max * index / 6 :
        Math.expm1(Math.log1p(max / range.anchor) * index / 6) * range.anchor);
    return scale;
}
