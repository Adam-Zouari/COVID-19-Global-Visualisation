const DEFAULTS = {
    view: 'explore', category: 'epidem', metric: 'new_confirmed', unit: 'count',
    smoothing: 'raw', selectedDate: null, selectedCountry: null, analysisOpen: false,
    analysisSettings: null, analysisChartType: 'line', analysisRange: { start: 0, end: 100 }, analysisChartOptions: {},
    compareCountries: [], compareRange: { start: 0, end: 100 }, compareLayout: 'combined',
    compareChartType: 'line', compareScale: 'shared', compareChartOptions: {}, compareSettings: null, dataMode: 'csv', workspaceMetrics: {}
};

import { UNIT_DEFINITIONS } from '../dataService/metrics.js';
import { CHART_TYPES, readChartOptions } from '../charts/chartTypes.js';
import { isValidDate } from '../dataService/utils.js';

const categories = ['epidem', 'hospitalizations', 'vaccinations'];
const metricIdentifier = value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,127}$/.test(value);

/** Remember a bounded set of category selections without accepting arbitrary state keys. */
export function readWorkspaceMetrics(value) {
    const result = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    for (const scope of ['globe', 'country', 'compare']) {
        if (!Object.hasOwn(value, scope)) continue;
        const choices = value[scope];
        if (!choices || typeof choices !== 'object' || Array.isArray(choices)) continue;
        const selected = {};
        for (const category of categories)
            if (Object.hasOwn(choices, category) && metricIdentifier(choices[category])) selected[category] = choices[category];
        if (Object.keys(selected).length) result[scope] = selected;
    }
    return result;
}

/** URL settings describe one view; loaded data and source selection remain shared. */
export function readWorkspaceSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !categories.includes(value.category)) return null;
    return {
        category: value.category,
        metric: metricIdentifier(value.metric) ? value.metric : null,
        unit: typeof value.unit === 'string' && Object.hasOwn(UNIT_DEFINITIONS, value.unit) ? value.unit : 'count',
        smoothing: value.smoothing === '7day' ? '7day' : 'raw',
        selectedDate: isValidDate(value.selectedDate) ? value.selectedDate : null
    };
}

function readRange(value) {
    return value && [value.start, value.end].every(number => typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= 100)
        ? { start: Math.min(value.start, value.end), end: Math.max(value.start, value.end) } : { start: 0, end: 100 };
}

function readJSON(params, key, normalize, fallback, maxLength = 1500) {
    const value = params.get(key);
    if (!value || value.length > maxLength) return fallback;
    try { return normalize(JSON.parse(value)); }
    catch { return fallback; }
}

function freezeState(value) {
    const result = { ...value, analysisOpen: value.analysisOpen === true,
        compareCountries: Object.freeze([...(Array.isArray(value.compareCountries) ? value.compareCountries : [])]),
        analysisChartType: Object.hasOwn(CHART_TYPES, value.analysisChartType) && CHART_TYPES[value.analysisChartType].country ? value.analysisChartType : 'line' };
    for (const scope of ['analysis', 'compare']) {
        const settings = readWorkspaceSettings(value[`${scope}Settings`]);
        result[`${scope}Settings`] = settings ? Object.freeze(settings) : null;
        result[`${scope}Range`] = Object.freeze(readRange(value[`${scope}Range`]));
        result[`${scope}ChartOptions`] = Object.freeze(readChartOptions(value[`${scope}ChartOptions`]));
    }
    const metrics = readWorkspaceMetrics(value.workspaceMetrics);
    for (const choices of Object.values(metrics)) Object.freeze(choices);
    result.workspaceMetrics = Object.freeze(metrics);
    return Object.freeze(result);
}

export function createStore(initial = {}) {
    let state = freezeState({ ...DEFAULTS, ...initial });
    const subscribers = new Set();
    return {
        getState: () => state,
        setState(patch) {
            const changes = typeof patch === 'function' ? patch(state) : patch;
            const next = freezeState({ ...state, ...changes });
            if (Object.keys(next).every(key => JSON.stringify(next[key]) === JSON.stringify(state[key]))) return state;
            const previous = state;
            state = next;
            subscribers.forEach(listener => listener(state, previous));
            return state;
        },
        subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); }
    };
}

