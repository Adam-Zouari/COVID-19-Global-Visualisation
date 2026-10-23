/** Snapshot comparisons and reporting matrices; models contain validated observations. */
(() => {
    let sequence = 0;
    const finite = value => typeof value === 'number' && Number.isFinite(value);
    const color = (token, fallback) => window.AtlasTheme?.getColor(token) || fallback;
    const narrow = container => (container.getBoundingClientRect().width || container.clientWidth || 700) < 500;
    const shorten = (label, length) => String(label).length > length ? `${String(label).slice(0, length - 1)}…` : String(label);
    const domain = values => {
        const available = values.filter(finite);
        return available.length && available.some(value => value !== 0) ?
            [Math.min(0, ...available), Math.max(0, ...available)] : [0, 1];
    };
    const empty = (frame, message) => frame.plot.append('text').attr('class', 'analytics-empty')
        .attr('x', frame.innerWidth / 2).attr('y', frame.innerHeight / 2).attr('text-anchor', 'middle')
        .attr('fill', 'var(--muted)').text(message);

    function boundTickLabels(axis, left, right) {
        axis.selectAll('.tick text').each(function() {
            const text = d3.select(this), transform = this.parentElement.getAttribute('transform') || '';
            const position = Number(/translate\(([-+\d.eE]+)/.exec(transform)?.[1]) || 0;
            const width = this.getComputedTextLength?.() || this.textContent.length * 6.3;
            if (position + width / 2 > right) text.attr('text-anchor', 'end').attr('x', right - position);
            else if (position - width / 2 < left) text.attr('text-anchor', 'start').attr('x', left - position);
        });
    }

    function numericTicks(scale, width, count) {
        const ticks = scale.ticks(count), labelWidth = Math.max(0, ...ticks.map(value => AnalyticsPlot.value(value).length * 6.3));
        const limit = Math.min(ticks.length, Math.max(2, Math.floor(width / (labelWidth + 12)) + 1));
        return ticks.length <= limit ? ticks : Array.from({ length: limit }, (_, index) => ticks[Math.round(index * (ticks.length - 1) / (limit - 1))]);
    }

    function axisLabel(plot, text, x, y, width, anchor = 'middle') {
        const label = plot.append('text').attr('class', 'analytics-axis-label').attr('x', x).attr('y', y)
            .attr('text-anchor', anchor).attr('fill', 'var(--chart-axis-unit)');
        const words = String(text || '').split(/\s+/), lines = [''];
        const limit = Math.max(12, Math.floor(width / 6));
        for (const word of words) {
            if (lines.at(-1) && `${lines.at(-1)} ${word}`.length > limit) lines.push(word);
            else lines[lines.length - 1] = [lines.at(-1), word].filter(Boolean).join(' ');
        }
        lines.forEach((line, index) => label.append('tspan').attr('x', x).attr('dy', index ? 13 : 0).text(line));
        return label;
    }

    function horizontalAxes(frame, x, y, items, compact) {
        const bottom = frame.plot.append('g').attr('class', 'x-axis analytics-axis').attr('color', 'var(--chart-axis)')
            .attr('transform', `translate(0,${frame.innerHeight})`)
            .call(d3.axisBottom(x).tickValues(numericTicks(x, frame.innerWidth, compact ? 3 : 5)).tickFormat(value => AnalyticsPlot.value(value)));
        boundTickLabels(bottom, -frame.margin.left + 3, frame.innerWidth + frame.margin.right - 3);
        const labels = frame.plot.append('g').attr('class', 'y-axis analytics-axis').attr('color', 'var(--chart-axis)')
            .call(d3.axisLeft(y).tickSize(0).tickPadding(9).tickFormat(index => shorten(items[index].label, compact ? 14 : 24)));
        labels.selectAll('.tick text').append('title').text(index => items[index].label);
        labels.select('.domain').remove();
        frame.plot.append('line').attr('class', 'analytics-zero').attr('x1', x(0)).attr('x2', x(0))
            .attr('y1', 0).attr('y2', frame.innerHeight).attr('stroke', 'var(--chart-zero)');
    }

    function horizontal(container, model) {
        const items = model.items || [], compact = narrow(container);
        const frame = AnalyticsPlot.frame(container, model, {
            height: Math.max(220, items.length * 31 + 94),
            margin: { left: compact ? 100 : 156, right: 62, top: 20, bottom: 64 }
        });
        if (!items.length) return empty(frame, 'No reported values for this date.');
        frame.svg.attr('role', 'group');
        const x = d3.scaleLinear().domain(domain(items.map(item => item.value))).nice().range([0, frame.innerWidth]);
        const y = d3.scaleBand().domain(items.map((_, index) => index)).range([0, frame.innerHeight]).padding(0.3);
        horizontalAxes(frame, x, y, items, compact);
        axisLabel(frame.plot, model.unitLabel, frame.innerWidth / 2, frame.innerHeight + 40, frame.innerWidth + 50);
        const rows = frame.plot.selectAll('.rank-item').data(items).join('g').attr('class', 'rank-item')
            .attr('data-country', item => item.code || '');
        const fill = (item, index) => AnalyticsPlot.color(item.code, index);
        rows.filter(item => finite(item.value) && item.value !== 0).append('rect').attr('class', 'rank-bar')
            .attr('x', item => x(Math.min(0, item.value))).attr('y', item => y(items.indexOf(item)))
            .attr('width', item => Math.abs(x(item.value) - x(0))).attr('height', y.bandwidth()).attr('rx', 2)
            .attr('fill', fill);
        rows.filter(item => item.value === 0).append('line').attr('class', 'rank-zero')
            .attr('x1', x(0) - 2).attr('x2', x(0) + 2)
            .attr('y1', item => y(items.indexOf(item)) + y.bandwidth() / 2).attr('y2', item => y(items.indexOf(item)) + y.bandwidth() / 2)
            .attr('stroke', fill).attr('stroke-width', 3);
        rows.filter(item => !finite(item.value)).append('text').attr('class', 'rank-missing')
            .attr('x', x(0) + 4).attr('y', item => y(items.indexOf(item)) + y.bandwidth() / 2 + 4)
            .attr('fill', 'var(--muted)').text('No report');
        rows.append('text').attr('class', 'analytics-value-label').attr('x', frame.innerWidth + 8)
            .attr('y', (_item, index) => y(index) + y.bandwidth() / 2 + 4).attr('fill', 'var(--text)')
            .text(item => finite(item.value) ? AnalyticsPlot.value(item.value) : '—');
        AnalyticsPlot.bind(rows, container, item => [item.label, finite(item.value) ? `${AnalyticsPlot.value(item.value)} ${model.unitLabel || ''}` : 'No observation', model.date]);
    }

    function heatmap(container, model) {
        const rows = model.rows || [], columns = model.columns || [], compact = narrow(container);
        const frame = AnalyticsPlot.frame(container, model, {
            height: Math.max(230, rows.length * 36 + 95), margin: { left: compact ? 100 : 156, right: 16, top: 20, bottom: 64 }
        });
        if (!rows.length || !columns.length) return empty(frame, 'No reporting periods available.');
        frame.svg.attr('role', 'group');
        // Every source cell fits the chart. Keyboard inspection keeps narrow cells usable.
        const innerWidth = frame.innerWidth;
        const x = d3.scaleBand().domain(columns.map((_, index) => index)).range([0, innerWidth]).padding(0.08);
        const y = d3.scaleBand().domain(rows.map((_, index) => index)).range([0, frame.innerHeight]).padding(0.12);
        const cells = rows.map((row, rowIndex) => {
            const lookup = new Map((row.cells || []).map(cell => [cell.key, cell]));
            return columns.map((column, columnIndex) => ({ ...lookup.get(column.key),
                key: column.key, label: lookup.get(column.key)?.label || column.label, row, rowIndex, columnIndex }));
        });
        const values = cells.flat().map(cell => cell.value).filter(finite), maximum = Math.max(0, ...values);
        const light = document.documentElement.dataset.theme === 'light';
        const low = color('--heatmap-low', light ? '#dfedf8' : '#213c54');
        const high = color('--heatmap-high', AnalyticsPlot.seriesColor(0));
        const negative = color('--heatmap-negative', color('--warning', '#e8b766'));
        const missing = color('--heatmap-missing', color('--surface-raised', '#172437'));
        const scale = d3.scaleSequential(d3.interpolateRgb(low, high)).domain([0, maximum || 1]);
        const inactive = cell => cell.expectedDays === 0;
        const partial = cell => finite(cell.value) && (cell.partial ||
            finite(cell.expectedDays) && finite(cell.reportedDays) && cell.reportedDays < cell.expectedDays);
        const patternId = `analytics-partial-${++sequence}`;
        const pattern = frame.svg.append('defs').append('pattern').attr('id', patternId)
            .attr('patternUnits', 'userSpaceOnUse').attr('width', 5).attr('height', 5).attr('patternTransform', 'rotate(45)');
        pattern.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 5)
            .attr('stroke', color('--text', '#f3f7fe')).attr('stroke-width', 1).attr('opacity', 0.45);
        const tickColumns = columns.map((_, index) => index).filter(index => index % Math.max(1, Math.ceil(columns.length / (compact ? 4 : 7))) === 0);
        const bottom = frame.plot.append('g').attr('class', 'x-axis analytics-axis').attr('color', 'var(--chart-axis)')
            .attr('transform', `translate(0,${frame.innerHeight})`)
            .call(d3.axisBottom(x).tickValues(tickColumns).tickFormat(index => shorten(columns[index].label, compact ? 13 : 20)));
        boundTickLabels(bottom, -frame.margin.left + 3, innerWidth + frame.margin.right - 3);
        bottom.selectAll('.tick text').append('title').text(index => columns[index].label);
        const left = frame.plot.append('g').attr('class', 'y-axis analytics-axis').attr('color', 'var(--chart-axis)')
            .call(d3.axisLeft(y).tickSize(0).tickPadding(9).tickFormat(index => shorten(rows[index].label, compact ? 14 : 24)));
        left.selectAll('.tick text').append('title').text(index => rows[index].label); left.select('.domain').remove();
        const describe = cell => [cell.row.label, cell.label,
            inactive(cell) ? 'Outside the selected period or not a calendar date' : finite(cell.value) ? `${AnalyticsPlot.value(cell.value)} ${model.unitLabel || ''}` : 'No displayable value',
            finite(cell.reportedDays) && cell.expectedDays > 0 ? `${cell.reportedDays} of ${cell.expectedDays} days reported` : '',
            finite(cell.value) && cell.value < 0 ? 'Negative reporting correction' : '', partial(cell) ? 'Partial reporting period' : ''].filter(Boolean);
        const gridId = `analytics-heatmap-${sequence}`;
        const grid = frame.plot.append('g').attr('class', 'heatmap-grid').attr('role', 'grid').attr('tabindex', 0)
            .attr('aria-rowcount', rows.length).attr('aria-colcount', columns.length)
            .attr('aria-label', 'Displayed values by row and period. Use arrow keys to inspect cells, Home and End for row boundaries.');
        const rowGroups = grid.selectAll('.heatmap-row').data(cells).join('g').attr('class', 'heatmap-row').attr('role', 'row');
        const marks = rowGroups.selectAll('.heatmap-cell').data(row => row).join('rect')
            .attr('class', cell => `heatmap-cell${inactive(cell) ? ' heatmap-inactive' : !finite(cell.value) ? ' heatmap-missing' : cell.value < 0 ? ' heatmap-negative' : ''}`)
            .attr('id', cell => `${gridId}-${cell.rowIndex}-${cell.columnIndex}`).attr('role', 'gridcell')
            .attr('aria-rowindex', cell => cell.rowIndex + 1).attr('aria-colindex', cell => cell.columnIndex + 1)
            .attr('aria-label', cell => describe(cell).join('. ')).attr('data-value', cell => finite(cell.value) ? cell.value : '')
            .attr('x', cell => x(cell.columnIndex)).attr('y', cell => y(cell.rowIndex))
            .attr('width', x.bandwidth()).attr('height', y.bandwidth())
            .attr('fill', cell => inactive(cell) ? 'none' : !finite(cell.value) ? missing : cell.value < 0 ? negative : scale(cell.value))
            .attr('stroke', cell => inactive(cell) || finite(cell.value) ? 'none' : 'var(--chart-axis-border)')
            .attr('stroke-dasharray', cell => inactive(cell) || finite(cell.value) ? null : '2 2');
        marks.append('title').text(cell => describe(cell).join('. '));
        rowGroups.selectAll('.heatmap-partial').data(row => row.filter(partial)).join('rect').attr('class', 'heatmap-partial')
            .attr('x', cell => x(cell.columnIndex)).attr('y', cell => y(cell.rowIndex))
            .attr('width', x.bandwidth()).attr('height', y.bandwidth()).attr('fill', `url(#${patternId})`).attr('pointer-events', 'none');
        const selection = grid.append('rect').attr('class', 'heatmap-selection').attr('fill', 'none')
            .attr('stroke', 'var(--text)').attr('stroke-width', 2).attr('pointer-events', 'none').attr('visibility', 'hidden');
        let activeRow = 0, activeColumn = 0;
        function inspect(rowIndex, columnIndex, event) {
            activeRow = rowIndex; activeColumn = columnIndex;
            const cell = cells[rowIndex][columnIndex];
            grid.attr('aria-activedescendant', `${gridId}-${rowIndex}-${columnIndex}`);
            selection.attr('x', x(columnIndex)).attr('y', y(rowIndex)).attr('width', x.bandwidth()).attr('height', y.bandwidth()).attr('visibility', 'visible');
            if (!event) {
                const node = marks.nodes()[rowIndex * columns.length + columnIndex];
                const bounds = node.getBoundingClientRect();
                event = { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 };
            }
            AnalyticsPlot.tip(container, event, describe(cell));
        }
        grid.attr('aria-activedescendant', `${gridId}-0-0`)
            .on('focus.heatmap', () => inspect(activeRow, activeColumn))
            .on('blur.heatmap', () => { selection.attr('visibility', 'hidden'); AnalyticsPlot.hideTip(container); })
            .on('keydown.heatmap', event => {
                if (event.key === 'Escape') {
                    if (container.querySelector('.chart-tooltip')) { event.preventDefault(); event.stopPropagation(); }
                    selection.attr('visibility', 'hidden'); AnalyticsPlot.hideTip(container); return;
                }
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const row = event.ctrlKey && ['Home', 'End'].includes(event.key) ? event.key === 'Home' ? 0 : rows.length - 1 :
                    Math.max(0, Math.min(rows.length - 1, activeRow + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0)));
                const column = event.key === 'Home' ? 0 : event.key === 'End' ? columns.length - 1 :
                    Math.max(0, Math.min(columns.length - 1, activeColumn + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0)));
                inspect(row, column);
            });
        marks.on('pointerenter.heatmap pointermove.heatmap', (event, cell) => inspect(cell.rowIndex, cell.columnIndex, event))
            .on('pointerleave.heatmap', () => { if (document.activeElement !== grid.node()) selection.attr('visibility', 'hidden'); AnalyticsPlot.hideTip(container); })
            .on('click.heatmap', (_event, cell) => { activeRow = cell.rowIndex; activeColumn = cell.columnIndex; grid.node().focus({ preventScroll: true }); inspect(activeRow, activeColumn); });
        const entries = [{ label: `0 ${model.unitLabel || ''}`, color: low }];
        if (maximum > 0) entries.push({ label: AnalyticsPlot.value(maximum / 2), color: scale(maximum / 2) }, { label: AnalyticsPlot.value(maximum), color: high });
        if (values.some(value => value < 0)) entries.push({ label: 'Negative correction', color: negative });
        entries.push({ label: 'No displayable value', color: missing });
        if (cells.flat().some(partial)) entries.push({ label: 'Hatched: partial reports', color: color('--text', '#f3f7fe') });
        AnalyticsPlot.legend(container, entries);
    }

    const minimumZoom = 0.5, maximumZoom = 4;
    const clampZoom = value => Math.max(minimumZoom, Math.min(maximumZoom, value));

    function scatterViewControls(frame, helpText, changeZoom, resetView) {
        // Selection stays available elsewhere on the page, including chart descriptions.
        frame.svg.attr('class', 'scatter-viewport').style('user-select', 'none').style('-webkit-user-select', 'none')
            .on('selectstart.scatter', event => event.preventDefault());
        const controls = document.createElement('div'); controls.className = 'scatter-view-controls';
        const help = document.createElement('span'); help.textContent = helpText; controls.appendChild(help);
        const buttons = document.createElement('div'); buttons.className = 'scatter-zoom-controls';
        const button = (action, label, text, handler) => {
            const node = document.createElement('button'); node.type = 'button'; node.className = 'text-btn';
            node.dataset.scatterAction = action; node.setAttribute('aria-label', label); node.title = label; node.textContent = text;
            node.addEventListener('click', handler); buttons.appendChild(node); return node;
        };
        const out = button('out', 'Zoom out', '−', () => changeZoom(1 / 1.3));
        const level = document.createElement('output'); level.setAttribute('aria-label', 'Zoom level'); buttons.appendChild(level);
        const into = button('in', 'Zoom in', '+', () => changeZoom(1.3));
        button('reset', 'Reset view', 'Reset view', resetView);
        controls.appendChild(buttons); frame.svg.node().before(controls);
        return value => {
            frame.svg.attr('data-zoom', value);
            level.value = `${Math.round(value * 100)}%`;
            out.disabled = value <= minimumZoom + 1e-9; into.disabled = value >= maximumZoom - 1e-9;
        };
    }

    function scatterDateLegend(container, timeColor, start, end) {
        const legend = document.createElement('div'); legend.className = 'scatter-date-legend';
        const format = d3.utcFormat('%b %-d, %Y'), iso = d3.utcFormat('%Y-%m-%d');
        const singleDate = start === end;
        legend.setAttribute('role', 'img');
        legend.setAttribute('aria-label', singleDate ? `Date: ${format(new Date(start))}. All points share this date.` :
            `Date: ${format(new Date(start))} to ${format(new Date(end))}. Earlier dates on the left, later dates on the right.`);
        const label = document.createElement('span'); label.className = 'scatter-date-label'; label.textContent = 'Date';
        const bar = document.createElement('div'); bar.className = 'scatter-date-bar'; bar.setAttribute('aria-hidden', 'true');
        if (singleDate) bar.style.backgroundColor = timeColor(start);
        else {
            const stops = Array.from({ length: 9 }, (_, index) => {
                const fraction = index / 8;
                return `${timeColor(start + (end - start) * fraction)} ${fraction * 100}%`;
            });
            bar.style.backgroundImage = `linear-gradient(to right, ${stops.join(', ')})`;
        }
        const range = document.createElement('div'); range.className = 'scatter-date-range';
        for (const value of singleDate ? [start] : [start, end]) {
            const date = new Date(value), endpoint = document.createElement('time');
            endpoint.dateTime = iso(date); endpoint.textContent = format(date); range.appendChild(endpoint);
        }
        legend.append(label, bar, range); container.appendChild(legend);
    }

    function scatterPoints(frame, container, model, items, position, plot = frame.plot) {
        const dates = items.map(item => Date.parse(`${item.date}T00:00:00Z`));
        const dated = dates.every(Number.isFinite), start = dated ? Math.min(...dates) : 0, end = dated ? Math.max(...dates) : Math.max(1, items.length - 1);
        const timeColor = d3.scaleSequential(d3.interpolateRgb(AnalyticsPlot.seriesColor(0), AnalyticsPlot.seriesColor(1))).domain([start, end]);
        const axes = model.axes?.length ? model.axes : [{ label: model.xLabel }, { label: model.yLabel }];
        const keys = ['x', 'y', 'z'];
        const describe = item => [item.date || 'Observation', ...axes.map((axis, index) => `${axis.label}: ${AnalyticsPlot.value(item[keys[index]])}${axis.unitLabel && !axis.label.includes(axis.unitLabel) ? ` ${axis.unitLabel}` : ''}`)];
        const points = plot.selectAll('.scatter-point').data(items).join('circle').attr('class', 'scatter-point')
            .attr('data-date', item => item.date || '').attr('r', item => item.date === model.highlightDate ? 7 : 4.5)
            .attr('fill', (item, index) => timeColor(dated ? dates[index] : index))
            .attr('stroke', item => item.date === model.highlightDate ? 'var(--text)' : 'var(--chart-surface)')
            .attr('stroke-width', item => item.date === model.highlightDate ? 2 : 0.8).attr('opacity', 0.85);
        const update = () => points.attr('cx', item => position(item)[0]).attr('cy', item => position(item)[1]);
        update();
        AnalyticsPlot.bind(points, container, describe);
        points.append('title').text(item => describe(item).join('. '));
        points.attr('tabindex', (_item, index) => index ? -1 : 0)
            .on('focus.roving', function() { points.attr('tabindex', -1); d3.select(this).attr('tabindex', 0); })
            .on('keydown.roving', function(event) {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault(); event.stopPropagation(); const nodes = points.nodes(), index = nodes.indexOf(this);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? nodes.length - 1 :
                    Math.max(0, Math.min(nodes.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
                nodes[next].focus({ preventScroll: true });
            });
        if (dated) scatterDateLegend(container, timeColor, start, end);
        frame.svg.attr('aria-label', `${model.title || 'Relationships over time'}. ${items.length} exact shared dates. Use Left and Right arrow keys to inspect dates.`);
        return { points, update };
    }

    function scatter3D(container, model, items) {
        const compact = narrow(container), frame = AnalyticsPlot.frame(container, model, { height: compact ? 360 : 430,
            margin: { left: 20, right: 20, top: 26, bottom: 32 } });
        const keys = ['x', 'y', 'z'], scales = keys.map(key => d3.scaleLinear().domain(domain(items.map(item => item[key]))).nice().range([-0.5, 0.5]));
        const origin = [-0.5, -0.5, -0.5], ends = [[0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, 0.5]];
        const initial = { yaw: -0.65, pitch: 0.35 };
        let yaw = initial.yaw, pitch = initial.pitch, zoom = 1, drag = null, pinch = null;
        const pointers = new Map();
        const size = Math.min(frame.innerWidth, frame.innerHeight) * 0.57;
        const project = values => {
            const x = values[0] * Math.cos(yaw) + values[2] * Math.sin(yaw), z = -values[0] * Math.sin(yaw) + values[2] * Math.cos(yaw);
            const y = values[1] * Math.cos(pitch) - z * Math.sin(pitch);
            return [frame.innerWidth / 2 + x * size * zoom, frame.innerHeight / 2 - y * size * zoom];
        };
        const cube = [];
        for (let vertex = 0; vertex < 8; vertex++) for (let axis = 0; axis < 3; axis++) {
            if (vertex & (1 << axis)) continue;
            const from = keys.map((_, index) => vertex & (1 << index) ? 0.5 : -0.5), to = [...from]; to[axis] = 0.5;
            cube.push({ from, to });
        }
        const edges = frame.plot.append('g').attr('aria-hidden', 'true').selectAll('line').data(cube).join('line')
            .attr('stroke', 'var(--chart-axis-border)').attr('stroke-width', 1).attr('opacity', 0.65);
        const axes = frame.plot.append('g').attr('class', 'scatter-3d-axes').attr('aria-hidden', 'true');
        const axisLines = axes.selectAll('line').data(ends).join('line').attr('stroke', 'var(--chart-axis)').attr('stroke-width', 1.8);
        const labels = axes.selectAll('.scatter-3d-label').data(model.axes || []).join('text').attr('class', 'scatter-3d-label')
            .attr('fill', 'var(--text)').attr('font-size', 12).text(axis => axis.label);
        labels.append('title').text((axis, index) => `${keys[index].toUpperCase()}: ${axis.label} · ${axis.unitLabel || ''}`);
        const ticks = axes.selectAll('.scatter-3d-tick').data(scales.flatMap((scale, axis) => scale.ticks(3).map(value => ({ axis, value })))).join('text')
            .attr('class', 'scatter-3d-tick').attr('font-size', 10).attr('fill', 'var(--chart-axis)').text(tick => AnalyticsPlot.value(tick.value));
        const cloud = scatterPoints(frame, container, model, items, item => project(keys.map((key, index) => scales[index](item[key]))));
        function redraw() {
            edges.attr('x1', edge => project(edge.from)[0]).attr('y1', edge => project(edge.from)[1])
                .attr('x2', edge => project(edge.to)[0]).attr('y2', edge => project(edge.to)[1]);
            axisLines.attr('x1', project(origin)[0]).attr('y1', project(origin)[1])
                .attr('x2', end => project(end)[0]).attr('y2', end => project(end)[1]);
            labels.attr('x', (_axis, index) => Math.max(3, Math.min(frame.innerWidth - 3, project(ends[index])[0])))
                .attr('y', (_axis, index) => project(ends[index])[1] + (project(ends[index])[1] < frame.innerHeight / 2 ? -12 : 22))
                .attr('text-anchor', (_axis, index) => project(ends[index])[0] < frame.innerWidth / 2 ? 'start' : 'end');
            ticks.each(function(tick) {
                const values = [...origin]; values[tick.axis] = scales[tick.axis](tick.value); const point = project(values);
                d3.select(this).attr('x', point[0] + 4).attr('y', point[1] + 12);
            });
            cloud.update(); frame.svg.attr('data-yaw', yaw).attr('data-pitch', pitch); updateZoom(zoom);
        }
        const changeZoom = factor => { zoom = clampZoom(zoom * factor); AnalyticsPlot.hideTip(container); redraw(); };
        const resetView = () => { yaw = initial.yaw; pitch = initial.pitch; zoom = 1; redraw(); };
        const updateZoom = scatterViewControls(frame, 'Drag to rotate · Scroll or pinch to zoom', changeZoom, resetView);
        cloud.points.on('focus.zoom', function(event, item) {
            const [x, y] = project(keys.map((key, index) => scales[index](item[key])));
            const fit = Math.min(1, (frame.innerWidth / 2 - 7) / Math.abs(x - frame.innerWidth / 2),
                (frame.innerHeight / 2 - 7) / Math.abs(y - frame.innerHeight / 2));
            if (fit >= 1) return;
            // Keep a keyboard-inspected date visible after zooming, without
            // resetting the user's chosen rotation or the data's axis scales.
            zoom = clampZoom(zoom * fit); redraw();
            cloud.points.on('focus.analytics').call(this, event, item);
        });
        const pointerId = event => event.pointerId ?? 0;
        const distance = () => {
            const [first, second] = [...pointers.values()];
            return second ? Math.hypot(second.x - first.x, second.y - first.y) : 0;
        };
        function endPointer(event) {
            pointers.delete(pointerId(event));
            if (frame.svg.node().hasPointerCapture?.(event.pointerId)) frame.svg.node().releasePointerCapture(event.pointerId);
            pinch = null; drag = pointers.size === 1 ? [...pointers.values()][0] : null;
            frame.svg.style('cursor', pointers.size ? 'grabbing' : 'grab');
        }
        frame.svg.attr('tabindex', 0).attr('aria-label', `${frame.svg.attr('aria-label')} Three-dimensional view. Drag or use arrow keys to rotate. Scroll, pinch, or use plus and minus to zoom. Home resets the view.`)
            .style('touch-action', 'none').style('cursor', 'grab').style('overflow', 'hidden')
            .on('pointerdown.rotate', event => {
                if (event.button !== 0 && event.pointerType !== 'touch') return;
                event.preventDefault(); pointers.set(pointerId(event), { x: event.clientX, y: event.clientY });
                if (Number.isFinite(event.pointerId)) frame.svg.node().setPointerCapture?.(event.pointerId);
                drag = { x: event.clientX, y: event.clientY };
                if (pointers.size > 1) pinch = { distance: distance(), zoom };
                frame.svg.style('cursor', 'grabbing'); AnalyticsPlot.hideTip(container);
            }).on('pointermove.rotate', event => {
                if (!pointers.has(pointerId(event))) return;
                pointers.set(pointerId(event), { x: event.clientX, y: event.clientY });
                if (pointers.size > 1) {
                    if (pinch?.distance > 0) { zoom = clampZoom(pinch.zoom * distance() / pinch.distance); redraw(); }
                    return;
                }
                if (!drag) return;
                yaw += (event.clientX - drag.x) * 0.012; pitch = Math.max(-1.3, Math.min(1.3, pitch + (event.clientY - drag.y) * 0.012));
                drag = { x: event.clientX, y: event.clientY }; redraw();
            }).on('pointerup.rotate pointercancel.rotate lostpointercapture.rotate', endPointer)
            .on('wheel.zoom', event => {
                event.preventDefault();
                const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? frame.height : 1);
                changeZoom(Math.exp(-Math.max(-500, Math.min(500, pixels)) * 0.002));
            }, { passive: false }).on('keydown.rotate', event => {
                if (event.target !== frame.svg.node() || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', '+', '=', '-', '0'].includes(event.key)) return;
                event.preventDefault(); event.stopPropagation();
                if (['Home', '0'].includes(event.key)) return resetView();
                if (['+', '=', '-'].includes(event.key)) return changeZoom(event.key === '-' ? 1 / 1.3 : 1.3);
                else { yaw += event.key === 'ArrowLeft' ? -0.12 : event.key === 'ArrowRight' ? 0.12 : 0;
                    pitch = Math.max(-1.3, Math.min(1.3, pitch + (event.key === 'ArrowUp' ? -0.12 : event.key === 'ArrowDown' ? 0.12 : 0))); }
                redraw();
            });
        redraw();
    }

    function scatter(container, model) {
        const compact = narrow(container), items = (model.items || []).filter(item => finite(item.x) && finite(item.y) && (model.dimensions !== 3 || finite(item.z)));
        if (items.length && model.dimensions === 3) return scatter3D(container, model, items);
        const ticks = compact ? 3 : 5;
        const y = d3.scaleLinear().domain(domain(items.map(item => item.y))).nice();
        const labelWidth = Math.max(compact ? 62 : 76, ...y.ticks(ticks).map(value => AnalyticsPlot.value(value).length * 6.3 + 13));
        const frame = AnalyticsPlot.frame(container, model, { height: 390,
            margin: { left: Math.min(106, labelWidth), right: 22, top: 48, bottom: 72 } });
        if (!items.length) return empty(frame, 'No exact shared dates have displayable values for every axis.');
        frame.svg.attr('role', 'group');
        const x = d3.scaleLinear().domain(domain(items.map(item => item.x))).nice().range([0, frame.innerWidth]);
        y.range([frame.innerHeight, 0]);
        frame.plot.append('rect').attr('class', 'scatter-pan-surface').attr('width', frame.innerWidth).attr('height', frame.innerHeight)
            .attr('fill', 'transparent').attr('aria-hidden', 'true');
        const bottom = frame.plot.append('g').attr('class', 'x-axis analytics-axis').attr('color', 'var(--chart-axis)')
            .attr('transform', `translate(0,${frame.innerHeight})`);
        const left = frame.plot.append('g').attr('class', 'y-axis analytics-axis').attr('color', 'var(--chart-axis)');
        const verticalZero = frame.plot.append('line').attr('class', 'analytics-zero').attr('y2', frame.innerHeight).attr('stroke', 'var(--chart-zero)');
        const horizontalZero = frame.plot.append('line').attr('class', 'analytics-zero').attr('x2', frame.innerWidth).attr('stroke', 'var(--chart-zero)');
        axisLabel(frame.plot, model.xLabel, frame.innerWidth / 2, frame.innerHeight + 41, frame.innerWidth + 30);
        axisLabel(frame.plot, model.yLabel, 0, -29, frame.innerWidth + 12, 'start');
        const clipId = `scatter-clip-${++sequence}`;
        frame.svg.append('defs').append('clipPath').attr('id', clipId).append('rect')
            .attr('x', -7).attr('y', -7).attr('width', frame.innerWidth + 14).attr('height', frame.innerHeight + 14);
        const cloudPlot = frame.plot.append('g').attr('clip-path', `url(#${clipId})`);
        let viewX = x, viewY = y;
        const cloud = scatterPoints(frame, container, model, items, item => [viewX(item.x), viewY(item.y)], cloudPlot);
        function redraw(transform) {
            viewX = transform.rescaleX(x); viewY = transform.rescaleY(y);
            // Axis labels keep their font size while the displayed numeric domain changes.
            bottom.call(d3.axisBottom(viewX).tickValues(numericTicks(viewX, frame.innerWidth, ticks)).tickFormat(value => AnalyticsPlot.value(value)));
            bottom.selectAll('.tick text').attr('x', null).attr('text-anchor', 'middle');
            boundTickLabels(bottom, -frame.margin.left + 3, frame.innerWidth + frame.margin.right - 3);
            left.call(d3.axisLeft(viewY).ticks(ticks).tickFormat(value => AnalyticsPlot.value(value)));
            verticalZero.attr('x1', viewX(0)).attr('x2', viewX(0)).attr('visibility', viewX(0) >= 0 && viewX(0) <= frame.innerWidth ? 'visible' : 'hidden');
            horizontalZero.attr('y1', viewY(0)).attr('y2', viewY(0)).attr('visibility', viewY(0) >= 0 && viewY(0) <= frame.innerHeight ? 'visible' : 'hidden');
            cloud.update(); updateZoom(transform.k);
        }
        const zoom = d3.zoom().scaleExtent([minimumZoom, maximumZoom])
            .extent([[0, 0], [frame.innerWidth, frame.innerHeight]])
            .translateExtent([[0, 0], [frame.innerWidth, frame.innerHeight]])
            .touchable(() => !!window.navigator.maxTouchPoints || 'ontouchstart' in window)
            .on('zoom.scatter', event => { AnalyticsPlot.hideTip(container); redraw(event.transform); });
        const updateZoom = scatterViewControls(frame, 'Drag to pan · Scroll or pinch to zoom',
            factor => frame.plot.call(zoom.scaleBy, factor), () => frame.plot.call(zoom.transform, d3.zoomIdentity));
        frame.svg.style('touch-action', 'none').style('overflow', 'hidden')
            .on('keydown.zoom', event => {
                if (!['+', '=', '-', '0'].includes(event.key)) return;
                event.preventDefault(); event.stopPropagation();
                if (event.key === '0') frame.plot.call(zoom.transform, d3.zoomIdentity);
                else frame.plot.call(zoom.scaleBy, event.key === '-' ? 1 / 1.3 : 1.3);
            });
        frame.plot.style('cursor', 'grab').call(zoom).on('dblclick.zoom', null);
        cloud.points.on('focus.zoom', function(event, item) {
            if (viewX(item.x) >= 0 && viewX(item.x) <= frame.innerWidth && viewY(item.y) >= 0 && viewY(item.y) <= frame.innerHeight) return;
            // Roving keyboard inspection also brings clipped dates back into view.
            frame.plot.call(zoom.translateTo, x(item.x), y(item.y));
            cloud.points.on('focus.analytics').call(this, event, item);
        });
        frame.svg.attr('aria-label', `${frame.svg.attr('aria-label')} Drag to pan. Scroll, pinch, or use plus and minus to zoom. Zero resets the view.`);
        redraw(d3.zoomIdentity);
    }

    function dumbbell(container, model) {
        const items = model.items || [], compact = narrow(container);
        const frame = AnalyticsPlot.frame(container, model, { height: Math.max(230, items.length * 46 + 90),
            margin: { left: compact ? 100 : 156, right: 24, top: 22, bottom: 65 } });
        if (!items.length) return empty(frame, 'No countries have comparable reporting periods.');
        frame.svg.attr('role', 'group');
        const x = d3.scaleLinear().domain(domain(items.flatMap(item => [item.start, item.end]))).nice().range([0, frame.innerWidth]);
        const y = d3.scaleBand().domain(items.map((_, index) => index)).range([0, frame.innerHeight]).padding(0.3);
        horizontalAxes(frame, x, y, items, compact);
        axisLabel(frame.plot, model.unitLabel, frame.innerWidth / 2, frame.innerHeight + 40, frame.innerWidth + 30);
        const startLabel = model.startLabel || 'Start', endLabel = model.endLabel || 'End';
        const startColor = AnalyticsPlot.seriesColor(0), endColor = AnalyticsPlot.seriesColor(1);
        frame.plot.selectAll('.dumbbell-link').data(items.filter(item => finite(item.start) && finite(item.end))).join('line')
            .attr('class', 'dumbbell-link').attr('x1', item => x(item.start)).attr('x2', item => x(item.end))
            .attr('y1', item => y(items.indexOf(item)) + y.bandwidth() / 2).attr('y2', item => y(items.indexOf(item)) + y.bandwidth() / 2)
            .attr('stroke', 'var(--chart-axis-border)').attr('stroke-width', 2.5);
        const points = items.flatMap((item, index) => ['start', 'end'].filter(endpoint => finite(item[endpoint])).map(endpoint => ({ item, index, endpoint, value: item[endpoint] })));
        const marks = frame.plot.selectAll('.dumbbell-point').data(points).join('circle')
            .attr('class', point => `dumbbell-point dumbbell-${point.endpoint}`).attr('data-endpoint', point => point.endpoint)
            .attr('cx', point => x(point.value)).attr('cy', point => y(point.index) + y.bandwidth() / 2).attr('r', point => point.endpoint === 'start' ? 6 : 4)
            .attr('fill', point => point.endpoint === 'start' ? startColor : endColor)
            .attr('stroke', 'var(--chart-surface)').attr('stroke-width', 1);
        frame.plot.selectAll('.dumbbell-value').data(points).join('text').attr('class', 'analytics-value-label dumbbell-value')
            .attr('x', point => x(point.value)).attr('y', point => y(point.index) + y.bandwidth() / 2 + (point.endpoint === 'start' ? -9 : 17))
            .attr('text-anchor', point => x(point.value) > frame.innerWidth / 2 ? 'end' : 'start')
            .attr('fill', point => point.endpoint === 'start' ? startColor : endColor).text(point => AnalyticsPlot.value(point.value));
        AnalyticsPlot.bind(marks, container, point => [point.item.label,
            `${startLabel}: ${finite(point.item.start) ? AnalyticsPlot.value(point.item.start) : 'No observation'} ${model.unitLabel || ''}`,
            `${endLabel}: ${finite(point.item.end) ? AnalyticsPlot.value(point.item.end) : 'No observation'} ${model.unitLabel || ''}`,
            finite(point.item.start) && finite(point.item.end) ? `Change: ${AnalyticsPlot.value(point.item.end - point.item.start)} ${model.unitLabel || ''}` : 'One reporting period is unavailable']);
        frame.plot.selectAll('.dumbbell-missing').data(items.filter(item => !finite(item.start) && !finite(item.end))).join('text')
            .attr('class', 'dumbbell-missing').attr('x', 4).attr('y', item => y(items.indexOf(item)) + y.bandwidth() / 2 + 4)
            .attr('fill', 'var(--muted)').text('No matched reports');
        AnalyticsPlot.legend(container, [{ label: startLabel, color: startColor }, { label: endLabel, color: endColor }]);
    }

    Object.assign(window.AnalyticsRenderers ||= {}, { horizontal, heatmap, scatter, dumbbell });
})();
