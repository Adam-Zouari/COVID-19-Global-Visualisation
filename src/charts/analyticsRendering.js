/** Shared presentation for analytical charts; observations come from AnalyticsData. */
window.AnalyticsPlot = {
    frame(container, model, { height = 360, margin = {} } = {}) {
        container.replaceChildren();
        container.classList.add('analytics-chart');
        container.dataset.chartType = model.type || '';
        container.style.position = 'relative';
        const heading = document.createElement('div'); heading.className = 'chart-heading';
        const title = document.createElement('h3'); title.className = 'chart-heading-title'; title.textContent = model.title || 'Reported observations';
        const subtitle = document.createElement('p'); subtitle.className = 'chart-subtitle'; subtitle.textContent = model.subtitle || '';
        heading.append(title, subtitle); container.appendChild(heading);
        if (model.note) this.text(container, model.note, 'chart-note');
        for (const warning of model.warnings || []) this.text(container, warning, 'chart-warning');
        const style = window.getComputedStyle(container);
        const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
        const width = Math.max(250, (container.clientWidth || container.getBoundingClientRect().width || 700) - padding);
        margin = { top: 36, right: 24, bottom: 55, left: 70, ...margin };
        const innerWidth = Math.max(30, width - margin.left - margin.right);
        const innerHeight = Math.max(40, height - margin.top - margin.bottom);
        const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`)
            .attr('width', '100%').attr('height', height).attr('role', 'group')
            .attr('aria-label', [model.title, model.subtitle, model.note].filter(Boolean).join('. '));
        svg.append('title').text(model.title || 'Reported observations');
        svg.append('desc').text([model.subtitle, model.note, ...(model.warnings || [])].filter(Boolean).join('. '));
        const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
        return { svg, plot, width, height, innerWidth, innerHeight, margin };
    },
    text(container, content, className = 'chart-note') {
        const node = document.createElement('p'); node.className = className; node.textContent = content; container.appendChild(node); return node;
    },
    legend(container, entries) {
        const legend = document.createElement('div'); legend.className = 'chart-legend';
        entries.forEach((entry, index) => {
            const label = document.createElement('span'); label.className = 'legend-item';
            const swatch = document.createElement('i'); swatch.style.backgroundColor = entry.color || this.seriesColor(index);
            label.append(swatch, document.createTextNode(entry.label)); legend.appendChild(label);
        });
        container.appendChild(legend);
    },
    color(code, index = 0) { return code ? ChartFactory.countryColor(code) : this.seriesColor(index); },
    seriesColor(index = 0) { return window.AtlasTheme?.getSeriesColor(index) || ChartFactory.palette[index % ChartFactory.palette.length]; },
    value(value) { return ChartFactory.formatValue(value); },
    tip(container, event, lines) { ChartFactory.showTooltip(container, event, lines); },
    hideTip(container) { ChartFactory.hideTooltip(container); },
    bind(selection, container, describe) {
        const plot = this;
        selection.attr('tabindex', 0).attr('role', 'img')
            .attr('aria-label', datum => describe(datum).filter(value => value != null).join('. '))
            .on('pointerenter.analytics pointermove.analytics', (event, datum) => plot.tip(container, event, describe(datum)))
            .on('focus.analytics', function(event, datum) {
                const bounds = this.getBoundingClientRect();
                plot.tip(container, { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 }, describe(datum));
            })
            .on('pointerleave.analytics blur.analytics', () => plot.hideTip(container))
            .on('keydown.analytics', event => {
                if (event.key === 'Escape' && container.querySelector('.chart-tooltip')) {
                    event.preventDefault(); event.stopPropagation(); plot.hideTip(container);
                }
            });
        return selection;
    }
};
