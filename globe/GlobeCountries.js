// Names in the bundled world-atlas geometry, including aliases used by sources.
const GLOBE_COUNTRY_CODES = {
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
    "South Africa": "za",
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

GlobeVis.prototype.buildCountryFeatureMap = function() {
    if (!this.worldData) return;
    this.countryFeatureMap = new Map();

    // Convert geometry once; uploaded data can still change the name lookup.
    if (!this.countryFeatures.length) {
        this.countryFeatures = topojson.feature(this.worldData, this.worldData.objects.countries).features;
        const usedIds = new Set();
        this.countryFeatures.forEach((feature, index) => {
            // Disputed regions in world-atlas lack numeric IDs. Give each one
            // a stable local key so joins, DOM IDs and country lookup stay unique.
            const original = feature.id;
            if (original === undefined || original === null || usedIds.has(String(original))) {
                feature.id = `region-${index}`;
            }
            usedIds.add(String(feature.id));
        });
    }
    const countries = this.countryFeatures;
    this.featuresByCode = new Map();

    // For each country in GeoJSON, try to find a matching country key
    countries.forEach(country => {
        if (!country.properties) return;

        const countryName = country.properties.name;
        if (!countryName) return;

        const countryKey = Object.hasOwn(GLOBE_COUNTRY_CODES, countryName) ? GLOBE_COUNTRY_CODES[countryName] :
            this.dataService.getCountryKeyFromName(countryName)?.toLowerCase();

        if (countryKey) {
            this.countryFeatureMap.set(String(country.id), countryKey);
            const previous = this.featuresByCode.get(countryKey);
            // Several map features can share a country code (for example Cyprus).
            // Center search results on the main feature instead of a small region.
            if (!previous || d3.geoArea(country) > d3.geoArea(previous)) {
                this.featuresByCode.set(countryKey, country);
            }
        }
    });
};

GlobeVis.prototype.getCountryCode = function(feature) {
    return feature ? this.countryFeatureMap?.get(String(feature.id)) || null : null;
};

GlobeVis.prototype.getCountryFeatureByCode = function(countryCode) {
    if (typeof countryCode !== 'string') return null;
    return this.featuresByCode?.get(countryCode.toLowerCase()) || null;
};

GlobeVis.prototype.goToCountry = function(countryCode) {
    const countryFeature = this.getCountryFeatureByCode(countryCode);

    if (countryFeature) {
        this.stopAutoRotation();
        // Selection is immediate; navigation must survive a cancelled rotation
        // (for example, when Compare is opened before the animation finishes).
        this.selectCountry(countryFeature);
        const centroid = d3.geoCentroid(countryFeature);
        const targetRotation = [-centroid[0], -centroid[1], 0];
        this.animateToRotation(targetRotation);
    } else {
        // Small countries and territories can be absent from the 110m map.
        // Keep their statistics and charts accessible through country search.
        const normalized = typeof countryCode === 'string' ? countryCode.toLowerCase() : '';
        if (!normalized || !this.dataService.getAllCountries().some(country => country.countryCode.toLowerCase() === normalized)) return;
        this.stopAutoRotation();
        this.cancelRotationAnimation();
        this.clearCountrySelection({ notify: false });
        this.selectedCountryCode = normalized;
        this.refreshSelectedCountry();
        this.dispatchStateEvent('country-selected');
    }
};
