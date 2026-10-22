import { getMetricMetadata } from './metrics.js';
import { isValidDate, numericValue } from './utils.js';
import { UNIT_DEFINITIONS } from './metrics.js';

const DAY = 86_400_000;
const isSmoothed = value => ['7day', '7-day', '7-day-average', '7-day average'].includes(value);
const availabilityHistory = new WeakMap();

function options(service, options = {}) {
    const column = options.column || service.currentColumn;
    const metadata = getMetricMetadata(column);
    const unit = options.unit || service.displayUnit || 'count';
    const smoothing = isSmoothed(options.smoothing || service.smoothing) && metadata?.smoothingAllowed ? '7day' : 'raw';
    const dataset = service.availableColumns[service.currentDataset]?.includes(column) ? service.currentDataset :
        Object.keys(service.availableColumns).find(name => service.availableColumns[name].includes(column)) || metadata?.dataset;
    return { column, unit, smoothing, dataset, valid: Boolean(metadata?.allowedUnits.includes(unit)) };
}

function transform(service, country, value, unit) {
    if (value === null) return null;
    if (unit === 'count') return value;
    const population = service.getPopulation(country);
    return population === null ? null : value / population * UNIT_DEFINITIONS[unit].factor;
}

function observation(service, country, date, settings) {
    return numericValue(service.indexedData[settings.dataset]?.[country]?.[date]?.[settings.column]);
}

function displayed(service, country, date, settings) {
    const rawValue = observation(service, country, date, settings);
    // A trend must never imply that an absent selected-day report was observed.
    if (rawValue === null || !settings.valid) return null;
    let value = rawValue;
    if (settings.smoothing === '7day') {
        // Average reported daily additions or occupancy snapshots. Occupancy is
        // a stock of patients in care, never admissions summed across days.
        const end = Date.parse(`${date}T00:00:00Z`);
        const firstDate = service.datesByDataset[settings.dataset]?.[0];
        const start = new Date(end - 6 * DAY).toISOString().slice(0, 10);
        // Require a complete seven-calendar-day window inside the source period.
        if (!firstDate || start < firstDate) return null;
        let total = 0, count = 0;
        for (let offset = 0; offset < 7; offset++) {
            const day = new Date(end - offset * DAY).toISOString().slice(0, 10);
            const reported = observation(service, country, day, settings);
            if (reported !== null) { total += reported; count++; }
        }
        if (count < 5) return null;
        value = total / count;
    }
    return transform(service, country, value, settings.unit);
}

export function getPopulation(code) {
    if (typeof code !== 'string') return null;
    return this.populationByCountry[code.trim().toLowerCase()] ?? null;
}

/** Reported dates for the selected metric, independent of its display transformation. */
export function getAvailableDates(column = this.currentColumn) {
    const settings = options(this, { column });
    const key = `${settings.dataset}:${column}`;
    if (this.metricDatesCache.has(key)) return this.metricDatesCache.get(key);
    const dates = (this.datesByDataset[settings.dataset] || []).filter(date =>
        (this.dataByDate[settings.dataset]?.[date] || []).some(row => numericValue(row[column]) !== null));
    this.metricDatesCache.set(key, dates);
    return dates;
}

/** Start on recent broadly reported data rather than a sparse archive tail. */
export function getSuggestedDate(column = this.currentColumn) {
    const settings = options(this, { column });
    const coverage = this.getAvailableDates(column).map(date => ({ date,
        count: (this.dataByDate[settings.dataset]?.[date] || []).filter(row => numericValue(row[column]) !== null).length
    }));
    const peak = coverage.reduce((maximum, day) => Math.max(maximum, day.count), 0);
    return coverage.findLast(day => day.count >= peak * 0.8)?.date || null;
}

export function getDisplayValue(code, requested = {}) {
    if (typeof code !== 'string') return null;
    const date = requested.date || this.currentDate;
    if (!isValidDate(date)) return null;
    return displayed(this, code.trim().toLowerCase(), date, options(this, requested));
}

