export function getCountryName(countryKey) {
    if (typeof countryKey !== 'string' || !countryKey.trim()) return 'Unknown';
    return this.countryNameMap[countryKey.trim().toLowerCase()] || countryKey;
}

export function getCountryKeyFromName(countryName) {
    if (typeof countryName !== 'string') return null;
    return this.countryCodeMap[countryName.toLowerCase().trim()] || null;
}

export function getAllCountries() {
    return this.countryIndex.map(country => ({
        countryCode: country.location_key,
        countryName: country.country_name
    }));
}
