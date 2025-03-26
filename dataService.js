class DataService {
    constructor() {
        this.baseUrl = 'https://disease.sh/v3/covid-19';
        this.countriesData = null;
        this.worldData = null;
    }

    async fetchAllData() {
        try {
            // Fetch all country data
            const countriesResponse = await fetch(`${this.baseUrl}/countries`);
            this.countriesData = await countriesResponse.json();
            
            // Fetch global data
            const worldResponse = await fetch(`${this.baseUrl}/all`);
            this.worldData = await worldResponse.json();
            
            return {
                countries: this.countriesData,
                world: this.worldData
            };
        } catch (error) {
            console.error('Error fetching COVID-19 data:', error);
            throw error;
        }
    }
    
    getCountryData(countryCode) {
        if (!this.countriesData) {
            return null;
        }
        return this.countriesData.find(country => 
            country.countryInfo.iso2 === countryCode || 
            country.countryInfo.iso3 === countryCode);
    }
    
    getWorldData() {
        return this.worldData;
    }
    
    getDataByType(countryData, dataType) {
        if (!countryData) return 0;
        
        switch(dataType) {
            case 'cases':
                return countryData.cases;
            case 'deaths':
                return countryData.deaths;
            case 'recovered':
                return countryData.recovered;
            case 'active':
                return countryData.active;
            default:
                return countryData.cases;
        }
    }
    
    // Get color scale for a given data type
    getColorScale(dataType) {
        if (!this.countriesData) return d3.scaleSequential(d3.interpolateBlues).domain([0, 100]);
        
        const values = this.countriesData.map(country => this.getDataByType(country, dataType));
        const max = d3.max(values);
        
        // Use different color scales that blend better with Earth-like terrain
        switch(dataType) {
            case 'cases':
                return d3.scaleSequential()
                    .domain([0, max])
                    .interpolator(d => {
                        // Base green to orange-red gradient that starts from Earth terrain color
                        const t = d * 0.8; // Scale down to keep some green
                        return d3.interpolateRgb('#3c7521', '#FF4500')(t);
                    });
            case 'deaths':
                return d3.scaleSequential()
                    .domain([0, max])
                    .interpolator(d => {
                        // Base green to dark-red gradient
                        return d3.interpolateRgb('#3c7521', '#8B0000')(d * 0.9);
                    });
            case 'recovered':
                return d3.scaleSequential()
                    .domain([0, max])
                    .interpolator(d => {
                        // Base green to bright green gradient
                        return d3.interpolateRgb('#3c7521', '#00FF00')(d * 0.7);
                    });
            case 'active':
                return d3.scaleSequential()
                    .domain([0, max])
                    .interpolator(d => {
                        // Base green to yellow gradient
                        return d3.interpolateRgb('#3c7521', '#FFD700')(d * 0.8);
                    });
            default:
                return d3.scaleSequential()
                    .domain([0, max])
                    .interpolator(d => d3.interpolateRgb('#3c7521', '#FF4500')(d * 0.8));
        }
    }
    
    formatNumber(num) {
        if (num === undefined || num === null) return '-';
        return num.toLocaleString();
    }
}

// Initialize the data service
const dataService = new DataService();
