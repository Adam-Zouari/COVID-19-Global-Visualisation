// Data query functionality

export function getDataForDate(datasetName, date) {
    if (datasetName === 'epidem') {
        return this.epidemData.filter(d => d.date === date);
    } else if (datasetName === 'hospitalizations') {
        return this.hospitalizationsData.filter(d => d.date === date);
    } else if (datasetName === 'vaccinations') {
        return this.vaccinationsData.filter(d => d.date === date);
    }
    return [];
}

export function getCountryData(countryKey) {
    if (!countryKey) return null;

    // Check in the indexed data first for better performance
    const normalizedKey = countryKey.toLowerCase();
    const datasetName = this.currentDataset;

    if (
        this.indexedData[datasetName] &&
        this.indexedData[datasetName][normalizedKey] &&
        this.indexedData[datasetName][normalizedKey][this.currentDate]
    ) {
        const countryData = this.indexedData[datasetName][normalizedKey][this.currentDate];
        return {
            countryKey,
            countryName: this.getCountryName(countryKey),
            date: this.currentDate,
            ...countryData
        };
    }

    // If not found for current date, try to find closest date
    if (this.indexedData[datasetName] && this.indexedData[datasetName][normalizedKey]) {
        const availableDates = Object.keys(this.indexedData[datasetName][normalizedKey]).sort();

        if (availableDates.length > 0) {
            // Find closest date
            availableDates.sort((a, b) => {
                const dateA = new Date(a);
                const dateB = new Date(b);
                return Math.abs(dateA - new Date(this.currentDate)) -
                       Math.abs(dateB - new Date(this.currentDate));
            });

            const closestDate = availableDates[0];
            const countryData = this.indexedData[datasetName][normalizedKey][closestDate];

            this.log(`Using closest date ${closestDate} for ${countryKey}`);

            return {
                countryKey,
                countryName: this.getCountryName(countryKey),
                date: closestDate,
                ...countryData
            };
        }
    }

    // If still not found, return null
    return null;
}

export function getCurrentDataset() {
    if (this.currentDataset === 'epidem') {
        return this.epidemData;
    } else if (this.currentDataset === 'hospitalizations') {
        return this.hospitalizationsData;
    } else if (this.currentDataset === 'vaccinations') {
        return this.vaccinationsData;
    }
    return null;
}

export function getAllCountriesDataForCurrentDate() {
    const dataset = this.getCurrentDataset();
    if (!dataset) return [];

    return dataset.filter(d => d.date === this.currentDate);
}

export function getDataValue(countryKey) {
    const countryData = this.getCountryData(countryKey);
    if (!countryData || !this.currentColumn) return 0;

    const value = countryData[this.currentColumn];
    return value ? parseFloat(value) : 0;
}
