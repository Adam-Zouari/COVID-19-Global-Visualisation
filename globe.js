// Globe Visualization with COVID-19 Data
class GlobeVis {
    constructor() {
        this.width = window.innerWidth < 800 ? window.innerWidth - 40 : 650; // Increased from 550
        this.height = 650; // Increased from 550
        this.currentRotation = [0, 0, 0];
        this.sensitivity = 5; // Decreased from 75 for more responsive rotation
        this.selectedCountry = null;
        this.dataType = 'cases';
        this.worldData = null;
        this.countryData = null;
        
        // Earth radius - increased for a bigger globe
        this.radius = 260; // Increased from 220
        
        // Initialize the visualization
        this.initVis();
        
        // Set up event listeners
        this.setupEventListeners();
    }
    
    async initVis() {
        // Create SVG canvas with transparent background
        this.svg = d3.select('#globe')
            .append('svg')
            .attr('width', this.width)
            .attr('height', this.height)
            .attr('viewBox', `0 0 ${this.width} ${this.height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .style('background-color', 'transparent'); // Ensure SVG background is transparent
            
        // Add a starfield background to the SVG
        this.addStarfield();
            
        // Create a group for the globe - shifted to the right
        this.globeGroup = this.svg.append('g')
            .attr('transform', `translate(${this.width / 2 + 30}, ${this.height / 2})`); // Added 30px offset
        
        // Set up the projection with fixed radius
        this.projection = d3.geoOrthographic()
            .scale(this.radius)
            .translate([0, 0])
            .clipAngle(90);
            
        this.path = d3.geoPath().projection(this.projection);
        
        // Add subtle graticule lines for longitude/latitude
        const graticule = d3.geoGraticule().step([20, 20]);
        this.globeGroup.append('path')
            .datum(graticule)
            .attr('class', 'graticule')
            .attr('d', this.path);
        
        // Add tooltip
        this.tooltip = d3.select('body')
            .append('div')
            .attr('class', 'tooltip')
            .style('opacity', 0);
        
        // Set up drag behavior with improved handling
        this.drag = d3.drag()
            .on('start', this.dragstarted.bind(this))
            .on('drag', this.dragged.bind(this))
            .on('end', this.dragended.bind(this));
            
        // Add drag behavior to SVG
        this.svg.call(this.drag);
        
        // Set up zoom behavior - fixed configuration for better responsiveness
        this.zoom = d3.zoom()
            .scaleExtent([0.7, 5]) // Wider zoom range
            .on('zoom', this.zoomed.bind(this));
            
        // Add zoom behavior to SVG with explicit handling of wheel events
        this.svg.call(this.zoom)
            .on("wheel", event => {
                event.preventDefault(); // Prevent page scrolling
            });
        
        try {
            // Load the world map data
            const worldData = await d3.json('https://unpkg.com/world-atlas@2/countries-110m.json');
            this.worldData = worldData;
            
            // Load COVID-19 data
            const covidData = await dataService.fetchAllData();
            
            // Create the globe with data
            this.createGlobe();
            
            // Add ambient light shading to enhance 3D effect
            this.addLightEffect();
            
            // Update country info with world data initially
            this.updateCountryInfoPanel(null);
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }
    
    addStarfield() {
        // Create a black backdrop for the globe to prevent background bleeding
        this.svg.append('circle')
            .attr('cx', this.width / 2 + 30)
            .attr('cy', this.height / 2)
            .attr('r', this.radius + 5)  // Slightly larger than the globe
            .attr('fill', '#000000')
            .attr('opacity', 0.7)        // Semi-transparent
            .attr('class', 'globe-backdrop');
            
        // Add a few accent stars directly in the SVG for additional depth
        
        const numAccentStars = 50; // Just a few accent stars in the SVG
        const accentStars = [];
        
        // Add some accent stars with varying sizes
        for (let i = 0; i < numAccentStars; i++) {
            const x = Math.random() * this.width;
            const y = Math.random() * this.height;
            const radius = Math.random() * 2 + 0.5; // Slightly larger for accent effect
            const opacity = Math.random() * 0.8 + 0.5; // Brighter
            
            accentStars.push({x, y, radius, opacity});
        }
        
        // Add the accent stars to the SVG (no background rect)
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
            
        // Add a few larger, glowing stars
        const largeStars = [];
        for (let i = 0; i < 5; i++) {
            largeStars.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                radius: Math.random() * 3 + 2,
                blur: Math.random() * 2 + 1
            });
        }
        
        starsGroup.selectAll('.large-star')
            .data(largeStars)
            .enter()
            .append('circle')
            .attr('cx', d => d.x)
            .attr('cy', d => d.y)
            .attr('r', d => d.radius)
            .attr('fill', '#FFFFFF')
            .attr('opacity', 0.9)
            .attr('filter', d => `blur(${d.blur}px)`);
    }
    
    addLightEffect() {
        // Create a gradient to simulate lighting but avoid using it on an ocean circle
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
        
        // No light effect circle - this was causing the blue glitching
    }
    
    createGlobe() {
        if (!this.worldData) return;
        
        // Extract the countries from TopoJSON
        const countries = topojson.feature(this.worldData, this.worldData.objects.countries);
        
        // Clear any existing paths
        this.globeGroup.selectAll('.country').remove();
        
        // Add ocean circle with a much darker blue color
        this.globeGroup.append('circle')
            .attr('class', 'ocean')
            .attr('cx', 0)
            .attr('cy', 0)
            .attr('r', this.radius)
            .attr('fill', '#002733')  // Very dark ocean blue color
            .attr('fill-opacity', 0.8);
        
        // Add countries to the globe with rendering optimizations
        this.globeGroup.selectAll('.country')
            .data(countries.features)
            .join('path')
            .attr('class', 'country')
            .attr('d', this.path)
            .attr('id', d => `country-${d.id}`)
            .attr('fill', d => this.getCountryColor(d))
            .attr('fill-opacity', 0.9)  // Increased from 0.85 for better visibility
            .attr('shape-rendering', 'geometricPrecision') // Improve rendering quality
            .on('mouseover', (event, d) => this.handleMouseOver(event, d))
            .on('mouseout', (event, d) => this.handleMouseOut(event, d))
            .on('click', (event, d) => this.handleCountryClick(event, d));
        
        // No ocean or light effect circles to avoid glitching
    }
    
    getCountryColor(d) {
        const countryCode = this.getCountryCode(d);
        const countryData = dataService.getCountryData(countryCode);
        
        if (!countryData) {
            // Default terrain color for countries with no data
            return '#3c7521';
        }
        
        const value = dataService.getDataByType(countryData, this.dataType);
        if (!value) return '#3c7521';
        
        const colorScale = dataService.getColorScale(this.dataType);
        return colorScale(value);
    }
    
    getCountryCode(d) {
        if (!d || !d.properties) return null;
        // Try to convert numeric ISO ID to country code
        return d.id?.toString() || null;
    }
    
    handleMouseOver(event, d) {
        // Highlight the country
        d3.select(event.currentTarget)
            .attr('stroke-width', '1px')
            .attr('stroke', '#fff');
            
        // Get country data
        const countryCode = this.getCountryCode(d);
        const countryData = dataService.getCountryData(countryCode);
        
        // Show tooltip
        if (countryData) {
            this.tooltip
                .style('opacity', 1)
                .html(`
                    <strong>${countryData.country}</strong><br>
                    Cases: ${dataService.formatNumber(countryData.cases)}<br>
                    Deaths: ${dataService.formatNumber(countryData.deaths)}
                `)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 20) + 'px');
        }
    }
    
    handleMouseOut(event, d) {
        // Reset highlight if not the selected country
        if (!this.selectedCountry || this.selectedCountry !== d.id) {
            d3.select(event.currentTarget)
                .attr('stroke-width', '0.3px')
                .attr('stroke', '#000');
        }
        
        // Hide tooltip
        this.tooltip
            .style('opacity', 0);
    }
    
    handleCountryClick(event, d) {
        const countryCode = this.getCountryCode(d);
        const countryData = dataService.getCountryData(countryCode);
        
        // Reset previous selection
        if (this.selectedCountry) {
            d3.select(`#country-${this.selectedCountry}`)
                .attr('stroke-width', '0.3px')
                .attr('stroke', '#000')
                .classed('selected-country', false);
        }
        
        // Set new selection
        this.selectedCountry = d.id;
        d3.select(event.currentTarget)
            .attr('stroke-width', '1.5px')
            .attr('stroke', '#fff')
            .classed('selected-country', true);
            
        // Update the country info panel
        this.updateCountryInfoPanel(countryData);
    }
    
