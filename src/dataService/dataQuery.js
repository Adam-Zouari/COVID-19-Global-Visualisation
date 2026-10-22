import { numericValue } from './utils.js';

export function getDataForDate(datasetName, date) {
    return this.dataByDate[datasetName]?.[date] || [];
}

export function getCountryData(countryKey) {
    if (typeof countryKey !== 'string') return null;
    const key = countryKey.trim().toLowerCase();
    // Comparing countries requires the same reporting date. Never substitute future/past records.
    const record = this.indexedData[this.currentDataset]?.[key]?.[this.currentDate];
    return record ? { ...record, countryKey: key, countryName: this.getCountryName(key) } : null;
}

export function getDataValue(countryKey) {
    const record = this.getCountryData(countryKey);
    return record && this.currentColumn ? numericValue(record[this.currentColumn]) : null;
}
