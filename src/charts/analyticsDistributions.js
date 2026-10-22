// Distribution views consume validated observations from AnalyticsData.
(() => {
    const finite = value => typeof value === 'number' && Number.isFinite(value);
    const availableWidth = container => container.getBoundingClientRect().width || container.clientWidth || 700;

    function empty(frame, model, fallback) {
        frame.plot.append('text').attr('class', 'chart-empty-label')
            .attr('x', frame.innerWidth / 2).attr('y', frame.innerHeight / 2)
            .attr('text-anchor', 'middle').attr('fill', 'var(--muted)')
            .text(model.emptyMessage || fallback);
    }

    // Character limits work before fonts load and in SVG environments without getBBox.
    function wrap(selection, limit, maxLines = Infinity) {
        selection.each(function() {
            const text = d3.select(this), original = text.text(), words = original.split(/\s+/);
            const lines = [];
            for (const word of words) {
                const chunks = word.match(new RegExp(`.{1,${limit}}`, 'g')) || [''];
                for (const chunk of chunks) {
                    const last = lines.length - 1;
                    if (last >= 0 && lines[last].length + chunk.length + 1 <= limit) lines[last] += ` ${chunk}`;
                    else lines.push(chunk);
                }
            }
            const x = text.attr('x') || 0;
            text.text(null);
            const visible = lines.slice(0, maxLines);
            if (lines.length > maxLines) visible[maxLines - 1] = `${visible[maxLines - 1].slice(0, limit - 1)}…`;
            visible.forEach((line, index) => text.append('tspan').attr('x', x)
                .attr('dy', index ? '1.05em' : `${-(visible.length - 1) * 0.525}em`).text(line));
            if (lines.length > maxLines) text.append('title').text(original);
        });
    }

    function valueDomain(values) {
        let [low, high] = d3.extent(values);
        if (low === high) {
            const padding = Math.abs(low) * 0.05 || 1;
            low -= padding; high += padding;
        }
        return [low, high];
    }

    function horizontalAxes(frame, groups, x, y, unitLabel) {
        frame.plot.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${frame.innerHeight})`)
            .call(d3.axisBottom(x).ticks(Math.min(6, Math.max(2, Math.floor(frame.innerWidth / 70)))).tickFormat(window.AnalyticsPlot.value));
        const labels = frame.plot.append('g').attr('class', 'y-axis')
            .call(d3.axisLeft(y).tickFormat(index => groups[index].label));
        labels.select('.domain').remove();
        wrap(labels.selectAll('.tick text'), frame.width < 420 ? 11 : 20, 3);
        frame.svg.append('text').attr('class', 'axis-unit-label').attr('text-anchor', 'middle')
            .attr('x', frame.margin.left + frame.innerWidth / 2).attr('y', frame.height - 10).text(unitLabel || 'Value');
    }

    // Hover and focus details use full values rather than compact axis labels.
    const exactValue = value => value.toLocaleString(undefined, { maximumSignificantDigits: 15 });

    function statistics(group) {
        if (!group.values.length) return { group };
        const q1 = d3.quantileSorted(group.values, 0.25), median = d3.quantileSorted(group.values, 0.5), q3 = d3.quantileSorted(group.values, 0.75);
        const iqr = q3 - q1, inside = group.values.filter(value => value >= q1 - 1.5 * iqr && value <= q3 + 1.5 * iqr);
        return { group, q1, median, q3, iqr, low: inside[0], high: inside.at(-1),
            min: group.values[0], max: group.values.at(-1), mean: d3.mean(group.values) };
    }

    function box(container, model) {
        const P = window.AnalyticsPlot;
        const groups = (model.groups || []).map(group => ({ ...group, values: group.values.filter(finite).sort(d3.ascending) }));
        const frame = P.frame(container, model, { height: Math.max(260, groups.length * 78 + 95),
            margin: { left: Math.min(150, Math.max(80, availableWidth(container) * 0.23)), right: 22, top: 25 } });
        const values = groups.flatMap(group => group.values), summaries = groups.map(statistics);
        if (!values.length) return empty(frame, model, 'No reported observations for this distribution');
        const x = d3.scaleLinear().domain(valueDomain(values)).nice().range([0, frame.innerWidth]);
        const y = d3.scaleBand().domain(d3.range(groups.length)).range([0, frame.innerHeight]).padding(0.35);
        horizontalAxes(frame, groups, x, y, model.unitLabel);
        summaries.forEach((summary, index) => {
            const { group } = summary;
            const center = y(index) + y.bandwidth() / 2;
            if (!group.values.length) {
                frame.plot.append('text').attr('x', 4).attr('y', center).attr('dy', '0.35em')
                    .attr('fill', 'var(--muted)').text('No reported observations');
                return;
            }
            const { q1, median, q3, low, high } = summary;
            const half = Math.min(18, y.bandwidth() * 0.35), color = P.color(group.code, index);
            const mark = frame.plot.append('g').datum(summary).attr('class', 'box-mark').attr('stroke', color).attr('fill', 'none');
            mark.append('path').attr('d', `M${x(low)},${center}H${x(high)}M${x(low)},${center - half / 2}V${center + half / 2}M${x(high)},${center - half / 2}V${center + half / 2}`);
            mark.append('rect').attr('x', x(q1)).attr('y', center - half).attr('width', Math.max(0, x(q3) - x(q1)))
                .attr('height', half * 2).attr('fill', color).attr('fill-opacity', 0.2);
            mark.append('line').attr('x1', x(median)).attr('x2', x(median)).attr('y1', center - half).attr('y2', center + half).attr('stroke-width', 2.5);
            if (low === high) mark.append('circle').attr('cx', x(median)).attr('cy', center).attr('r', 3).attr('fill', color);
            P.bind(mark, container, datum => [datum.group.label, `Reported observations: ${datum.group.values.length}`,
                `Minimum: ${exactValue(datum.min)} · Maximum: ${exactValue(datum.max)} ${model.unitLabel || ''}`,
                `Q1: ${exactValue(datum.q1)} · Median: ${exactValue(datum.median)} · Q3: ${exactValue(datum.q3)}`,
                `Mean: ${exactValue(datum.mean)} · Interquartile range: ${exactValue(datum.iqr)}`,
                `Whiskers: ${exactValue(datum.low)} to ${exactValue(datum.high)} (observed values within 1.5 × IQR)`]);
            const outliers = [...d3.rollup(group.values.filter(value => value < low || value > high), values => values.length, value => value)]
                .map(([value, count]) => ({ value, count }));
            const dots = frame.plot.selectAll(`.box-outlier-${index}`).data(outliers).join('circle')
                .attr('class', `box-outlier box-outlier-${index}`).attr('cx', datum => x(datum.value)).attr('cy', center)
                .attr('r', 3).attr('fill', color);
            P.bind(dots, container, datum => [group.label, `Observed outlier: ${exactValue(datum.value)} ${model.unitLabel || ''}`,
                `${datum.count} reported ${datum.count === 1 ? 'observation' : 'observations'}`]);
        });
    }

    Object.assign(window.AnalyticsRenderers ||= {}, { box });
})();
