// Main Globe Visualization Class
class GlobeVis {
    constructor() {
        this.width = window.innerWidth < 800 ? window.innerWidth - 40 : 780;
        this.height = 680;
        this.currentRotation = [0, 0, 0];
        this.sensitivity = 5;
        this.selectedCountry = null;
        this.worldData = null;

        // Earth radius
        this.radius = 270;

        // Auto-rotation properties
        this.autoRotate = true;
        this.autoRotateSpeed = 0.2;
        this.lastFrameTime = 0;
        this.animationFrameId = null;

        // Debug flag
        this.debug = true;

        // Make data service accessible for toggle function
        this.dataService = dataService;

        // Initialize the visualization
        this.initVis();

        // Set up event listeners
        this.setupEventListeners();

        // Create miniglobe instance
        this.miniGlobe = new MiniGlobe(this);

        // Store the instance globally for access
        window.globeInstance = this;
    }

    // Utility method for logging
    log(message, data) {
        if (this.debug) {
            if (data) {
                console.log(`[GlobeVis] ${message}`, data);
            } else {
                console.log(`[GlobeVis] ${message}`);
            }
        }
    }

    async initVis() {
        this.log("Initializing visualization");
        // Create SVG canvas with transparent background
        this.svg = d3.select('#globe')
            .append('svg')
            .attr('width', this.width)
            .attr('height', this.height)
            .attr('viewBox', `0 0 ${this.width} ${this.height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .style('background-color', 'transparent');

        // Create a group for the globe
        this.globeGroup = this.svg.append('g')
            .attr('transform', `translate(${this.width / 2 + 30}, ${this.height / 2})`);

        // Set up the projection with fixed radius
        this.projection = d3.geoOrthographic()
            .scale(this.radius)
            .translate([0, 0])
            .clipAngle(180); // Allow viewing the whole sphere including back side

        this.path = d3.geoPath().projection(this.projection);

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

        // Set up zoom behavior
        this.zoom = d3.zoom()
            .scaleExtent([0.7, 5])
            .on('zoom', this.zoomed.bind(this));

        // Add zoom behavior to SVG
        this.svg.call(this.zoom)
            .on("wheel", event => {
                event.preventDefault();
            });

        try {
            // Hide loading indicator
            const loadingIndicator = document.querySelector('#globe .loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.textContent = "Loading data...";
            }

            this.log("Loading data...");
            // Load data from data service first - this gives us country mappings
            await dataService.loadData();

            // Now load the world map data
            this.log("Loading world map data...");
            const worldData = await d3.json('https://unpkg.com/world-atlas@2/countries-110m.json');
            this.worldData = worldData;

            // Remove loading indicator
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }

            // Build country mapping table for GeoJSON features
            this.buildCountryFeatureMap();

            // Create the globe with data
            this.createGlobe();

            // Add ambient light shading to enhance 3D effect
            this.addLightEffect();

            // Update data selector dropdown
            this.updateDataSelector();

            // Set up date slider
            this.setupDateSlider();

            // Update country info panel initially
            this.updateCountryInfoPanel(null);

            // Start auto-rotation after everything is loaded
            this.startAutoRotation();
        } catch (error) {
            console.error('Error loading data:', error);
            document.getElementById('globe').innerHTML =
                `<div class="error-message">Error loading data: ${error.message}</div>`;
        }
    }

    resize() {
        // Handle window resize - adjust dimensions and redraw
        this.width = window.innerWidth < 800 ? window.innerWidth - 40 : 780;
        this.svg.attr('width', this.width)
            .attr('viewBox', `0 0 ${this.width} ${this.height}`);

        this.globeGroup.attr('transform', `translate(${this.width / 2 + 30}, ${this.height / 2 - 50})`); // Subtract 50px to move up
    }

    // Method to create minimized version of the globe (for backward compatibility)
    createMinimizedGlobe() {
        return this.miniGlobe.create();
    }

    // Method to restore from minimized state (for backward compatibility)
    restoreFromMinimized() {
        return this.miniGlobe.restore();
    }
}

// Export the class
window.GlobeVis = GlobeVis;