/** Explain absence without confusing an index entry, a missing report, and a missing denominator. */
export function getCountryAvailability(code, requested = {}) {
    if (typeof code !== 'string') return { status: 'no-observations', label: 'No observations for this metric', description: '' };
    const country = code.trim().toLowerCase();
    const settings = options(this, requested);
    const date = requested.date || this.currentDate;
    if (!settings.valid) return {
        status: 'unsupported-unit', label: 'Unit unavailable for this metric',
        description: 'Choose a display unit supported by the selected metric.'
    };
    // A raw history scan is much cheaper than building every country's transformed
    // calendar series when opening search. Replacing the data index invalidates it.
    let cache = availabilityHistory.get(this);
    if (!cache || cache.index !== this.indexedData) {
        cache = { index: this.indexedData, metrics: new Map() };
        availabilityHistory.set(this, cache);
    }
    const key = `${settings.dataset}:${settings.column}`;
    if (!cache.metrics.has(key)) cache.metrics.set(key, new Map());
    const countries = cache.metrics.get(key);
    if (!countries.has(country)) {
        countries.set(country, Object.values(this.indexedData[settings.dataset]?.[country] || {})
            .some(record => numericValue(record[settings.column]) !== null));
    }
    if (!countries.get(country)) return {
        status: 'no-observations', label: 'No observations for this metric',
        description: 'This location is in the geographic index, but has no source observations for the selected metric.'
    };
    const reported = observation(this, country, date, settings);
    if (reported === null) return {
        status: 'other-dates', label: 'No report on selected date',
        description: 'Source observations for this metric are available on other dates.'
    };
    if (settings.unit !== 'count' && this.getPopulation(country) === null) return {
        status: 'missing-population', label: 'Population unavailable',
        description: 'A source observation is available, but the selected population-adjusted value cannot be calculated.'
    };
    if (settings.smoothing === '7day' && displayed(this, country, date, settings) === null) return {
        status: 'insufficient-history', label: 'Insufficient reports for average',
        description: 'This date has a source observation, but a seven-day average needs a full calendar window and at least five reports.'
    };
    return {
        status: 'available', label: 'Data available',
        description: `An observation is available for ${date}${reported === 0 ? '; a reported zero is data' : ''}.`
    };
}

export function getCountrySeries(code, requested = {}) {
    if (typeof code !== 'string') return [];
    const country = code.trim().toLowerCase();
    const settings = options(this, requested);
    const key = `${settings.dataset}:${settings.column}:${settings.unit}:${settings.smoothing}:${country}`;
    if (this.seriesCache.has(key)) return this.seriesCache.get(key);
    const dates = this.datesByDataset[settings.dataset] || [];
    if (!dates.length) return [];
    const series = [];
    const end = Date.parse(`${dates.at(-1)}T00:00:00Z`);
    for (let time = Date.parse(`${dates[0]}T00:00:00Z`); time <= end; time += DAY) {
        const date = new Date(time).toISOString().slice(0, 10);
        const rawValue = observation(this, country, date, settings);
        series.push({ date, value: displayed(this, country, date, settings), rawValue,
            reported: rawValue !== null, reportingCorrection: rawValue !== null && rawValue < 0 });
    }
    if (this.seriesCache.size >= 512) this.seriesCache.clear();
    this.seriesCache.set(key, series);
    return series;
}

/** Date-independent bounds keep map colors comparable when the timeline moves. */
export function getDisplayDomain(requested = {}) {
    const settings = options(this, requested);
    const key = `${settings.dataset}:${settings.column}:${settings.unit}:${settings.smoothing}`;
    if (this.displayDomainCache.has(key)) return this.displayDomainCache.get(key);
    let min = 0, max = 0;
    if (settings.valid) {
        for (const country of Object.keys(this.indexedData[settings.dataset] || {})) {
            if (settings.unit !== 'count' && this.getPopulation(country) === null) continue;
            for (const record of Object.values(this.indexedData[settings.dataset][country])) {
                const value = displayed(this, country, record.date, settings);
                if (value !== null) { min = Math.min(min, value); max = Math.max(max, value); }
            }
        }
    }
    const domain = [min, max];
    this.displayDomainCache.set(key, domain);
    return domain;
}
