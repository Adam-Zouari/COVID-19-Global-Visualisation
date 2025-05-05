// Country management functionality

export function getCountryName(countryKey) {
    if (!countryKey) return 'Unknown';
    if (!this.countryNameMap) return countryKey;

    return this.countryNameMap[countryKey.toLowerCase()] || countryKey;
}

export function getCountryKeyFromName(countryName) {
    if (!countryName) return null;
    if (!this.countryCodeMap) return null;

    const normalizedName = countryName.toLowerCase().trim();
    return this.countryCodeMap[normalizedName] || null;
}