    updateCountryInfoPanel(countryData) {
        const countryName = document.getElementById('countryName');
        const totalCases = document.getElementById('totalCases');
        const activeCases = document.getElementById('activeCases');
        const recovered = document.getElementById('recovered');
        const deaths = document.getElementById('deaths');
        
        if (countryData) {
            countryName.textContent = countryData.country;
            totalCases.textContent = dataService.formatNumber(countryData.cases);
            activeCases.textContent = dataService.formatNumber(countryData.active);
            recovered.textContent = dataService.formatNumber(countryData.recovered);
            deaths.textContent = dataService.formatNumber(countryData.deaths);
        } else {
            // Show global data if no country selected
            const worldData = dataService.getWorldData();
            if (worldData) {
                countryName.textContent = 'Global Overview';
                totalCases.textContent = dataService.formatNumber(worldData.cases);
                activeCases.textContent = dataService.formatNumber(worldData.active);
                recovered.textContent = dataService.formatNumber(worldData.recovered);
                deaths.textContent = dataService.formatNumber(worldData.deaths);
            } else {
                countryName.textContent = 'Select a country';
                totalCases.textContent = '-';
                activeCases.textContent = '-';
                recovered.textContent = '-';
                deaths.textContent = '-';
            }
        }
    }
    
    dragstarted(event) {
        // Store initial rotation and mouse position
        this.drag.initialRotation = [...this.currentRotation];
        this.drag.startPos = [event.x, event.y];
    }
    
