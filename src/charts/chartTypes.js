/** Capabilities shared by controls and URL validation. */
export const CHART_TYPES = Object.freeze({
    line: { label: 'Trend line', country: true, compare: true, period: true, metric: true, separate: true },
    bar: { label: 'Bars', country: true, compare: true, period: true, metric: true, separate: true },
    area: { label: 'Area', country: true, period: true, metric: true },
    heatmap: { label: 'Heatmap', country: true, compare: true, period: true, metric: true },
    horizontal: { label: 'Horizontal bars', compare: true, snapshot: true, metric: true },
    scatter: { label: 'Scatter plot', country: true, compare: true, period: true, metric: true },
    dumbbell: { label: 'Dumbbell', compare: true, period: true, metric: true },
    box: { label: 'Box plot', country: true, compare: true, period: true, metric: true }
});

export function readChartOptions(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result = {};
    if (/^\d{4}-\d{2}-\d{2}$/.test(value.date || '') && Number.isFinite(Date.parse(value.date)) &&
        new Date(value.date).toISOString().slice(0, 10) === value.date) result.date = value.date;
    for (const key of ['xMetric', 'yMetric'])
        if (typeof value[key] === 'string' && /^(new|current|cumulative|total)_[a-z0-9_]{1,100}$/.test(value[key])) result[key] = value[key];
    for (const key of ['xUnit', 'yUnit'])
        if (['count', 'per100k', 'per1m', 'percent', 'per100'].includes(value[key])) result[key] = value[key];
    if (['raw', '7day'].includes(value.smoothing)) result.smoothing = value.smoothing;
    return result;
}
