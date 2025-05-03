// Globe Country-related Methods
GlobeVis.prototype.buildCountryFeatureMap = function() {
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
};

GlobeVis.prototype.getCountryCode = function(d) {
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
};

GlobeVis.prototype.getCountryFeatureByCode = function(countryCode) {
    if (!this.worldData) return null;

    const countryFeatures = topojson.feature(this.worldData, this.worldData.objects.countries).features;

    // Find the country feature with matching code
    for (const feature of countryFeatures) {
        const featureCode = this.getCountryCode(feature);
        if (featureCode && featureCode.toLowerCase() === countryCode.toLowerCase()) {
            return feature;
        }
    }

    return null;
};

GlobeVis.prototype.goToCountry = function(countryCode) {
    this.log(`Going to country: ${countryCode}`);

    // Stop auto-rotation
    this.stopAutoRotation();

    // Get the country feature
    const countryFeature = this.getCountryFeatureByCode(countryCode);

    if (countryFeature) {
        // Calculate the centroid of the country
        const centroid = d3.geoCentroid(countryFeature);

        // Set target rotation to center on the country
        // Note that we invert longitude (x) for proper rotation
        const targetRotation = [-centroid[0], -centroid[1], 0];

        // Animate the rotation to the country
        this.animateToRotation(targetRotation, () => {
            // After reaching the country, select it and show its data
            const countryCode = this.getCountryCode(countryFeature);
            const countryData = dataService.getCountryData(countryCode);

            // Reset previous selection if any
            if (this.selectedCountry) {
                d3.select(`#country-${this.selectedCountry}`)
                    .attr('stroke', 'rgba(255,255,255,0.0)')
                    .attr('stroke-width', '0.5px')
                    .classed('selected-country', false);
            }

            // Select the new country
            this.selectedCountry = countryFeature.id;

            // Find the country element and apply selection styling
            const countryElement = d3.select(`#country-${countryFeature.id}`);
            countryElement
                .attr('stroke', '#ffffff')
                .attr('stroke-width', '1.5px')
                .classed('selected-country', true);

            // Update the country info panel with the data
            this.updateCountryInfoPanel(countryData);
        });
    } else {
        this.log(`Country not found: ${countryCode}`);
    }
};
