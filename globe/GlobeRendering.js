// Globe Rendering Methods
GlobeVis.prototype.createGlobe = function() {
    if (!this.worldData) {
        this.log("No world data available, can't create globe");
        return;
    }

    this.log("Creating globe");

    // Extract the countries from TopoJSON
    const countries = topojson.feature(this.worldData, this.worldData.objects.countries);

    // Debug country count
    console.log(`Found ${countries.features.length} countries in GeoJSON data`);

    // Clear any existing paths
    this.globeGroup.selectAll('.country').remove();
    this.globeGroup.select('.ocean').remove();
    this.globeGroup.select('.ocean-depth').remove();

    // Create transparent ocean instead of solid color
    this.createTransparentOcean();

    // Function to calculate point's distance from center of view
    // Used to set opacity based on position (front or back)
    const calculateOpacity = d => {
        // Always return 1.0 for complete opacity regardless of position
        return 1.0;
    };

    // Add countries to the globe
    this.globeGroup.selectAll('.country')
        .data(countries.features)
        .join('path')
        .attr('class', 'country')
        .attr('d', this.path)
        .attr('id', d => `country-${d.id}`)
        .attr('data-country-code', d => this.getCountryCode(d))
        .attr('fill', d => this.getCountryColor(d))
        .attr('fill-opacity', 1.0) // Always full opacity
        .attr('stroke', 'rgba(255,255,255,0.0)') // Transparent stroke by default
        .attr('stroke-width', '0.5px')
        .attr('shape-rendering', 'geometricPrecision')
        .on('mouseover', (event, d) => this.handleMouseOver(event, d))
        .on('mouseout', (event, d) => this.handleMouseOut(event, d))
        .on('click', (event, d) => this.handleCountryClick(event, d));

    this.log("Globe created with countries");

    // Count how many countries have data
    const countriesWithData = countries.features.filter(d => {
        const countryCode = this.getCountryCode(d);
        if (!countryCode) return false;
        return dataService.getDataValue(countryCode) > 0;
    }).length;

    console.log(`${countriesWithData} out of ${countries.features.length} countries have data values`);

    // Update status with data availability
    if (countriesWithData === 0) {
        document.getElementById('dataStatus').textContent = "Warning: No countries have data values";
        document.getElementById('dataStatus').style.color = "#FFC107";
    } else {
        document.getElementById('dataStatus').textContent = `Ready - ${countriesWithData} countries have data`;
    }

    // Always enable transparent mode
    this.enableTransparentMode();
};

GlobeVis.prototype.enableTransparentMode = function() {
    // Set clip angle to 180 for full transparency
    this.projection.clipAngle(180);

    // Update all country paths
    this.globeGroup.selectAll('.country')
        .attr('d', this.path);

    // Hide the backdrop
    this.svg.select('.globe-backdrop')
        .attr('fill', 'none')
        .attr('opacity', 0);

    // Apply depth-based opacity and interactivity
    this.renderCountriesByDepth();
};

GlobeVis.prototype.getCountryColor = function(d) {
    // Get country code using our mapping function
    const countryCode = this.getCountryCode(d);

    // If we don't have a country code, use the default color from data service
    if (!countryCode) {
        return dataService.getDefaultColor(); // Use dataset-specific background color
    }

    try {
        // Use the pre-calculated color from the data service
        const color = dataService.getCountryColor(countryCode);

        // Log sample of values for debugging (only for selected major countries)
        const majorCountries = ['us', 'gb', 'cn', 'ru', 'in', 'br'];
        if (majorCountries.includes(countryCode.toLowerCase()) && Math.random() < 0.05) {
            // Only log occasionally to reduce console spam
            console.log(`Color for ${countryCode}: ${color}`);
        }

        return color;
    } catch (e) {
        console.error(`Error getting color for country ${countryCode}:`, e);
        return dataService.getDefaultColor(); // Use dataset-specific background color on error
    }
};

