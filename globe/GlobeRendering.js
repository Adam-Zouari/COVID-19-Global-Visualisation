GlobeVis.prototype.createGlobe = function() {
    if (!this.worldData) return;
    this.globeGroup.selectAll('*').remove();
    this.globeGroup.append('circle')
        .attr('class', 'ocean').attr('r', this.projection.scale())
        .attr('fill', '#101d30').attr('stroke', '#345074')
        .attr('stroke-width', 1)
        .on('click', () => this.clearCountrySelection());
    this.globeGroup.append('path')
        .datum(d3.geoGraticule10()).attr('class', 'graticule')
        .attr('d', this.path).attr('fill', 'none')
        .attr('stroke', '#90abc9').attr('stroke-opacity', 0.1)
        .attr('stroke-width', 0.5).attr('pointer-events', 'none');
    this.globeGroup.selectAll('.country')
        .data(this.countryFeatures, feature => feature.id).join('path')
        .attr('class', 'country')
        .attr('id', feature => `country-${feature.id}`)
        .attr('data-country-code', feature => this.getCountryCode(feature))
        .attr('d', this.path).attr('fill', feature => this.getCountryColor(feature))
        .attr('stroke', '#17283b').attr('stroke-width', 0.45)
        .on('mouseover', (event, feature) => this.handleMouseOver(event, feature))
        .on('mousemove', event => this.positionTooltip(event))
        .on('mouseout', (event, feature) => this.handleMouseOut(event, feature))
        .on('click', (event, feature) => this.handleCountryClick(event, feature));
};

GlobeVis.prototype.getCountryColor = function(feature) {
    const code = this.getCountryCode(feature);
    return code ? this.dataService.getCountryColor(code) : this.dataService.getDefaultColor();
};

GlobeVis.prototype.updateGlobeColors = function() {
    const countriesWithData = new Set();
    this.globeGroup.selectAll('.country').attr('fill', feature => {
        const code = this.getCountryCode(feature);
        // A reported zero is data, not a missing value.
        const value = code ? this.displayValue(code) : null;
        if (typeof value === 'number' && Number.isFinite(value)) countriesWithData.add(code);
        return this.getCountryColor(feature);
    });
    const status = document.getElementById('dataStatus');
    if (status) {
        const sources = {
            sample: 'Sample data (fictional demonstration)',
            upload: 'Uploaded CSV data',
            csv: 'CSV data'
        };
        const source = sources[this.dataService.dataSource] || 'Data';
        status.textContent = `${source} · ${this.metricLabel()} · ${countriesWithData.size} mapped ${countriesWithData.size === 1 ? 'country' : 'countries'} with data`;
    }
    this.tooltip.style('opacity', 0);
    this.updateLegend();
};

GlobeVis.prototype.clearCountrySelection = function() {
    this.globeGroup.selectAll('.selected-country')
        .attr('stroke', '#17283b').attr('stroke-width', 0.45)
        .classed('selected-country', false);
    this.selectedCountry = null;
    this.selectedCountryCode = null;
    this.updateCountryInfoPanel(null);
    this.dispatchStateEvent('country-selected');
};

GlobeVis.prototype.updateLegend = function() {
    let legend = document.getElementById('globeLegend');
    if (!legend) {
        const controls = document.querySelector?.('.control-panel');
        if (!controls) return;
        legend = document.createElement('div');
        legend.id = 'globeLegend';
        legend.className = 'globe-legend';
        legend.setAttribute('aria-label', 'Globe color scale');
        controls.appendChild(legend);
    }
    legend.replaceChildren();
    const scale = this.dataService.getColorScale();
    const [minimum, maximum] = scale.domain();
    const title = document.createElement('div');
    title.className = 'legend-title';
    title.textContent = `${this.metricLabel()} · ${this.unitLabel()}`;
    const gradient = document.createElement('div');
    gradient.className = 'legend-gradient';
    gradient.setAttribute('aria-hidden', 'true');
    const steps = scale.colors?.() || Array.from({ length: 6 }, (_, index) => scale(maximum * ((index + 0.5) / 6) ** 2));
    const stops = steps.flatMap((color, index) => [`${color} ${index / 6 * 100}%`, `${color} ${(index + 1) / 6 * 100}%`]);
    gradient.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
    const range = document.createElement('div');
    range.className = 'legend-range';
    const breaks = scale.breaks?.();
    for (const value of breaks ? [0, breaks[3], maximum] : [0, maximum]) {
        const label = document.createElement('span');
        label.textContent = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
        range.appendChild(label);
    }
    const note = document.createElement('div');
    note.className = 'legend-note';
    note.textContent = `Fixed across dates · ${scale.type || 'nonlinear'} scale`;
    legend.append(title, gradient, range, note);
    const swatches = [[this.dataService.getDefaultColor(), this.dataService.smoothing === '7day' ? 'Missing / insufficient reports' : 'Not reported']];
    if (minimum < 0) swatches.push([scale(minimum), 'Negative: reporting correction']);
    for (const [color, description] of swatches) {
        const row = document.createElement('div');
        row.className = 'legend-key';
        const swatch = document.createElement('span');
        swatch.className = 'legend-swatch';
        swatch.style.backgroundColor = color;
        swatch.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = description;
        row.append(swatch, label);
        legend.appendChild(row);
    }
};
