GlobeVis.prototype.createGlobe = function() {
    if (!this.worldData) return;
    const palette = this.getGlobePalette();
    this.globeGroup.selectAll('*').remove();
    this.globeGroup.append('circle')
        .attr('class', 'ocean').attr('r', this.projection.scale())
        .attr('fill', palette.ocean).attr('stroke', palette.rim)
        .attr('stroke-width', 1.1)
        .on('click', () => this.clearCountrySelection());
    this.globeGroup.append('path')
        .datum(d3.geoGraticule10()).attr('class', 'graticule')
        .attr('d', this.path).attr('fill', 'none')
        .attr('stroke', palette.grid).attr('stroke-opacity', 0.4)
        .attr('stroke-width', 0.6).attr('pointer-events', 'none');
    this.globeGroup.selectAll('.country')
        .data(this.countryFeatures, feature => feature.id).join('path')
        .attr('class', 'country')
        .attr('id', feature => `country-${feature.id}`)
        .attr('data-country-code', feature => this.getCountryCode(feature))
        .attr('d', this.path).attr('fill', feature => this.getCountryColor(feature))
        .attr('stroke', palette.border).attr('stroke-width', 0.45)
        .on('mouseover', (event, feature) => this.handleMouseOver(event, feature))
        .on('mousemove', event => this.positionTooltip(event))
        .on('mouseout', (event, feature) => this.handleMouseOut(event, feature))
        .on('click', (event, feature) => this.handleCountryClick(event, feature));
    if (this.coastlineTopology !== this.worldData) {
        // Exterior arcs trace land against water without painting internal
        // country borders or the projection's clipped polygon edges.
        this.coastlineGeometry = topojson.mesh(this.worldData, this.worldData.objects.countries, (a, b) => a === b);
        this.coastlineTopology = this.worldData;
    }
    this.globeGroup.append('path')
        .datum(this.coastlineGeometry).attr('class', 'coastline')
        .attr('d', this.path).attr('fill', 'none')
        .attr('stroke', '#ffffff').attr('stroke-opacity', 0.88)
        .attr('stroke-width', 0.7).attr('pointer-events', 'none');
};

GlobeVis.prototype.readGlobePalette = function() {
    // UI tokens own the globe's chrome; the data service owns its data palettes.
    const defaults = {
        ocean: '#101f33', rim: '#4d6c8e', grid: '#607f9f',
        border: '#243952', hover: '#f3f7fe', selection: '#f3f7fe'
    };
    return Object.fromEntries(Object.entries(defaults).map(([name, fallback]) =>
        [name, globalThis.window?.AtlasTheme?.getColor?.(`--globe-${name}`) || fallback]));
};

GlobeVis.prototype.getGlobePalette = function() {
    if (!this.globePalette) this.globeAppearance = globalThis.window?.AtlasTheme?.getResolvedTheme?.() || 'dark';
    return this.globePalette ||= this.readGlobePalette();
};

GlobeVis.prototype.refreshGlobeAppearance = function() {
    const previous = this.globePalette;
    const previousAppearance = this.globeAppearance;
    const appearance = globalThis.window?.AtlasTheme?.getResolvedTheme?.() || 'dark';
    const palette = this.readGlobePalette();
    this.globePalette = palette;
    this.globeAppearance = appearance;
    if (!this.globeCreated || !this.globeGroup) return;
    if (!previous || Object.keys(palette).some(key => previous[key] !== palette[key])) {
        this.globeGroup.select('.ocean').attr('fill', palette.ocean).attr('stroke', palette.rim);
        this.globeGroup.select('.graticule').attr('stroke', palette.grid);
        this.globeGroup.selectAll('.country').attr('stroke', feature =>
            feature.id === this.selectedCountry ? palette.selection :
                feature.id === this.hoveredCountry ? palette.hover : palette.border);
    }
    // Reuse existing paths/projection and cached observations. Only the palette
    // changes; updateGlobeColors also refreshes the legend with the same scale.
    if (previousAppearance && previousAppearance !== appearance) this.updateGlobeColors();
};

GlobeVis.prototype.getCountryColor = function(feature) {
    const code = this.getCountryCode(feature);
    return code ? this.dataService.getCountryColor(code) : this.dataService.getDefaultColor();
};

GlobeVis.prototype.updateGlobeColors = function() {
    this.globeGroup.selectAll('.country').attr('fill', feature => this.getCountryColor(feature));
    this.tooltip.style('opacity', 0);
    this.updateLegend();
};

