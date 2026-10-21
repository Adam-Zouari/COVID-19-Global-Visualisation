import { numericValue } from './utils.js';

import { UNIT_DEFINITIONS } from './metrics.js';

const DATASETS = { epidem: 'epidemData', hospitalizations: 'hospitalizationsData', vaccinations: 'vaccinationsData' };
const DARK_PALETTES = {
    epidem: ['#68434c', '#894550', '#ae505c', '#d2656b', '#ef9290', '#ffd0bd'],
    hospitalizations: ['#52426b', '#685085', '#8264aa', '#a082d0', '#bda4ec', '#dfd1fc'],
    vaccinations: ['#285758', '#32726f', '#3d9186', '#55b39e', '#8ad6bc', '#bff2d7']
};
const LIGHT_PALETTES = {
    epidem: ['#fce5de', '#f5b9aa', '#e88878', '#cd5b52', '#a7373f', '#782537'],
    hospitalizations: ['#ede6f8', '#d3c2ec', '#b69ad9', '#916abd', '#70469c', '#502b79'],
    vaccinations: ['#d8eee6', '#afd9ca', '#7cbdab', '#4a9b89', '#267968', '#125947']
};
const APPEARANCES = {
    dark: { palettes: DARK_PALETTES, missing: '#475569', correction: ['#fff3d6', '#aa6611'] },
    light: { palettes: LIGHT_PALETTES, missing: '#c2cad5', correction: ['#f6d99a', '#925410'] }
};

function appearance() {
    // The service also runs without a browser, including CSV preparation/tests.
    return globalThis.window?.AtlasTheme?.getResolvedTheme?.() === 'light' ? 'light' : 'dark';
}

function cacheKey(service, countryKey, date) {
    return `${appearance()}:${service.currentDataset}:${service.currentColumn}:${service.displayUnit}:${service.smoothing}:${date}:${countryKey.trim().toLowerCase()}`;
}

function interpolate(start, end, amount) {
    const a = start.slice(1).match(/../g).map(value => parseInt(value, 16));
    const b = end.slice(1).match(/../g).map(value => parseInt(value, 16));
    return `rgb(${a.map((value, i) => Math.round(value + (b[i] - value) * amount)).join(', ')})`;
}

function valueColor(palette, colors, value, range) {
    if (value === null) return colors.missing;
    if (value < 0) return interpolate(...colors.correction, Math.sqrt(Math.min(1, value / Math.min(-range.correctionAnchor, range.min))));
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
    const key = cacheKey(this, countryKey, date);
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
    this.colorCache.set(cacheKey(this, countryKey, this.currentDate), color);
    return color;
}

export function getDefaultColor() {
    return APPEARANCES[appearance()].missing;
}

export function getColorScale() {
    const [min, max] = this.getDisplayDomain();
    // A population rate represents the same quantity at either group size.
    // Scale its logarithmic anchor as well as its domain to preserve map colors.
    const rate = ['per100k', 'per1m'].includes(this.displayUnit);
    const range = { min, max, linear: this.displayUnit === 'percent',
        anchor: rate ? UNIT_DEFINITIONS[this.displayUnit].factor * 1e-7 : this.displayUnit === 'per100' ? 0.1 : 1,
        correctionAnchor: rate ? UNIT_DEFINITIONS[this.displayUnit].factor / 100_000 : 1 };
    const colors = APPEARANCES[appearance()];
    const palette = colors.palettes[this.currentDataset] || colors.palettes.epidem;
    const scale = value => valueColor(palette, colors, numericValue(value), range);
    scale.domain = () => [range.min, range.max];
    scale.colors = () => [...palette];
    scale.type = range.linear ? 'linear' : 'logarithmic';
    scale.breaks = () => Array.from({ length: 7 }, (_, index) => range.linear ? max * index / 6 :
        Math.expm1(Math.log1p(max / range.anchor) * index / 6) * range.anchor);
    return scale;
}