export function readURLState(search) {
    const params = new URLSearchParams(search);
    const category = categories.includes(params.get('category')) ? params.get('category') : 'epidem';
    const unit = Object.hasOwn(UNIT_DEFINITIONS, params.get('unit')) ? params.get('unit') : 'count';
    const compareCountries = [...new Set((params.get('compare') || '').toLowerCase().split(',').filter(code => /^[a-z]{2}$/.test(code)))].slice(0, 4);
    const country = params.get('country')?.toLowerCase();
    const selectedCountry = /^[a-z]{2}$/.test(country || '') ? country : null;
    const range = key => {
        const numbers = (params.get(key) || '0,100').split(',').map(Number);
        return readRange(numbers.length === 2 ? { start: numbers[0], end: numbers[1] } : null);
    };
    return {
        category, unit, metric: params.get('metric') || null,
        smoothing: params.get('smooth') === '7day' ? '7day' : 'raw',
        view: params.get('view') === 'compare' ? 'compare' : 'explore',
        selectedDate: /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : null,
        selectedCountry,
        analysisOpen: params.get('analysis') === '1' && selectedCountry !== null,
        analysisSettings: readJSON(params, 'analysisSettings', readWorkspaceSettings, null),
        analysisChartType: Object.hasOwn(CHART_TYPES, params.get('analysisChart')) && CHART_TYPES[params.get('analysisChart')].country ? params.get('analysisChart') : 'line',
        analysisRange: range('analysisRange'),
        analysisChartOptions: readJSON(params, 'analysisChartOptions', readChartOptions, {}),
        compareCountries,
        compareRange: range('range'),
        compareLayout: params.get('layout') === 'separate' ? 'separate' : 'combined',
        compareChartType: Object.hasOwn(CHART_TYPES, params.get('chart')) && CHART_TYPES[params.get('chart')].compare ? params.get('chart') : 'line',
        compareChartOptions: readJSON(params, 'chartOptions', readChartOptions, {}),
        compareSettings: readJSON(params, 'compareSettings', readWorkspaceSettings, null),
        compareScale: params.get('scale') === 'independent' ? 'independent' : 'shared',
        dataMode: params.get('data') === 'sample' ? 'sample' : 'csv',
        workspaceMetrics: readJSON(params, 'workspaceMetrics', readWorkspaceMetrics, {}, 2000)
    };
}

export function stateToURL(state, currentURL) {
    const url = new URL(currentURL);
    const settingsJSON = value => {
        const settings = readWorkspaceSettings(value);
        return settings ? JSON.stringify(settings) : null;
    };
    const optionsJSON = value => {
        const options = readChartOptions(value);
        return Object.keys(options).length ? JSON.stringify(options) : null;
    };
    const rangeText = value => {
        const range = readRange(value);
        return range.start !== 0 || range.end !== 100 ? `${range.start},${range.end}` : null;
    };
    const workspaceMetrics = readWorkspaceMetrics(state.workspaceMetrics);
    const entries = {
        data: state.dataMode === 'sample' ? 'sample' : null,
        view: state.view === 'compare' ? 'compare' : null,
        category: state.category === 'epidem' ? null : state.category,
        metric: state.metric, unit: state.unit === 'count' ? null : state.unit,
        smooth: state.smoothing === '7day' ? '7day' : null,
        date: state.selectedDate, country: state.selectedCountry,
        analysis: state.analysisOpen === true && typeof state.selectedCountry === 'string' && /^[a-z]{2}$/i.test(state.selectedCountry) ? '1' : null,
        analysisSettings: settingsJSON(state.analysisSettings),
        analysisChart: state.analysisChartType !== 'line' && Object.hasOwn(CHART_TYPES, state.analysisChartType) && CHART_TYPES[state.analysisChartType].country ? state.analysisChartType : null,
        analysisRange: rangeText(state.analysisRange),
        analysisChartOptions: optionsJSON(state.analysisChartOptions),
        compare: state.compareCountries?.length ? state.compareCountries.join(',') : null,
        layout: state.compareLayout === 'separate' ? 'separate' : null,
        chart: state.compareChartType !== 'line' && Object.hasOwn(CHART_TYPES, state.compareChartType) && CHART_TYPES[state.compareChartType].compare ? state.compareChartType : null,
        chartOptions: optionsJSON(state.compareChartOptions),
        compareSettings: settingsJSON(state.compareSettings),
        scale: state.compareScale === 'independent' ? 'independent' : null,
        range: rangeText(state.compareRange),
        workspaceMetrics: Object.keys(workspaceMetrics).length ? JSON.stringify(workspaceMetrics) : null
    };
    for (const [key, value] of Object.entries(entries)) {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
    }
    return url;
}
