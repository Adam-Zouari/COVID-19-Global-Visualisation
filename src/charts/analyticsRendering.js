/** Shared presentation for analytical charts; observations come from AnalyticsData. */
window.AnalyticsPlot = {
    frame(container, model, { height = 360, margin = {} } = {}) {
        ChartFactory.clearChart(container);
        container.classList.add('analytics-chart');
        container.dataset.chartType = model.type || '';
        container.style.position = 'relative';
        const heading = document.createElement('div'); heading.className = 'chart-heading';
        const title = document.createElement('h3'); title.className = 'chart-heading-title'; title.textContent = model.title || 'Reported observations';
        const subtitle = document.createElement('p'); subtitle.className = 'chart-subtitle'; subtitle.textContent = model.subtitle || '';
        heading.append(title, subtitle); container.appendChild(heading);
        if (model.note) this.text(container, model.note, 'chart-note');
        for (const warning of model.warnings || []) this.text(container, warning, 'chart-warning');
        // Reserve the drawing height before measuring width: inserting a taller
        // SVG can introduce the page scrollbar and change the available width.
        const svg = d3.select(container).append('svg').attr('width', '100%').attr('height', height).attr('role', 'group')
            .attr('aria-label', [model.title, model.subtitle, model.note].filter(Boolean).join('. '));
        const style = window.getComputedStyle(container);
        const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
        const width = Math.max(250, (container.clientWidth || container.getBoundingClientRect().width || 700) - padding);
        margin = { top: 36, right: 24, bottom: 55, left: 70, ...margin };
        const innerWidth = Math.max(30, width - margin.left - margin.right);
        const innerHeight = Math.max(40, height - margin.top - margin.bottom);
        svg.attr('viewBox', `0 0 ${width} ${height}`);
        svg.append('desc').text([model.subtitle, model.note, ...(model.warnings || [])].filter(Boolean).join('. '));
        const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
        return { container, model, svg, plot, width, height, innerWidth, innerHeight, margin };
    },
    empty(frame, fallback) {
        return ChartFactory.showEmptyState(frame.container, frame.model.emptyMessage || fallback, { height: frame.height });
    },
    text(container, content, className = 'chart-note') {
        const node = document.createElement('p'); node.className = className; node.textContent = content; container.appendChild(node); return node;
    },
    legend(container, entries, className = '') {
        const legend = document.createElement('div'); legend.className = `chart-legend ${className}`.trim();
        entries.forEach((entry, index) => {
            const label = document.createElement('span'); label.className = 'legend-item';
            const swatch = document.createElement('i'); swatch.style.backgroundColor = entry.color || this.seriesColor(index);
            if (entry.hatched) swatch.className = 'legend-hatched';
            label.append(swatch, document.createTextNode(entry.label)); legend.appendChild(label);
        });
        container.appendChild(legend);
    },
    colorLegend(container, { name, label, description, start, end, color, format = String, dates = false }) {
        const legend = document.createElement('div'); legend.className = `chart-color-legend ${name}-legend`;
        legend.setAttribute('role', 'img'); legend.setAttribute('aria-label', description);
        const heading = document.createElement('span'); heading.className = `chart-color-label ${name}-label`; heading.textContent = label;
        const bar = document.createElement('div'); bar.className = `chart-color-bar ${name}-bar`; bar.setAttribute('aria-hidden', 'true');
        if (start === end) bar.style.backgroundColor = color(start);
        else {
            const stops = Array.from({ length: 9 }, (_, index) => {
                const fraction = index / 8;
                return `${color(start + (end - start) * fraction)} ${fraction * 100}%`;
            });
            bar.style.backgroundImage = `linear-gradient(to right, ${stops.join(', ')})`;
        }
        const range = document.createElement('div'); range.className = `chart-color-range ${name}-range`;
        for (const value of start === end ? [start] : [start, end]) {
            const endpoint = document.createElement(dates ? 'time' : 'span');
            if (dates) endpoint.dateTime = d3.utcFormat('%Y-%m-%d')(new Date(value));
            endpoint.textContent = format(value); range.appendChild(endpoint);
        }
        legend.append(heading, bar, range); container.appendChild(legend);
        return legend;
    },
    color(code, index = 0) { return code ? ChartFactory.countryColor(code) : this.seriesColor(index); },
    seriesColor(index = 0) { return window.AtlasTheme?.getSeriesColor(index) || ChartFactory.palette[index % ChartFactory.palette.length]; },
    value(value) { return ChartFactory.formatValue(value); },
    tip(container, event, lines) { ChartFactory.showTooltip(container, event, lines); },
    hideTip(container) { ChartFactory.hideTooltip(container); },
    bind(selection, container, describe) {
        return ChartFactory.bindTooltip(selection, container, describe);
    }
};
