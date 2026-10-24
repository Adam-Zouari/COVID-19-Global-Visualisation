// Semantic chart models only. Rendering, colors, and shared controls live elsewhere.
(() => {
    const DAY = 86_400_000;
    const finite = value => typeof value === 'number' && Number.isFinite(value);
    const iso = time => new Date(time).toISOString().slice(0, 10);
    const time = date => Date.parse(`${date}T00:00:00Z`);
    const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(time(date)) && iso(time(date)) === date;
    const labelDate = date => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(time(date)));
    const monthLabel = date => new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(time(date)));
    const base = (type, title) => ({ type, title, subtitle: '', note: '', warnings: [] });
    const empty = (model, message) => ({ ...model, emptyMessage: message });
    const codeOf = country => String(country.countryCode || country.code || '').trim().toLowerCase();
    const allCodes = service => [...new Set(service.getAllCountries().map(codeOf).filter(Boolean))];
    const name = (service, code) => service.getCountryName(code);
    const metadata = (service, column) => service.getMetricMetadata?.(column) || window.MetricRegistry?.getMetricMetadata(column) ||
        { column, label: column?.replaceAll('_', ' ') || 'Observations', kind: column?.startsWith('new_') ? 'daily' : column?.startsWith('current_') ? 'occupancy' : 'cumulative', allowedUnits: ['count'] };
    const unitLabel = (service, column, unit) => service.getUnitLabel?.(column, unit) || unit;
    const mode = (metric, smoothing) => smoothing === '7day' && metric.kind !== 'cumulative' && metric.smoothingAllowed !== false ? '7day' : 'raw';
    const treatment = options => options.metric.kind === 'cumulative' ? 'Reported cumulative' :
        options.smoothing === '7day' ? options.metric.kind === 'occupancy' ? '7-day mean occupancy' : '7-day average' :
            options.metric.kind === 'occupancy' ? 'Daily snapshot' : 'Daily reports';
    const reported = point => Boolean(point && (typeof point.reported === 'boolean' ? point.reported : finite(point.rawValue) || finite(point.value)));

    function selectedCodes(service, settings) {
        const known = new Set(allCodes(service));
        const selected = settings.scope === 'country' && settings.country ? [settings.country] : settings.countries || (settings.country ? [settings.country] : []);
        return [...new Set(selected.map(code => String(code).trim().toLowerCase()))].filter(code => known.has(code));
    }

    function selection(service, settings) {
        const column = settings.column || service.currentColumn;
        const metric = metadata(service, column);
        return { column, metric, unit: settings.unit || service.displayUnit || 'count', smoothing: mode(metric, settings.smoothing || service.smoothing) };
    }

    function series(service, code, options) {
        return service.getCountrySeries(code, { column: options.column, unit: options.unit, smoothing: options.smoothing });
    }

    function rangeFor(service, codes, options, settings) {
        const histories = codes.map(code => series(service, code, options));
        const starts = histories.map(points => points[0]?.date).filter(validDate).sort();
        const ends = histories.map(points => points.at(-1)?.date).filter(validDate).sort();
        const start = settings.startDate || starts[0], end = settings.endDate || ends.at(-1);
        if (!validDate(start) || !validDate(end) || start > end) return null;
        // The atlas is historical; bound calendar expansion to available source coverage.
        return starts.length && ends.length ? { start: start < starts[0] ? starts[0] : start, end: end > ends.at(-1) ? ends.at(-1) : end, histories } : null;
    }

    function context(service, settings, options) {
        const date = settings.date || service.currentDate;
        return { date, subtitle: `${options.metric.label} · ${unitLabel(service, options.column, options.unit)}${options.smoothing === '7day' ? ' · 7-day average' : ''}${validDate(date) ? ` · ${labelDate(date)}` : ''}` };
    }

    function horizontal(service, settings) {
        const options = selection(service, settings), model = base('horizontal', 'Country ranking');
        const { date, subtitle } = context(service, settings, options);
        Object.assign(model, { items: [], date, subtitle, unitLabel: unitLabel(service, options.column, options.unit) });
        if (!validDate(date)) return empty(model, 'Choose a valid observation date.');
        model.items = selectedCodes(service, settings).map(code => ({ code, label: name(service, code), value: service.getDisplayValue(code, { ...options, date }) }))
            .filter(item => finite(item.value)).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
        model.note = 'Same-date values for the selected countries; missing values are excluded. Negative corrections remain signed.';
        return model.items.length ? model : empty(model, 'No selected locations report a displayable value on this date.');
    }

    function periodBins(start, end) {
        const first = new Date(time(start)), last = new Date(time(end));
        first.setUTCDate(first.getUTCDate() - (first.getUTCDay() + 6) % 7);
        const weekly = Math.floor((+last - +first) / (7 * DAY)) + 1 <= 40;
        const calendarStart = new Date(time(start));
        const months = (last.getUTCFullYear() - calendarStart.getUTCFullYear()) * 12 + last.getUTCMonth() - calendarStart.getUTCMonth() + 1;
        const step = weekly ? 1 : Math.max(1, Math.ceil(months / 40));
        if (!weekly) first.setTime(time(`${start.slice(0, 7)}-01`));
        const bins = [];
        for (let cursor = +first; cursor <= time(end);) {
            const next = new Date(cursor);
            if (weekly) next.setUTCDate(next.getUTCDate() + 7); else next.setUTCMonth(next.getUTCMonth() + step);
            const stop = +next - DAY;
            bins.push({ key: iso(cursor), label: weekly ? labelDate(iso(cursor)) : step === 1 ? monthLabel(iso(cursor)) : `${monthLabel(iso(cursor))}–${monthLabel(iso(stop))}`,
                start: iso(cursor), end: iso(stop), expectedDays: Math.round((stop - cursor) / DAY) + 1 });
            cursor = +next;
        }
        return bins;
    }

    function aggregate(points, bin, range, options) {
        const from = bin.start < range.start ? range.start : bin.start, to = bin.end > range.end ? range.end : bin.end;
        const selectedDays = Math.max(0, Math.round((time(to) - time(from)) / DAY) + 1);
        let reportedDays = 0, availableDays = 0, sum = 0;
        for (let cursor = time(from); cursor <= time(to); cursor += DAY) {
            const point = points.get(iso(cursor));
            if (reported(point)) reportedDays++;
            if (finite(point?.value)) { availableDays++; sum += point.value; }
        }
        const value = options.metric.kind === 'cumulative' ? points.get(to)?.value ?? null :
            !availableDays ? null : options.metric.kind === 'daily' && options.smoothing === 'raw' ? sum : sum / availableDays;
        return { key: bin.key, label: `${labelDate(from)}–${labelDate(to)}`, value: finite(value) ? value : null,
            reportedDays, expectedDays: bin.expectedDays, selectedDays, availableDays,
            partial: selectedDays < bin.expectedDays || availableDays < selectedDays };
    }

    function heatmap(service, settings) {
        const options = selection(service, settings), codes = selectedCodes(service, settings), model = base('heatmap', 'Reporting over time');
        Object.assign(model, { rows: [], columns: [], unitLabel: unitLabel(service, options.column, options.unit) });
        const range = rangeFor(service, codes, options, settings);
        if (!range || range.start > range.end) return empty(model, 'Choose a country and a valid period with source observations.');
        model.subtitle = `${options.metric.label} · ${model.unitLabel}${options.smoothing === '7day' ? ' · 7-day average' : ''} · ${labelDate(range.start)}–${labelDate(range.end)}`;
        const maps = range.histories.map(points => new Map(points.map(point => [point.date, point])));
        if (settings.scope === 'country') {
            model.columns = Array.from({ length: 31 }, (_, index) => ({ key: String(index + 1).padStart(2, '0'), label: String(index + 1) }));
            const first = new Date(time(`${range.start.slice(0, 7)}-01`));
            for (let cursor = +first; cursor <= time(range.end);) {
                const month = iso(cursor).slice(0, 7);
                const cells = model.columns.map(column => {
                    const date = `${month}-${column.key}`, active = validDate(date) && date >= range.start && date <= range.end;
                    const point = active ? maps[0].get(date) : null;
                    return { key: column.key, label: date, value: active && finite(point?.value) ? point.value : null,
                        reportedDays: active && reported(point) ? 1 : 0, expectedDays: active ? 1 : 0,
                        availableDays: active && finite(point?.value) ? 1 : 0, partial: active && !finite(point?.value) };
                });
                model.rows.push({ key: month, label: monthLabel(`${month}-01`), cells });
                const next = new Date(cursor); next.setUTCMonth(next.getUTCMonth() + 1); cursor = +next;
            }
            model.note = `${name(service, codes[0])}: daily displayed values. Missing reports and unavailable averages remain gaps; zeros and corrections are retained.`;
        } else {
            const bins = periodBins(range.start, range.end);
            const cadence = bins[0].expectedDays === 7 ? 'Weekly' : bins[0].expectedDays <= 31 ? 'Monthly' : 'Multi-month';
            const treatment = options.metric.kind === 'cumulative' ? 'snapshots' : options.metric.kind === 'daily' && options.smoothing === 'raw' ? 'totals' : 'means';
            model.subtitle += ` · ${cadence} ${treatment}`;
            model.columns = bins.map(({ key, label }) => ({ key, label }));
            model.rows = codes.map((code, index) => ({ key: code, label: name(service, code), cells: bins.map(bin => aggregate(maps[index], bin, range, options)) }));
            model.note = options.metric.kind === 'cumulative' ? 'Snapshots on the final selected calendar day of each period; missing endpoints are never carried forward.' :
                options.metric.kind === 'daily' && options.smoothing === 'raw' ? 'Totals of reported daily additions. Partial periods are incomplete totals; missing days are never zero.' :
                    `Means of available ${options.smoothing === '7day' ? 'trailing seven-day averages' : 'daily patient snapshots'}; values are never summed across days.`;
            if (model.rows.some(row => row.cells.some(cell => cell.partial))) model.warnings.push('Some periods have incomplete reporting or include only part of a calendar period. Inspect their reporting-day counts.');
        }
        return model.rows.some(row => row.cells.some(cell => finite(cell.value))) ? model : empty(model, 'No displayable observations occur in this period.');
    }

    function scatter(service, settings) {
        const countryScope = settings.scope === 'country', codes = selectedCodes(service, settings);
        const model = base('scatter', countryScope ? 'Relationships over time' : 'Country relationships over time');
        Object.assign(model, { items: [], axes: [], dimensions: countryScope ? 2 : codes.length });
        if (countryScope && codes.length !== 1) return empty(model, 'Choose one country to compare two columns over time.');
        if (!countryScope && ![2, 3].includes(codes.length)) return empty(model, 'Choose two countries for a 2D scatter plot or three countries for a 3D scatter plot.');
        const x = selection(service, { ...settings, column: countryScope ? settings.xMetric || settings.column || service.currentColumn : settings.column,
            unit: countryScope ? settings.xUnit || settings.unit || 'count' : settings.unit });
        const y = countryScope ? selection(service, { ...settings, column: settings.yMetric || settings.column || service.currentColumn,
            unit: settings.yUnit || settings.unit || 'count' }) : x;
        const axisLabel = options => `${options.metric.label} · ${unitLabel(service, options.column, options.unit)} · ${treatment(options)}`;
        const histories = countryScope ? [series(service, codes[0], x), series(service, codes[0], y)] : codes.map(code => series(service, code, x));
        const dates = histories.flatMap(points => points.map(point => point.date)).filter(validDate).sort();
        const start = settings.startDate || dates[0], end = settings.endDate || dates.at(-1);
        if (!validDate(start) || !validDate(end) || start > end) return empty(model, 'Choose a valid start and end date with source observations.');
        const maps = histories.map(points => new Map(points.filter(point => validDate(point.date)).map(point => [point.date, point.value])));
        const keys = ['x', 'y', 'z'];
        model.axes = countryScope ? [x, y].map(options => ({ code: options.column, label: axisLabel(options), unitLabel: unitLabel(service, options.column, options.unit) })) :
            codes.map(code => ({ code, label: name(service, code), unitLabel: unitLabel(service, x.column, x.unit) }));
        Object.assign(model, { startDate: start, endDate: end, highlightDate: settings.date, xLabel: model.axes[0].label, yLabel: model.axes[1].label });
        model.items = [...maps[0].keys()].sort().filter(date => date >= start && date <= end && maps.every(points => finite(points.get(date))))
            .map(date => Object.fromEntries([['date', date], ...maps.map((points, index) => [keys[index], points.get(date)])]));
        model.subtitle = `${countryScope ? name(service, codes[0]) : axisLabel(x)} · ${labelDate(start)}–${labelDate(end)}`;
        model.note = `Each point is one exact shared calendar date. ${countryScope ? 'Both selected columns' : 'All selected countries'} must have a displayable value on that date; missing reports are never zero. Color shows time. An association does not establish causation.`;
        return model.items.length ? model : empty(model, 'No exact shared dates have displayable values for every axis in this period.');
    }

    function distribution(type, service, settings) {
        const options = selection(service, settings), codes = selectedCodes(service, settings), model = base(type, 'Distribution of reported values');
        const range = rangeFor(service, codes, options, settings);
        Object.assign(model, { groups: [], unitLabel: unitLabel(service, options.column, options.unit) });
        if (!range || range.start > range.end) return empty(model, 'Choose countries and a valid period.');
        model.groups = codes.map((code, index) => ({ code, label: name(service, code), values: range.histories[index]
            .filter(point => point.date >= range.start && point.date <= range.end && finite(point.value)).map(point => point.value) }));
        model.subtitle = `${options.metric.label} · ${labelDate(range.start)}–${labelDate(range.end)}${options.smoothing === '7day' ? ' · 7-day average' : ''}`;
        model.note = 'Distribution of daily displayed observations within the selected period, not a distribution of people. Missing values are omitted; reported zeros and negative corrections are included.';
        return model.groups.some(group => group.values.length) ? model : empty(model, 'No displayable observations occur in this period.');
    }

    function dumbbell(service, settings) {
        const options = selection(service, settings), codes = selectedCodes(service, settings), model = base('dumbbell', 'Change between two dates');
        const range = rangeFor(service, codes, options, settings);
        Object.assign(model, { items: [], unitLabel: unitLabel(service, options.column, options.unit) });
        const dates = range && service.getAvailableDates(options.column).filter(date => date >= range.start && date <= range.end);
        if (!dates?.length) return empty(model, 'No reporting dates are available in this period.');
        const startDate = dates[0], endDate = dates.at(-1);
        Object.assign(model, { startDate, endDate, startLabel: labelDate(startDate), endLabel: labelDate(endDate),
            subtitle: `${options.metric.label} · ${labelDate(startDate)}–${labelDate(endDate)}` });
        for (const code of codes) {
            const start = service.getDisplayValue(code, { ...options, date: startDate }), end = service.getDisplayValue(code, { ...options, date: endDate });
            if (finite(start) && finite(end)) model.items.push({ code, label: name(service, code), start, end });
            else model.warnings.push(`${name(service, code)}: a displayed value is unavailable at one or both shared endpoints.`);
        }
        model.note = `Exact shared endpoints; no country-specific date borrowing.${options.smoothing === '7day' ? ' Averages use their original full trailing calendar windows before the selected range is applied.' : ''}`;
        return model.items.length ? model : empty(model, 'No selected country reports displayable values at both shared endpoints.');
    }

    function getMetricOptions(service, dataset) {
        const columns = dataset ? service.availableColumns[dataset] || [] : Object.values(service.availableColumns).flat();
        return [...new Set(columns)].map(value => {
            const metric = metadata(service, value);
            return { value, label: metric.label, dataset: dataset || Object.keys(service.availableColumns).find(name => service.availableColumns[name].includes(value)),
                unitOptions: [...(metric.allowedUnits || ['count'])] };
        });
    }

    function build(type, service, settings = {}) {
        const builders = { horizontal, heatmap, scatter, dumbbell };
        if (!service) return empty(base(type, 'Data unavailable'), 'Load country observations first.');
        if (type === 'box') return distribution(type, service, settings);
        return Object.hasOwn(builders, type) ? builders[type](service, settings) : empty(base(type, 'Chart unavailable'), 'Choose a supported chart type.');
    }

    window.AnalyticsData = Object.freeze({ build, getMetricOptions });
})();
