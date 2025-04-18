// Globe Visualization with COVID-19 Data
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
            
        // Don't add starfield background to prevent stars behind globe
            
        // Create a group for the globe
        this.globeGroup = this.svg.append('g')
            .attr('transform', `translate(${this.width / 2 + 30}, ${this.height / 2})`); // Removed the -50px offset
        
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
    
    // Build lookup for countries in the GeoJSON
    buildCountryFeatureMap() {
        if (!this.worldData) return;
        
        this.log("Building country feature map");
        this.countryFeatureMap = new Map();
        
        // Country name mappings from the GeoJSON to ISO codes
        // This mapping table handles common naming differences between datasets
        const countryNameMappings = {
            // Africa
            "Algeria": "dz",
            "Angola": "ao",
            "Benin": "bj",
            "Botswana": "bw",
            "Burkina Faso": "bf",
            "Burundi": "bi",
            "Cameroon": "cm",
            "Central African Rep.": "cf",
            "Central African Republic": "cf",
            "Chad": "td",
            "Congo": "cg",
            "Dem. Rep. Congo": "cd",
            "Democratic Republic of the Congo": "cd",
            "Djibouti": "dj",
            "Egypt": "eg",
            "Eq. Guinea": "gq",
            "Equatorial Guinea": "gq",
            "Eritrea": "er",
            "eSwatini": "sz",
            "Swaziland": "sz",
            "Ethiopia": "et",
            "Gabon": "ga",
            "Gambia": "gm",
            "Ghana": "gh",
            "Guinea": "gn",
            "Guinea-Bissau": "gw",
            "Côte d'Ivoire": "ci",
            "Ivory Coast": "ci",
            "Kenya": "ke",
            "Lesotho": "ls",
            "Liberia": "lr",
            "Libya": "ly",
            "Madagascar": "mg",
            "Malawi": "mw",
            "Mali": "ml",
            "Mauritania": "mr",
            "Morocco": "ma",
            "Mozambique": "mz",
            "Namibia": "na",
            "Niger": "ne",
            "Nigeria": "ng",
            "Rwanda": "rw",
            "Senegal": "sn",
            "Sierra Leone": "sl",
            "Somalia": "so",
            "Somaliland": "so",
            "S. Sudan": "ss",
            "South Sudan": "ss",
            "Sudan": "sd",
            "Tanzania": "tz",
            "Togo": "tg",
            "Tunisia": "tn",
            "Uganda": "ug",
            "W. Sahara": "eh",
            "Western Sahara": "eh",
            "Zambia": "zm",
            "Zimbabwe": "zw",
            
            // Americas
            "Argentina": "ar",
            "Bahamas": "bs",
            "Belize": "bz",
            "Bolivia": "bo",
            "Brazil": "br",
            "Canada": "ca",
            "Chile": "cl",
            "Colombia": "co",
            "Costa Rica": "cr",
            "Cuba": "cu",
            "Dominican Rep.": "do",
            "Dominican Republic": "do",
            "Ecuador": "ec",
            "El Salvador": "sv",
            "Falkland Is.": "fk",
            "Falkland Islands": "fk",
            "Fr. S. Antarctic Lands": "tf",
            "French Southern Territories": "tf",
            "Greenland": "gl",
            "Guatemala": "gt",
            "Guyana": "gy",
            "Haiti": "ht",
            "Honduras": "hn",
            "Jamaica": "jm",
            "Mexico": "mx",
            "Nicaragua": "ni",
            "Panama": "pa",
            "Paraguay": "py",
            "Peru": "pe",
            "Puerto Rico": "pr",
            "Suriname": "sr",
            "Trinidad and Tobago": "tt",
            "United States of America": "us",
            "United States": "us",
            "Uruguay": "uy",
            "Venezuela": "ve",
            
            // Asia
            "Afghanistan": "af",
            "Armenia": "am",
            "Azerbaijan": "az",
            "Bangladesh": "bd",
            "Bhutan": "bt",
            "Brunei": "bn",
            "Cambodia": "kh",
            "China": "cn",
            "Cyprus": "cy",
            "N. Cyprus": "cy",
            "Georgia": "ge",
            "India": "in",
            "Indonesia": "id",
            "Iran": "ir",
            "Iraq": "iq",
            "Israel": "il",
            "Japan": "jp",
            "Jordan": "jo",
            "Kazakhstan": "kz",
            "Kuwait": "kw",
            "Kyrgyzstan": "kg",
            "Laos": "la",
            "Lebanon": "lb",
            "Malaysia": "my",
            "Mongolia": "mn",
            "Myanmar": "mm",
            "Burma": "mm",
            "Nepal": "np",
            "North Korea": "kp",
            "Oman": "om",
            "Pakistan": "pk",
            "Palestine": "ps",
            "Philippines": "ph",
            "Qatar": "qa",
            "Russia": "ru",
            "Russian Federation": "ru",
            "Saudi Arabia": "sa",
            "South Korea": "kr",
            "Sri Lanka": "lk",
            "Syria": "sy",
            "Tajikistan": "tj",
            "Thailand": "th",
            "Timor-Leste": "tl",
            "East Timor": "tl",
            "Turkey": "tr",
            "Turkmenistan": "tm",
            "Taiwan": "tw",
            "United Arab Emirates": "ae",
            "Uzbekistan": "uz",
            "Vietnam": "vn",
            "Yemen": "ye",
            
            // Europe
            "Albania": "al",
            "Austria": "at",
            "Belarus": "by",
            "Belgium": "be",
            "Bosnia and Herz.": "ba",
            "Bosnia and Herzegovina": "ba",
            "Bulgaria": "bg",
            "Croatia": "hr",
            "Czechia": "cz",
            "Czech Republic": "cz",
            "Denmark": "dk",
            "Estonia": "ee",
            "Finland": "fi",
            "France": "fr",
            "Germany": "de",
            "Greece": "gr",
            "Hungary": "hu",
            "Iceland": "is",
            "Ireland": "ie",
            "Italy": "it",
            "Kosovo": "xk",
            "Latvia": "lv",
            "Lithuania": "lt",
            "Luxembourg": "lu",
            "Macedonia": "mk",
            "North Macedonia": "mk",
            "Moldova": "md",
            "Montenegro": "me",
            "Netherlands": "nl",
            "Norway": "no",
            "Poland": "pl",
            "Portugal": "pt",
            "Romania": "ro",
            "Serbia": "rs",
            "Slovakia": "sk",
            "Slovenia": "si",
            "Spain": "es",
            "Sweden": "se",
            "Switzerland": "ch",
            "Ukraine": "ua",
            "United Kingdom": "gb",
            
            // Oceania
            "Australia": "au",
            "Fiji": "fj",
            "New Caledonia": "nc",
            "New Zealand": "nz",
            "Papua New Guinea": "pg",
            "Solomon Is.": "sb",
            "Solomon Islands": "sb",
            "Vanuatu": "vu",
            
            // Catch-all for Antarctica
            "Antarctica": "aq"
        };
        
        // Extract all countries from the GeoJSON
        const countries = topojson.feature(this.worldData, this.worldData.objects.countries).features;
        
        // For each country in GeoJSON, try to find a matching country key
        countries.forEach(country => {
            if (!country.properties) return;
            
            const countryName = country.properties.name;
            if (!countryName) return;
            
            // First try direct mapping from country name to ISO code
            let countryKey = null;
            if (countryNameMappings[countryName]) {
                countryKey = countryNameMappings[countryName];
            }
            
            // If that fails, try the data service mapping
            if (!countryKey) {
                countryKey = dataService.getCountryKeyFromName(countryName);
            }
            
            // If still no match, try using the numeric ID (used in some datasets)
            if (!countryKey && country.id) {
                // Convert numeric ID to country code for known values
                const idMapping = {
                    '840': 'us',  // USA
                    '826': 'gb',  // UK
                    '250': 'fr',  // France
                    '276': 'de',  // Germany
                    '380': 'it',  // Italy
                    '724': 'es',  // Spain
                    '156': 'cn',  // China
                    '392': 'jp',  // Japan
                    '356': 'in',  // India
                    '643': 'ru',  // Russia
                    '076': 'br',  // Brazil
                    '124': 'ca',  // Canada
                    '036': 'au',  // Australia
                    '410': 'kr',  // South Korea
                    '408': 'kp',  // North Korea
                    '364': 'ir',  // Iran
                    '710': 'za'   // South Africa
                };
                
                if (idMapping[country.id]) {
                    countryKey = idMapping[country.id];
                }
            }
            
            if (countryKey) {
                this.countryFeatureMap.set(country.id, {
                    id: country.id,
                    countryKey: countryKey,
                    name: countryName
                });
                this.log(`Mapped ${countryName} (${country.id}) to ${countryKey}`);
            } else {
                // Only log major countries to reduce console spam
                const majorCountries = ['United States', 'United Kingdom', 'China', 'Russia', 'India', 'Germany', 'France'];
                if (majorCountries.includes(countryName)) {
                    this.log(`Could not map major country: ${countryName} (ID: ${country.id})`);
                }
            }
        });
        
        this.log(`Mapped ${this.countryFeatureMap.size} countries out of ${countries.length}`);
    }
    
    addStarfield() {
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
    }
    
    addLightEffect() {
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
    }
    
    createGlobe() {
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
    }

    enableTransparentMode() {
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
    }

    getCountryColor(d) {
        // Get country code using our mapping function
        const countryCode = this.getCountryCode(d);
        
        // If we don't have a country code, use a default visible color
        if (!countryCode) {
            return '#5da85d'; // Visible green for countries with no mapping
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
            return '#5da85d'; // Default on error
        }
    }
    
    getCountryCode(d) {
        if (!d || !d.id) return null;
        
        // Use our prepared mapping table
        if (this.countryFeatureMap && this.countryFeatureMap.has(d.id)) {
            return this.countryFeatureMap.get(d.id).countryKey;
        }
        
        // Fallback to the old method
        if (d.properties && d.properties.name) {
            return dataService.getCountryKeyFromName(d.properties.name);
        }
        
        return null;
    }
    
    handleMouseOver(event, d) {
        // Highlight the country with visible white stroke
        d3.select(event.currentTarget)
            .attr('stroke', '#ffffff')
            .attr('stroke-width', '1px');
            
        // Get country data
        const countryCode = this.getCountryCode(d);
        const countryData = dataService.getCountryData(countryCode);
        
        // Show tooltip
        if (countryData) {
            let tooltipContent = `<strong>${countryData.countryName}</strong><br>`;
            tooltipContent += `Date: ${dataService.formatDate(countryData.date)}<br>`;
            
            // Add the current displayed metric
            if (dataService.currentColumn) {
                const value = countryData[dataService.currentColumn];
                const formattedValue = dataService.formatNumber(value);
                tooltipContent += `${dataService.currentColumn}: ${formattedValue}<br>`;
            }
            
            this.tooltip
                .style('opacity', 1)
                .html(tooltipContent)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 20) + 'px');
        } else if (countryCode) {
            // If we have a country code but no data
            this.tooltip
                .style('opacity', 1)
                .html(`<strong>${dataService.getCountryName(countryCode)}</strong><br>No data available`)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 20) + 'px');
        } else if (d.properties && d.properties.name) {
            // If we only have the country name
            this.tooltip
                .style('opacity', 1)
                .html(`<strong>${d.properties.name}</strong><br>No data available`)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 20) + 'px');
        }
    }
    
    handleMouseOut(event, d) {
        // Remove highlight unless it's the selected country
        if (!this.selectedCountry || this.selectedCountry !== d.id) {
            d3.select(event.currentTarget)
                .attr('stroke', 'rgba(255,255,255,0.0)')
                .attr('stroke-width', '0.5px');
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
                .attr('stroke', 'rgba(255,255,255,0.0)')
                .attr('stroke-width', '0.5px')
                .classed('selected-country', false);
        }
        
        // Set new selection with visible stroke
        this.selectedCountry = d.id;
        d3.select(event.currentTarget)
            .attr('stroke', '#ffffff')
            .attr('stroke-width', '1.5px')
            .classed('selected-country', true);
            
        // Update the country info panel
        this.updateCountryInfoPanel(countryData);
    }
    
    updateCountryInfoPanel(countryData) {
        const countryNameEl = document.getElementById('countryName');
        const countryStatsEl = document.getElementById('countryStats');
        
        if (countryData) {
            countryNameEl.textContent = countryData.countryName;
            
            // Clear existing stats
            countryStatsEl.innerHTML = '';
            
            // Add all available metrics for this country
            for (const key of dataService.availableColumns[dataService.currentDataset]) {
                if (key in countryData) {
                    const statItem = document.createElement('div');
                    statItem.className = 'stat-item';
                    
                    const statLabel = document.createElement('div');
                    statLabel.className = 'stat-label';
                    statLabel.textContent = key + ':';
                    
                    const statValue = document.createElement('div');
                    statValue.className = 'stat-value';
                    statValue.textContent = dataService.formatNumber(countryData[key]);
                    
                    statItem.appendChild(statLabel);
                    statItem.appendChild(statValue);
                    countryStatsEl.appendChild(statItem);
                }
            }
        } else {
            countryNameEl.textContent = 'Select a country';
            countryStatsEl.innerHTML = `
                <div class="stat-item">
                    <div class="stat-label">Select a country</div>
                    <div class="stat-value">to see stats</div>
                </div>
            `;
        }
    }
    
    updateDataSelector() {
        const dataSelector = document.getElementById('dataSelector');
        dataSelector.innerHTML = ''; // Clear existing options
        
        // Add options based on available columns in current dataset
        const columns = dataService.availableColumns[dataService.currentDataset];
        columns.forEach(column => {
            const option = document.createElement('option');
            option.value = column;
            option.textContent = column;
            dataSelector.appendChild(option);
        });
        
        // Set currently selected column
        if (dataService.currentColumn) {
            dataSelector.value = dataService.currentColumn;
        }
    }
    
    setupDateSlider() {
        const dateSlider = document.getElementById('dateSlider');
        const currentDateEl = document.getElementById('currentDate');
        const prevDateBtn = document.getElementById('prevDateBtn');
        const nextDateBtn = document.getElementById('nextDateBtn');
        
        // Set slider range based on available dates with data
        if (dataService.availableDates && dataService.availableDates.length > 0) {
            dateSlider.min = 0;
            dateSlider.max = dataService.availableDates.length - 1;
            
            // If we have few dates, use them all
            const availableDatesCount = dataService.availableDates.length;
            this.log(`Setting up date slider with ${availableDatesCount} dates`);
            
            // Start at latest useful date
            const latestDateIndex = availableDatesCount > 0 ? availableDatesCount - 1 : 0;
            dateSlider.value = latestDateIndex;
            
            // Set current date to the selected index
            dataService.currentDate = dataService.availableDates[latestDateIndex];
            
            // Update current date display
            currentDateEl.textContent = dataService.formatDate(dataService.currentDate);
        } else {
            // No dates with data
            this.log("No dates with data available");
            currentDateEl.textContent = "No dates with data";
            dateSlider.disabled = true;
            prevDateBtn.disabled = true;
            nextDateBtn.disabled = true;
        }
        
        // Handle slider input - use direct mapping to available dates array
        // Use debouncing to prevent excessive updates when sliding quickly
        let updateTimeout = null;
        
        dateSlider.addEventListener('input', () => {
            const index = parseInt(dateSlider.value);
            // Ensure the index is valid
            if (index >= 0 && index < dataService.availableDates.length) {
                const newDate = dataService.availableDates[index];
                
                // Update date display immediately for responsive feel
                currentDateEl.textContent = dataService.formatDate(newDate);
                
                // Debounce the actual data update
                if (updateTimeout) clearTimeout(updateTimeout);
                updateTimeout = setTimeout(() => {
                    dataService.changeDate(newDate);
                    this.updateGlobeColors();
                    
                    // Update country info if needed
                    if (this.selectedCountry) {
                        const countryEl = document.getElementById(`country-${this.selectedCountry}`);
                        if (countryEl) {
                            const countryCode = countryEl.getAttribute('data-country-code');
                            const countryData = dataService.getCountryData(countryCode);
                            this.updateCountryInfoPanel(countryData);
                        }
                    }
                }, 50); // Small delay to improve performance during sliding
            }
        });
        
        // Previous date button
        prevDateBtn.addEventListener('click', () => {
            const currentIndex = parseInt(dateSlider.value);
            if (currentIndex > 0) {
                dateSlider.value = currentIndex - 1;
                dateSlider.dispatchEvent(new Event('input'));
            }
        });
        
        // Next date button
        nextDateBtn.addEventListener('click', () => {
            const currentIndex = parseInt(dateSlider.value);
            if (currentIndex < dateSlider.max) {
                dateSlider.value = currentIndex + 1;
                dateSlider.dispatchEvent(new Event('input'));
            }
        });
    }
    
    updateGlobeColors() {
        this.log("Updating globe colors");
        
        // Count countries with data before update
        const countryElements = this.globeGroup.selectAll('.country');
        let countriesWithData = 0;
        let totalCountries = 0;
        
        // Update colors for all countries based on current data
        countryElements
            .attr('fill', d => {
                totalCountries++;
                const countryCode = this.getCountryCode(d);
                if (!countryCode) return '#5da85d';
                
                const color = dataService.getCountryColor(countryCode);
                if (color !== '#5da85d') {
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
    }
    
    startAutoRotation() {
        if (!this.autoRotate) return;
        
        // Track rotation speed and apply easing for smoother animation
        let currentSpeed = this.autoRotateSpeed;
        
        const animate = (timestamp) => {
            if (!this.autoRotate) return;
            
            if (!this.lastFrameTime) {
                this.lastFrameTime = timestamp;
            }
            
            const elapsed = timestamp - this.lastFrameTime;
            this.lastFrameTime = timestamp;
            
            // Don't process extremely short frames for smoother animation
            if (elapsed < 5) {
                this.animationFrameId = requestAnimationFrame(animate);
                return;
            }
            
            // Cap elapsed time for consistent animation
            const cappedElapsed = Math.min(elapsed, 33); // Cap at 30fps equivalent
            
            // Rotate the globe
            this.currentRotation[0] += currentSpeed * cappedElapsed / 16;
            this.projection.rotate(this.currentRotation);
            
            // Update path geometry
            this.globeGroup.selectAll('path')
                .attr('d', this.path);
                
            // Apply depth-based rendering for transparent mode
            if (this.projection.clipAngle() > 90) {
                this.renderCountriesByDepth();
            }
            
            this.animationFrameId = requestAnimationFrame(animate);
        };
        
        this.animationFrameId = requestAnimationFrame(animate);
    }
    
    stopAutoRotation() {
        this.autoRotate = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    
    dragstarted(event) {
        this.stopAutoRotation();
        this.drag.initialRotation = [...this.currentRotation];
        this.drag.startPos = [event.x, event.y];
    }
    
    dragged(event) {
        if (!this.drag.initialRotation) this.drag.initialRotation = [...this.currentRotation];
        
        const dx = event.x - this.drag.startPos[0];
        const dy = event.y - this.drag.startPos[1];
        
        this.currentRotation[0] = this.drag.initialRotation[0] + dx / this.sensitivity;
        this.currentRotation[1] = Math.max(-90, Math.min(90, this.drag.initialRotation[1] - dy / this.sensitivity));
        
        this.projection.rotate(this.currentRotation);
        
        requestAnimationFrame(() => {
            this.globeGroup.selectAll('path')
                .attr('d', this.path);
                
            // If we're in transparent mode, update the depth-based rendering
            if (this.projection.clipAngle() > 90) {
                this.renderCountriesByDepth();
            } else {
                // In standard mode, maintain full opacity and interactivity
                this.globeGroup.selectAll('.country')
                    .attr('fill-opacity', 1.0)
                    .style('pointer-events', 'auto');
            }
        });
    }
    
    dragended(event) {
        this.drag.initialRotation = undefined;
        this.drag.startPos = undefined;
    }
    
    zoomed(event) {
        this.stopAutoRotation();
        
        const scale = event.transform.k;
        const adjustedRadius = this.radius * scale;
        
        this.projection.scale(adjustedRadius);
        
        this.globeGroup.selectAll('path')
            .attr('d', this.path);
            
        this.globeGroup.select('.ocean')
            .attr('r', adjustedRadius)
            .attr('stroke-width', (0.5 / scale) + 'px');
            
        this.globeGroup.select('.ocean-depth')
            .attr('r', adjustedRadius);
            
        this.svg.select('.globe-backdrop')
            .attr('r', adjustedRadius + 5);
            
        this.globeGroup.selectAll('.country')
            .attr('stroke-width', (0.5 / scale) + 'px');
            
        // If there's a selected country, make sure its stroke is thicker and visible
        if (this.selectedCountry) {
            d3.select(`#country-${this.selectedCountry}`)
                .attr('stroke', '#ffffff')
                .attr('stroke-width', (1.5 / scale) + 'px');
        }
        
        this.globeGroup.select('.graticule')
            .attr('stroke-width', (0.5 / scale) + 'px');
    }
    
    resetView() {
        this.stopAutoRotation();
        
        const targetRotation = [0, 0, 0];
        this.lastFrameTime = 0;
        
        // Pre-load computation for rendering efficiency
        const startRotation = this.projection.rotate();
        
        // Use a custom easing function for smoother rotation
        const customEasing = t => {
            // Ease in-out cubic for smoother feel
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        };
        
        let startTime = null;
        const duration = 1000;
        
        // Use requestAnimationFrame for smoother animation than D3 transitions
        const animateReset = (timestamp) => {
            if (startTime === null) startTime = timestamp;
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = customEasing(progress);
            
            // Interpolate rotation
            const newRotation = startRotation.map((start, i) => {
                // Find the shortest path for rotation (handle 360 degree wrapping)
                let end = targetRotation[i];
                let diff = end - start;
                
                // Handle wrapping around 360 degrees
                if (diff > 180) diff -= 360;
                if (diff < -180) diff += 360;
                
                return start + diff * easedProgress;
            });
            
            // Apply rotation
            this.projection.rotate(newRotation);
            this.currentRotation = [...newRotation];
            
            // Update paths
            this.globeGroup.selectAll('path').attr('d', this.path);
            
            // Update depth-based rendering
            if (this.projection.clipAngle() > 90) {
                this.renderCountriesByDepth();
            }
            
            // Continue animation or end
            if (progress < 1) {
                requestAnimationFrame(animateReset);
            } else {
                // Reset complete, start auto rotation
                this.projection.rotate([0, 0, 0]);
                this.currentRotation = [0, 0, 0];
                
                setTimeout(() => {
                    this.autoRotate = true;
                    this.startAutoRotation();
                }, 20);
            }
        };
        
        requestAnimationFrame(animateReset);
        
        // Reset zoom level
        this.svg.transition()
            .duration(750)
            .call(this.zoom.transform, d3.zoomIdentity);
    }
    
    // Add new method to create a transparent ocean
    createTransparentOcean() {
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
            .attr('stroke-width', '0.5px');
        
        // Remove the depth gradient since we want to see through the globe
        this.svg.select('#ocean-depth').remove();
        
        // Remove the ocean-depth circle if it exists
        this.globeGroup.select('.ocean-depth').remove();
    }
    
    setupEventListeners() {
        // Handle data type selector change
        document.getElementById('dataSelector').addEventListener('change', (event) => {
            dataService.changeColumn(event.target.value);
            this.updateGlobeColors();
        });
        
        // Handle reset button click
        document.getElementById('resetBtn').addEventListener('click', () => {
            this.resetView();
        });
        
        // Handle wheel event for stopping rotation when zooming
        this.svg.on('wheel', () => {
            this.stopAutoRotation();
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.resize();
        });
    }
    
    changeDataset(dataset) {
        // Update the dataset indicator in the UI
        const datasetDisplayNames = {
            'epidem': 'Epidemiology',
            'hospitalizations': 'Hospitalizations',
            'vaccinations': 'Vaccinations'
        };
        
        const currentDatasetEl = document.getElementById('currentDataset');
        if (currentDatasetEl) {
            currentDatasetEl.textContent = datasetDisplayNames[dataset] || dataset;
        }
        
        // Change dataset in data service
        const result = dataService.changeDataset(dataset);
        
        // Update data selector with new columns
        this.updateDataSelector();
        
        // Update globe colors
        this.updateGlobeColors();
        
        // Update the background color based on the dataset
        this.updateBackgroundColor(dataset);
        
        // If a country is selected, update its info
        if (this.selectedCountry) {
            const countryEl = document.getElementById(`country-${this.selectedCountry}`);
            if (countryEl) {
                const countryCode = countryEl.getAttribute('data-country-code');
                const countryData = dataService.getCountryData(countryCode);
                this.updateCountryInfoPanel(countryData);
            }
        }
    }
    
    // Add a new method to update the background color based on dataset
    updateBackgroundColor(dataset) {
        // Define color gradients for each dataset
        const backgroundGradients = {
            'epidem': 'radial-gradient(#4a0000, #000)',         // Red theme for epidemiology
            'hospitalizations': 'radial-gradient(#1a315a, #000)', // Blue theme for hospitalizations
            'vaccinations': 'radial-gradient(#004d40, #000)'      // Green theme for vaccinations
        };
        
        // Get the background gradient for the selected dataset
        const backgroundGradient = backgroundGradients[dataset] || backgroundGradients['epidem'];
        
        // Apply the background gradient to the body
        document.body.style.background = backgroundGradient;
        
        // Update the reset button color to match the dataset theme
        this.updateResetButtonColor(dataset);
        
        this.log(`Background updated for dataset: ${dataset}`);
    }
    
    // New method to update the reset button color based on dataset
    updateResetButtonColor(dataset) {
        const resetBtn = document.getElementById('resetBtn');
        if (!resetBtn) return;
        
        // Define colors for each dataset
        const buttonColors = {
            'epidem': '#8b0000',         // Dark red for epidemiology
            'hospitalizations': '#1a315a', // Dark blue for hospitalizations
            'vaccinations': '#004d40'      // Dark green for vaccinations
        };
        
        // Get the button color for the selected dataset
        const buttonColor = buttonColors[dataset] || buttonColors['epidem'];
        
        // Apply the color to the reset button
        resetBtn.style.backgroundColor = buttonColor;
        
        // Define hover colors (slightly lighter versions)
        const hoverColors = {
            'epidem': '#a00000',         // Lighter red for hover
            'hospitalizations': '#2a4570', // Lighter blue for hover
            'vaccinations': '#00695c'      // Lighter green for hover
        };
        
        // Get the hover color for the selected dataset
        const hoverColor = hoverColors[dataset] || hoverColors['epidem'];
        
        // Apply the hover effect using CSS
        const styleId = 'reset-button-style';
        let styleEl = document.getElementById(styleId);
        
        // Remove existing style element if it exists
        if (styleEl) {
            styleEl.remove();
        }
        
        // Create new style element with updated hover color
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = `
            #resetBtn:hover {
                background-color: ${hoverColor} !important;
            }
        `;
        
        // Add the style element to the document head
        document.head.appendChild(styleEl);
        
        this.log(`Reset button color updated for dataset: ${dataset}`);
    }
    
    resize() {
        // Handle window resize - adjust dimensions and redraw
        this.width = window.innerWidth < 800 ? window.innerWidth - 40 : 780;
        this.svg.attr('width', this.width)
            .attr('viewBox', `0 0 ${this.width} ${this.height}`);
            
        this.globeGroup.attr('transform', `translate(${this.width / 2 + 30}, ${this.height / 2 - 50})`); // Subtract 50px to move up
    }
    
    // Add method to render countries based on their depth in transparent mode - optimized version
    renderCountriesByDepth() {
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
    }
}

// Initialize the globe visualization when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const globe = new GlobeVis();
});
