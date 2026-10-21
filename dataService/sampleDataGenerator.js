// Fixed, deterministic fictional observations; never imply a current live feed.
const START = Date.UTC(2020, 0, 1);
const END = Date.UTC(2022, 11, 31);
const DAY = 86_400_000;

export function generateSampleCountryIndex() {
    return [
        ['us', 'United States'], ['gb', 'United Kingdom'], ['fr', 'France'], ['de', 'Germany'],
        ['it', 'Italy'], ['es', 'Spain'], ['jp', 'Japan'], ['cn', 'China'], ['in', 'India'],
        ['br', 'Brazil'], ['ca', 'Canada'], ['au', 'Australia'], ['ru', 'Russia'],
        ['kr', 'South Korea'], ['za', 'South Africa'], ['mx', 'Mexico'], ['se', 'Sweden'],
        ['no', 'Norway'], ['fi', 'Finland'], ['dk', 'Denmark'], ['pl', 'Poland'],
        ['nl', 'Netherlands'], ['be', 'Belgium'], ['ch', 'Switzerland'], ['at', 'Austria'],
        ['pt', 'Portugal'], ['gr', 'Greece'], ['ie', 'Ireland'], ['nz', 'New Zealand'],
        ['sg', 'Singapore'], ['tn', 'Tunisia']
    ].map(([location_key, country_name]) => ({ location_key, country_name }));
}

/** Deliberately fictional denominators, never estimates of actual national populations. */
export function generateSampleDemographicsData() {
    return this.generateSampleCountryIndex().map(({ location_key }, index) => ({
        location_key, population: 8_000_000 + ((index * 17 + 11) % 73) * 1_000_000
    }));
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
    if (!['epidem', 'hospitalizations', 'vaccinations'].includes(datasetType)) {
        throw new RangeError(`Unknown sample dataset: ${datasetType}`);
    }
    const records = [];
    for (const [countryIndex, country] of this.generateSampleCountryIndex().entries()) {
        // Reproducible variation, separate from the wall clock and Math.random().
        const weight = 0.3 + ((countryIndex * 13 + 7) % 31) / 12;
        const offset = countryIndex % 35;
        let confirmed = 0, deceased = 0, hospitalized = 0, vaccinated = 0, fullyVaccinated = 0;
        let doses = 0;
        const firstDoses = [];
        for (let time = START, day = 0; time <= END; time += DAY, day++) {
            const gaussian = (peak, width, height) => height * Math.exp(-0.5 * ((day - peak - offset) / width) ** 2);
            const wave = gaussian(100, 28, 220) + gaussian(325, 50, 650) +
                gaussian(570, 45, 800) + gaussian(760, 35, 1800) + gaussian(950, 60, 400);
            const dailyConfirmed = Math.max(0, Math.round(weight * wave * (0.9 + 0.1 * Math.sin(day * 1.7 + countryIndex))));
            const dailyDeceased = Math.round(dailyConfirmed * (day < 366 ? 0.02 : 0.008));
            const dailyHospitalized = Math.round(dailyConfirmed * 0.06);
            confirmed += dailyConfirmed;
            deceased += dailyDeceased;
            hospitalized += dailyHospitalized;
            // First doses start in December 2020; full vaccination follows by 28 days.
            const dailyVaccinated = day < 335 ? 0 : Math.round(weight * (
                gaussian(495, 70, 3500) + gaussian(660, 90, 1800) + gaussian(880, 100, 300)));
            firstDoses.push(dailyVaccinated);
            const dailyFullyVaccinated = day >= 28 ? Math.floor(firstDoses[day - 28] * 0.88) : 0;
            vaccinated += dailyVaccinated;
            fullyVaccinated += dailyFullyVaccinated;
            doses += dailyVaccinated + dailyFullyVaccinated;
            const metrics = datasetType === 'epidem' ? {
                new_confirmed: dailyConfirmed, new_deceased: dailyDeceased,
                cumulative_confirmed: confirmed, cumulative_deceased: deceased
            } : datasetType === 'hospitalizations' ? {
                new_hospitalized_patients: dailyHospitalized,
                current_hospitalized_patients: dailyHospitalized * 7,
                current_intensive_care_patients: Math.round(dailyHospitalized * 1.4),
                cumulative_hospitalized_patients: hospitalized
            } : {
                new_persons_vaccinated: dailyVaccinated,
                new_persons_fully_vaccinated: dailyFullyVaccinated,
                new_vaccine_doses_administered: dailyVaccinated + dailyFullyVaccinated,
                cumulative_persons_vaccinated: vaccinated,
                cumulative_persons_fully_vaccinated: fullyVaccinated,
                cumulative_vaccine_doses_administered: doses
            };
            records.push({ country_key: country.location_key, date: new Date(time).toISOString().slice(0, 10), ...metrics });
        }
    }
    return records;
}