    dragged(event) {
        if (!this.drag.initialRotation) this.drag.initialRotation = [...this.currentRotation];
        
        // Calculate change in position
        const dx = event.x - this.drag.startPos[0];
        const dy = event.y - this.drag.startPos[1];
        
        // Calculate new rotation - using standard approach
        this.currentRotation[0] = this.drag.initialRotation[0] + dx / this.sensitivity;
        this.currentRotation[1] = Math.max(-90, Math.min(90, this.drag.initialRotation[1] - dy / this.sensitivity));
        
        // Update projection with new rotation
        this.projection.rotate(this.currentRotation);
        
        // Request animation frame for smoother rendering
        requestAnimationFrame(() => {
            // Update all paths with new projection
            this.globeGroup.selectAll('path')
                .attr('d', this.path);
        });
    }
    
    dragended(event) {
        // Store the final rotation
        this.drag.initialRotation = undefined;
        this.drag.startPos = undefined;
    }
    
    zoomed(event) {
        console.log("Zoom event detected:", event.transform.k); // Debug log
        
        // Get the scale from the zoom transform
        const scale = event.transform.k;
        
        // Adjust the globe radius based on the zoom scale
        const adjustedRadius = this.radius * scale;
        
        // Update projection scale with the adjusted radius
        this.projection.scale(adjustedRadius);
        
        // Update all paths with new projection
        this.globeGroup.selectAll('path')
            .attr('d', this.path);
            
        // Update the ocean circle radius
        this.globeGroup.select('.ocean')
            .attr('r', adjustedRadius);
            
        // Update the backdrop circle radius too
        this.svg.select('.globe-backdrop')
            .attr('r', adjustedRadius + 5);
            
        // Update stroke widths inversely proportional to zoom level
        this.globeGroup.selectAll('.country')
            .attr('stroke-width', (0.3 / scale) + 'px');
            
        // Update graticule lines
        this.globeGroup.select('.graticule')
            .attr('stroke-width', (0.5 / scale) + 'px');
    }
    
    updateDataType(dataType) {
        this.dataType = dataType;
        
        // Update all country colors
        this.globeGroup.selectAll('.country')
            .attr('fill', d => this.getCountryColor(d));
    }
    
    resetView() {
        // Reset rotation and zoom with smooth animation
        this.currentRotation = [0, 0, 0];
        
        // Smooth rotation transition
        d3.transition()
            .duration(1000)
            .tween('rotate', () => {
                const r = d3.interpolate(this.projection.rotate(), this.currentRotation);
                return t => {
                    this.projection.rotate(r(t));
                    this.globeGroup.selectAll('path').attr('d', this.path);
                };
            });
        
        // Reset zoom transform with animation
        this.svg.transition()
            .duration(750)
            .call(this.zoom.transform, d3.zoomIdentity);
    }
    
    setupEventListeners() {
        // Handle data type selector change
        document.getElementById('dataSelector').addEventListener('change', (event) => {
            this.updateDataType(event.target.value);
        });
        
        // Handle reset button click
        document.getElementById('resetBtn').addEventListener('click', () => {
            this.resetView();
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.resize();
        });
    }
    
    resize() {
        // Keep a fixed size for the globe rather than resizing with window
        // Only update the SVG container, not the globe radius
        this.svg
            .attr('width', this.width)
            .attr('viewBox', `0 0 ${this.width} ${this.height}`);
            
        // Update translation of globe group - maintain the right offset
        this.globeGroup.attr('transform', `translate(${this.width / 2 + 30}, ${this.height / 2})`);
    }
}

// Initialize the globe visualization when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const globe = new GlobeVis();
});