GlobeVis.prototype.updateGlobeColors = function() {
    this.log("Updating globe colors");

    // Count countries with data before update
    const countryElements = this.globeGroup.selectAll('.country');
    let countriesWithData = 0;
    let totalCountries = 0;

    // Get the default color for the current dataset
    const defaultColor = dataService.getDefaultColor();

    // Update colors for all countries based on current data
    countryElements
        .attr('fill', d => {
            totalCountries++;
            const countryCode = this.getCountryCode(d);
            if (!countryCode) return defaultColor;

            const color = dataService.getCountryColor(countryCode);
            if (color !== defaultColor) {
                countriesWithData++;
            }
            return color;
        });

    console.log(`After color update: ${countriesWithData} out of ${totalCountries} countries have data values`);

    // Update status
    if (countriesWithData === 0) {
        document.getElementById('dataStatus').textContent = `Warning: No countries have data for ${dataService.currentColumn}`;
        document.getElementById('dataStatus').style.color = "#FFC107";
    } else {
        document.getElementById('dataStatus').textContent = `Showing ${dataService.currentColumn} - ${countriesWithData} countries have data`;
        document.getElementById('dataStatus').style.color = "#4CAF50";
    }

    this.log("Globe colors updated");
};

GlobeVis.prototype.addStarfield = function() {
    // Create a black backdrop for the globe - completely opaque
    this.svg.append('circle')
        .attr('cx', this.width / 2 + 30)
        .attr('cy', this.height / 2)
        .attr('r', this.radius + 5)
        .attr('fill', '#000000')
        .attr('opacity', 1)  // Fully opaque
        .attr('class', 'globe-backdrop');

    // Add accent stars only at the edges - don't place stars near the globe center
    const numAccentStars = 30;  // Reduced number
    const accentStars = [];
    const centerX = this.width / 2 + 30;
    const centerY = this.height / 2;
    const excludeRadius = this.radius + 10;  // Don't place stars within this radius

    for (let i = 0; i < numAccentStars; i++) {
        let x, y, distance;

        // Keep generating positions until we find one outside the exclude radius
        do {
            x = Math.random() * this.width;
            y = Math.random() * this.height;
            distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
        } while (distance < excludeRadius);

        const radius = Math.random() * 2 + 0.5;
        const opacity = Math.random() * 0.8 + 0.5;

        accentStars.push({x, y, radius, opacity});
    }

    const starsGroup = this.svg.append('g').attr('class', 'stars');

    starsGroup.selectAll('circle')
        .data(accentStars)
        .enter()
        .append('circle')
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
        .attr('r', d => d.radius)
        .attr('fill', '#FFFFFF')
        .attr('opacity', d => d.opacity);
};

GlobeVis.prototype.addLightEffect = function() {
    // Create a gradient to simulate lighting
    const lightGradient = this.svg.append('defs')
        .append('radialGradient')
        .attr('id', 'earth-light')
        .attr('cx', '25%')
        .attr('cy', '25%')
        .attr('r', '65%');

    lightGradient.append('stop')
        .attr('offset', '5%')
        .attr('stop-color', '#FFFFFF')
        .attr('stop-opacity', '0.3');

    lightGradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', '#000000')
        .attr('stop-opacity', '0.8');
};

GlobeVis.prototype.createTransparentOcean = function() {
    // Remove existing ocean if any
    this.globeGroup.select('.ocean').remove();

    // Remove graticule lines (stripes)
    this.globeGroup.select('.graticule').remove();

    // Create the ocean circle with a semi-opaque fill
    this.globeGroup.append('circle')
        .attr('class', 'ocean')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('r', this.radius)
        .attr('fill', '#000000') // Black fill for the ocean
        .attr('fill-opacity', 0.7) // 70% opacity - increase this value to make more opaque
        .attr('stroke', 'rgba(100, 200, 255, 0.25)')
        .attr('stroke-width', '0.5px')
        .on('click', () => this.clearCountrySelection()); // Add click handler to clear selection

    // Remove the depth gradient since we want to see through the globe
    this.svg.select('#ocean-depth').remove();

    // Remove the ocean-depth circle if it exists
    this.globeGroup.select('.ocean-depth').remove();
};

