// Sample data generation functionality

export function generateSampleCountryIndex() {
    const countries = [
        { location_key: 'us', country_name: 'United States' },
        { location_key: 'gb', country_name: 'United Kingdom' },
        { location_key: 'fr', country_name: 'France' },
        { location_key: 'de', country_name: 'Germany' },
        { location_key: 'it', country_name: 'Italy' },
        { location_key: 'es', country_name: 'Spain' },
        { location_key: 'jp', country_name: 'Japan' },
        { location_key: 'cn', country_name: 'China' },
        { location_key: 'in', country_name: 'India' },
        { location_key: 'br', country_name: 'Brazil' },
        { location_key: 'ca', country_name: 'Canada' },
        { location_key: 'au', country_name: 'Australia' },
        { location_key: 'ru', country_name: 'Russia' },
        { location_key: 'kr', country_name: 'South Korea' },
        { location_key: 'za', country_name: 'South Africa' },
        { location_key: 'mx', country_name: 'Mexico' },
        { location_key: 'se', country_name: 'Sweden' },
        { location_key: 'no', country_name: 'Norway' },
        { location_key: 'fi', country_name: 'Finland' },
        { location_key: 'dk', country_name: 'Denmark' },
        { location_key: 'pl', country_name: 'Poland' },
        { location_key: 'nl', country_name: 'Netherlands' },
        { location_key: 'be', country_name: 'Belgium' },
        { location_key: 'ch', country_name: 'Switzerland' },
        { location_key: 'at', country_name: 'Austria' },
        { location_key: 'pt', country_name: 'Portugal' },
        { location_key: 'gr', country_name: 'Greece' },
        { location_key: 'ie', country_name: 'Ireland' },
        { location_key: 'nz', country_name: 'New Zealand' },
        { location_key: 'sg', country_name: 'Singapore' }
    ];

    return countries;
}

export function generateSampleEpidemData() {
    return this.generateSampleDataset('epidem');
}

export function generateSampleHospitalizationsData() {
    return this.generateSampleDataset('hospitalizations');
}

export function generateSampleVaccinationsData() {
    return this.generateSampleDataset('vaccinations');
}

export function generateSampleDataset(datasetType) {
    const data = [];
    const countries = this.generateSampleCountryIndex();

    // Generate data for the last 30 days
    const today = new Date();
    const dates = [];
    for (let i = 30; i >= 0; i--) {
        const date = new Date();
        date.setDate(today.getDate() - i);
        const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD format
        dates.push(dateString);
    }

    // Define columns based on dataset type
    let columns = {};
    if (datasetType === 'epidem') {
        columns = {
            new_confirmed: (country, date, index) => Math.floor(Math.random() * 10000 * (1 + Math.sin(index/3))),
            new_deceased: (country, date, index) => Math.floor(Math.random() * 500 * (1 + Math.sin(index/3))),
            cumulative_confirmed: (country, date, index) => Math.floor(100000 + Math.random() * 1000000 * (index/30)),
            cumulative_deceased: (country, date, index) => Math.floor(1000 + Math.random() * 50000 * (index/30))
        };
    } else if (datasetType === 'hospitalizations') {
        columns = {
            new_hospitalized: (country, date, index) => Math.floor(Math.random() * 1000 * (1 + Math.sin(index/3))),
            current_hospitalized: (country, date, index) => Math.floor(Math.random() * 10000 * (1 + Math.sin(index/5))),
            current_intensive_care: (country, date, index) => Math.floor(Math.random() * 1000 * (1 + Math.sin(index/4)))
        };
    } else if (datasetType === 'vaccinations') {
        columns = {
            new_persons_vaccinated: (country, date, index) => Math.floor(Math.random() * 100000 * (1 + Math.sin(index/3))),
            cumulative_persons_vaccinated: (country, date, index) => Math.floor(1000000 * index/30 * (1 + Math.random()*0.5)),
            cumulative_persons_fully_vaccinated: (country, date, index) => Math.floor(800000 * index/30 * (1 + Math.random()*0.5)),
            cumulative_vaccine_doses_administered: (country, date, index) => Math.floor(2000000 * index/30 * (1 + Math.random()*0.5))
        };
    }

    // Generate data for each country and date
    countries.forEach(country => {
        dates.forEach((date, dateIndex) => {
            const record = {
                country_key: country.location_key,
                date: date
            };

            // Add values for each column
            Object.keys(columns).forEach(column => {
                record[column] = columns[column](country.location_key, date, dateIndex);
            });

            data.push(record);
        });
    });

    return data;
}
