import { isValidDate } from '../dataService/utils.js';

const scopes = ['country', 'compare'];
const read = service => ({
    category: service.currentDataset, metric: service.currentColumn,
    unit: service.displayUnit || 'count', smoothing: service.smoothing || 'raw',
    selectedDate: service.currentDate
});

/** Views own only their selections; observations, indexes and caches stay shared. */
export function createWorkspaces(service) {
    const views = new Map();
    const metrics = new Map();
    const allScopes = ['globe', ...scopes];
    const validMetric = (category, metric) => service.availableColumns[category]?.includes(metric);
    function remember(scope, view) {
        if (!metrics.has(scope)) metrics.set(scope, {});
        if (validMetric(view.currentDataset, view.currentColumn)) metrics.get(scope)[view.currentDataset] = view.currentColumn;
    }
    function normalize(view, settings) {
        const category = Object.hasOwn(service.availableColumns, settings.category) ? settings.category : service.currentDataset;
        view.currentDataset = category;
        const columns = service.availableColumns[category] || [];
        if (columns.includes(settings.metric)) view.currentColumn = settings.metric;
        else if (view.setDefaultValues) view.setDefaultValues();
        else view.currentColumn = columns[0] || null;
        const metric = view.getMetricMetadata(view.currentColumn) || { allowedUnits: ['count'], smoothingAllowed: false };
        const population = service.getAllCountries().some(country => service.getPopulation(country.countryCode) > 0);
        view.displayUnit = metric.allowedUnits.includes(settings.unit) && (settings.unit === 'count' || population) ? settings.unit : 'count';
        view.smoothing = settings.smoothing === '7day' && metric.smoothingAllowed ? '7day' : 'raw';
        const dates = view.getAvailableDates();
        const requested = isValidDate(settings.selectedDate) ? settings.selectedDate : service.currentDate;
        view.currentDate = dates.length ? !isValidDate(requested) ? dates.at(-1) :
            requested < dates[0] ? dates[0] : requested > dates.at(-1) ? dates.at(-1) : requested : null;
        return view;
    }
    const manager = {
        peek(scope) { return scope === 'globe' ? service : views.get(scope) || null; },
        ensure(scope, settings) {
            if (scope === 'globe') return service;
            if (!scopes.includes(scope)) throw new RangeError(`Unknown workspace: ${scope}`);
            if (!views.has(scope)) views.set(scope, normalize(Object.create(service), settings || read(service)));
            else if (settings) {
                remember(scope, views.get(scope));
                normalize(views.get(scope), settings);
            }
            remember(scope, views.get(scope));
            return views.get(scope);
        },
        get(scope) { return this.ensure(scope); },
        read(scope) { const view = this.peek(scope); return view ? read(view) : null; },
        update(scope, patch) {
            const view = this.ensure(scope);
            remember(scope, view);
            normalize(view, { ...read(view), ...patch });
            remember(scope, view);
            return view;
        },
        switchDataset(scope, category) {
            const view = this.ensure(scope);
            if (!Object.hasOwn(service.availableColumns, category)) throw new RangeError(`Unknown dataset: ${category}`);
            remember(scope, view);
            if (view.currentDataset === category && validMetric(category, view.currentColumn)) return view;
            const metric = metrics.get(scope)[category];
            view.changeDataset(category);
            if (validMetric(category, metric)) view.changeColumn(metric);
            if (scope !== 'globe') normalize(view, read(view));
            remember(scope, view);
            return view;
        },
        snapshotMetrics() {
            const result = {};
            for (const scope of allScopes) {
                const view = this.peek(scope);
                if (view) remember(scope, view);
                const entries = Object.entries(metrics.get(scope) || {}).filter(([category, metric]) => validMetric(category, metric));
                if (entries.length) result[scope] = Object.fromEntries(entries);
            }
            return result;
        },
        restoreMetrics(saved = {}) {
            metrics.clear();
            for (const scope of allScopes) {
                const entries = Object.keys(service.availableColumns).flatMap(category =>
                    validMetric(category, saved?.[scope]?.[category]) ? [[category, saved[scope][category]]] : []);
                if (entries.length) metrics.set(scope, Object.fromEntries(entries));
            }
        },
        revalidate() {
            this.restoreMetrics(this.snapshotMetrics());
            for (const [scope, view] of views) {
                normalize(view, read(view));
                remember(scope, view);
            }
        }
    };
    return manager;
}