GlobeVis.prototype.clearCountrySelection = function() {
    // Only proceed if there is a selected country
    if (this.selectedCountry) {
        // Reset previous selected country styling
        d3.select(`#country-${this.selectedCountry}`)
            .attr('stroke', 'rgba(255,255,255,0.0)')
            .attr('stroke-width', '0.5px')
            .classed('selected-country', false);

        this.selectedCountry = null;

        // Update the country info panel to hide it
        this.updateCountryInfoPanel(null);
    }
};

// Add method to render countries based on their depth in transparent mode - optimized version
GlobeVis.prototype.renderCountriesByDepth = function() {
    // Cache these calculations to avoid recomputing them in the loop
    const viewVector = this.projection.rotate().map(d => -d * Math.PI / 180); // Convert to radians and invert
    const cosViewX = Math.cos(viewVector[0]);
    const sinViewX = Math.sin(viewVector[0]);
    const cosViewY = Math.cos(viewVector[1]);
    const sinViewY = Math.sin(viewVector[1]);

    // Get all country elements and calculate their depth
    const countryElements = this.globeGroup.selectAll('.country').nodes();

    // Process in batches for better performance
    const batchSize = 20; // Process countries in smaller batches
    const totalBatches = Math.ceil(countryElements.length / batchSize);

    // Use requestAnimationFrame to stagger the processing
    const processBatch = (batchIndex) => {
        if (batchIndex >= totalBatches) return;

        const start = batchIndex * batchSize;
        const end = Math.min(start + batchSize, countryElements.length);

        // Process this batch
        const batchData = [];
        for (let i = start; i < end; i++) {
            const element = d3.select(countryElements[i]);
            const d = element.datum();

            // Calculate centroid for the country (only once per country)
            const centroid = d3.geoCentroid(d);

            // Convert to cartesian coordinates (rough approximation)
            const radLat = centroid[1] * Math.PI / 180;
            const radLong = centroid[0] * Math.PI / 180;
            const cosLat = Math.cos(radLat);
            const x = cosLat * Math.cos(radLong);
            const y = cosLat * Math.sin(radLong);
            const z = Math.sin(radLat);

            // Calculate dot product (larger values = more in front)
            // Optimized dot product calculation
            const dotProduct = x * cosViewX * cosViewY +
                             y * sinViewX * cosViewY +
                             z * sinViewY;

            batchData.push({
                element,
                depth: dotProduct
            });
        }

        // Apply depth-based rendering to this batch
        batchData.forEach(item => {
            const isOnBack = item.depth < 0;

            // Calculate opacity based on depth - smoother transition
            const opacity = isOnBack
                ? Math.max(0.05, 0.15 + item.depth) // Slightly higher minimum opacity for smoother transition
                : 1.0; // Front countries fully opaque

            // Set the calculated opacity
            item.element
                .attr('fill-opacity', opacity)
                .style('pointer-events', isOnBack ? 'none' : 'auto'); // Disable mouse events for back countries
        });

        // Process next batch in next frame
        if (batchIndex < totalBatches - 1) {
            requestAnimationFrame(() => processBatch(batchIndex + 1));
        }
    };

    // Start batch processing
    processBatch(0);

    // Reordering countries can be done less frequently for better performance
    if (this._lastReorderTime === undefined || Date.now() - this._lastReorderTime > 500) {
        // Sort all countries by depth (furthest to closest)
        const allCountryData = countryElements.map(node => {
            const element = d3.select(node);
            const d = element.datum();

            // Calculate centroid and depth
            const centroid = d3.geoCentroid(d);
            const radLat = centroid[1] * Math.PI / 180;
            const radLong = centroid[0] * Math.PI / 180;
            const cosLat = Math.cos(radLat);
            const x = cosLat * Math.cos(radLong);
            const y = cosLat * Math.sin(radLong);
            const z = Math.sin(radLat);

            const dotProduct = x * cosViewX * cosViewY +
                             y * sinViewX * cosViewY +
                             z * sinViewY;

            return {
                node: node,
                depth: dotProduct
            };
        }).sort((a, b) => a.depth - b.depth);

        // Update rendering order
        const parent = countryElements[0].parentNode;
        for (const item of allCountryData) {
            parent.appendChild(item.node);
        }

        this._lastReorderTime = Date.now();
    }
};
