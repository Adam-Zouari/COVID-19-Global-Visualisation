const DEFAULTS = {
    view: 'explore', category: 'epidem', metric: 'new_confirmed', unit: 'count',
    smoothing: 'raw', selectedDate: null, selectedCountry: null, analysisOpen: false,
    compareCountries: [], compareRange: { start: 0, end: 100 }, compareLayout: 'combined',
    compareChartType: 'line', compareScale: 'shared', compareChartOptions: {}, dataMode: 'csv'
};

import { UNIT_DEFINITIONS } from '../dataService/metrics.js';
import { CHART_TYPES, readChartOptions } from '../charts/chartTypes.js';

export function createStore(initial = {}) {
    let state = Object.freeze({ ...DEFAULTS, ...initial, analysisOpen: initial.analysisOpen === true,
        compareCountries: Object.freeze([...(initial.compareCountries || [])]),
        compareRange: Object.freeze({ ...(initial.compareRange || DEFAULTS.compareRange) }),
        compareChartOptions: Object.freeze(readChartOptions(initial.compareChartOptions)) });
    const subscribers = new Set();
    return {
        getState: () => state,
        setState(patch) {
            const changes = typeof patch === 'function' ? patch(state) : patch;
            const next = { ...state, ...changes };
            next.analysisOpen = next.analysisOpen === true;
            if (Array.isArray(next.compareCountries)) next.compareCountries = Object.freeze([...next.compareCountries]);
            if (next.compareRange) next.compareRange = Object.freeze({ ...next.compareRange });
            if (next.compareChartOptions) next.compareChartOptions = Object.freeze(readChartOptions(next.compareChartOptions));
            if (Object.keys(next).every(key => JSON.stringify(next[key]) === JSON.stringify(state[key]))) return state;
            const previous = state;
            state = Object.freeze(next);
            subscribers.forEach(listener => listener(state, previous));
            return state;
        },
        subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); }
    };
}

export function readURLState(search) {
    const params = new URLSearchParams(search);
    const category = ['epidem', 'hospitalizations', 'vaccinations'].includes(params.get('category')) ? params.get('category') : 'epidem';
    const unit = Object.hasOwn(UNIT_DEFINITIONS, params.get('unit')) ? params.get('unit') : 'count';
    const compareCountries = [...new Set((params.get('compare') || '').toLowerCase().split(',').filter(code => /^[a-z]{2}$/.test(code)))].slice(0, 4);
    const country = params.get('country')?.toLowerCase();
    const selectedCountry = /^[a-z]{2}$/.test(country || '') ? country : null;
    const range = (params.get('range') || '0,100').split(',').map(Number);
    const validRange = range.length === 2 && range.every(value => Number.isFinite(value) && value >= 0 && value <= 100);
    let chartOptions = {};
    try { if ((params.get('chartOptions') || '').length <= 1500) chartOptions = readChartOptions(JSON.parse(params.get('chartOptions') || '{}')); } catch { /* Ignore invalid shared chart options. */ }
    return {
        category, unit, metric: params.get('metric') || null,
        smoothing: params.get('smooth') === '7day' ? '7day' : 'raw',
        view: params.get('view') === 'compare' ? 'compare' : 'explore',
        selectedDate: /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : null,
        selectedCountry,
        analysisOpen: params.get('analysis') === '1' && selectedCountry !== null,
        compareCountries,
        compareRange: validRange ? { start: Math.min(...range), end: Math.max(...range) } : { start: 0, end: 100 },
        compareLayout: params.get('layout') === 'separate' ? 'separate' : 'combined',
        compareChartType: Object.hasOwn(CHART_TYPES, params.get('chart')) && CHART_TYPES[params.get('chart')].compare ? params.get('chart') : 'line',
        compareChartOptions: chartOptions,
        compareScale: params.get('scale') === 'independent' ? 'independent' : 'shared',
        dataMode: params.get('data') === 'sample' ? 'sample' : 'csv'
    };
}

export function stateToURL(state, currentURL) {
    const url = new URL(currentURL);
    const entries = {
        data: state.dataMode === 'sample' ? 'sample' : null,
        view: state.view === 'compare' ? 'compare' : null,
        category: state.category === 'epidem' ? null : state.category,
        metric: state.metric, unit: state.unit === 'count' ? null : state.unit,
        smooth: state.smoothing === '7day' ? '7day' : null,
        date: state.selectedDate, country: state.selectedCountry,
        analysis: state.analysisOpen === true && typeof state.selectedCountry === 'string' && /^[a-z]{2}$/i.test(state.selectedCountry) ? '1' : null,
        compare: state.compareCountries?.length ? state.compareCountries.join(',') : null,
        layout: state.compareLayout === 'separate' ? 'separate' : null,
        chart: state.compareChartType !== 'line' && Object.hasOwn(CHART_TYPES, state.compareChartType) && CHART_TYPES[state.compareChartType].compare ? state.compareChartType : null,
        chartOptions: state.compareChartOptions && Object.keys(state.compareChartOptions).length ? JSON.stringify(readChartOptions(state.compareChartOptions)) : null,
        scale: state.compareScale === 'independent' ? 'independent' : null,
        range: state.compareRange && (state.compareRange.start !== 0 || state.compareRange.end !== 100)
            ? `${state.compareRange.start},${state.compareRange.end}` : null
    };
    for (const [key, value] of Object.entries(entries)) {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
    }
    return url;
}
