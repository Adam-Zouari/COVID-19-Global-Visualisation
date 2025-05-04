// Extension for DataService class to add missing methods

// Add the getAllCountries method to the DataService prototype
DataService.prototype.getAllCountries = function() {
    console.log("getAllCountries called");
    
    // If countryIndex is not loaded yet, return empty array
    if (!this.countryIndex || !this.countryIndex.length) {
        console.error("Country index not loaded yet");
        return [];
    }
    
    // Return an array of country objects with countryCode and countryName
    const countries = this.countryIndex.map(country => {
        return {
            countryCode: country.location_key,
            countryName: country.country_name
        };
    });
    
    console.log(`Returning ${countries.length} countries`);
    return countries;
};