GlobeVis.prototype.clearCountrySelection = function({ notify = true } = {}) {
    const palette = this.getGlobePalette();
    this.globeGroup.selectAll('.selected-country')
        .attr('stroke', feature => feature.id === this.hoveredCountry ? palette.hover : palette.border)
        .attr('stroke-width', feature => feature.id === this.hoveredCountry ? 1.2 : 0.45)
        .classed('selected-country', false);
    this.selectedCountry = null;
    this.selectedCountryCode = null;
    this.updateCountryInfoPanel(null);
    if (notify) this.dispatchStateEvent('country-selected');
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
    const rangesExpanded = Boolean(legend.querySelector('details')?.open);
    const rangesFocused = legend.querySelector('summary') === document.activeElement;
    legend.replaceChildren();
    legend.removeAttribute('aria-describedby');
    const scale = this.dataService.getColorScale();
    const [minimum, maximum] = scale.domain();
    const formatCompact = value => Math.abs(value) > 0 && Math.abs(value) < 0.1 ?
        new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 }).format(value) :
        new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
    const formatBoundary = value => new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 }).format(value);
    const formatExact = value => new Intl.NumberFormat('en-US', { maximumSignificantDigits: 12 }).format(value);
    const title = document.createElement('div');
    title.className = 'legend-title';
    title.textContent = `${this.metricLabel()} · ${this.unitLabel()}`;
    const gradient = document.createElement('div');
    gradient.className = 'legend-gradient';
    gradient.setAttribute('aria-hidden', 'true');
    const steps = scale.colors?.() || Array.from({ length: 6 }, (_, index) => scale(maximum * ((index + 0.5) / 6) ** 2));
    const stops = steps.flatMap((color, index) => [`${color} ${index / steps.length * 100}%`, `${color} ${(index + 1) / steps.length * 100}%`]);
    gradient.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
    const range = document.createElement('div');
    range.className = 'legend-range';
    const breaks = scale.breaks?.();
    // A logarithmic band's middle boundary is not half the maximum. Only show
    // endpoints here; the expandable key maps each actual color to its range.
    for (const value of [0, maximum]) {
        const label = document.createElement('span');
        label.textContent = formatCompact(value);
        label.title = formatExact(value);
        range.appendChild(label);
    }
    const note = document.createElement('div');
    note.className = 'legend-note';
    const logarithmic = scale.type === 'logarithmic';
    note.textContent = `${logarithmic ? 'Logarithmic' : scale.type === 'linear' ? 'Linear' : 'Nonlinear'} color bands · Fixed across dates`;
    legend.append(title, gradient, range, note);
    if (breaks?.length === steps.length + 1) {
        const details = document.createElement('details'); details.className = 'legend-details'; details.open = rangesExpanded;
        const summary = document.createElement('summary'); summary.textContent = 'Color ranges & scale';
        const explanation = document.createElement('p'); explanation.className = 'legend-explanation';
        explanation.id = 'globeLegendExplanation';
        explanation.textContent = logarithmic ?
            'Equal color steps span increasingly large numeric ranges, not equal increases. Boundaries below are approximate. Zero is a reported value; gray means unavailable.' :
            'Equal color steps represent equal numeric increases. Boundaries below are approximate. Zero is a reported value; gray means unavailable.';
        legend.setAttribute('aria-describedby', explanation.id);
        const bands = document.createElement('div'); bands.className = 'legend-bands'; bands.setAttribute('role', 'list');
        const activeSteps = maximum === 0 ? steps.slice(0, 1) : steps;
        for (const [index, color] of activeSteps.entries()) {
            const row = document.createElement('div'); row.className = 'legend-band'; row.setAttribute('role', 'listitem');
            const low = breaks[index], high = breaks[index + 1];
            const swatch = document.createElement('span'); swatch.className = 'legend-swatch'; swatch.style.backgroundColor = color; swatch.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span');
            label.textContent = maximum === 0 ? '0 · Reported zero' : `${formatBoundary(low)} – ${index === steps.length - 1 ? '' : '<'}${formatBoundary(high)}`;
            const exactRange = maximum === 0 ? 'Reported zero' : `${formatExact(low)} up to ${index === steps.length - 1 ? 'and including' : 'but excluding'} ${formatExact(high)}`;
            row.title = exactRange; row.setAttribute('aria-label', exactRange);
            row.append(swatch, label); bands.appendChild(row);
        }
        details.append(summary, explanation, bands); legend.appendChild(details);
        if (rangesFocused) summary.focus({ preventScroll: true });
    }
    const swatches = [[this.dataService.getDefaultColor(),
        this.dataService.displayUnit !== 'count' ? 'Missing report / population unavailable' :
        this.dataService.smoothing === '7day' ? 'Missing / insufficient reports' : 'Not reported']];
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
