/** Shared semantic rules for source observations and their display transformations. */
const definitions = {
    new_confirmed: ['New confirmed cases', 'epidem', 'daily'],
    new_deceased: ['New reported deaths', 'epidem', 'daily'],
    new_recovered: ['New reported recoveries', 'epidem', 'daily'],
    new_tested: ['New tests', 'epidem', 'daily'],
    cumulative_confirmed: ['Cumulative confirmed cases', 'epidem', 'cumulative'],
    cumulative_deceased: ['Cumulative reported deaths', 'epidem', 'cumulative'],
    cumulative_recovered: ['Cumulative reported recoveries', 'epidem', 'cumulative'],
    cumulative_tested: ['Cumulative tests', 'epidem', 'cumulative'],
    new_hospitalized_patients: ['New hospital admissions', 'hospitalizations', 'daily'],
    current_hospitalized_patients: ['Currently hospitalized patients', 'hospitalizations', 'occupancy'],
    cumulative_hospitalized_patients: ['Cumulative hospital admissions', 'hospitalizations', 'cumulative'],
    new_intensive_care_patients: ['New ICU admissions', 'hospitalizations', 'daily'],
    current_intensive_care_patients: ['Current ICU patients', 'hospitalizations', 'occupancy'],
    cumulative_intensive_care_patients: ['Cumulative ICU admissions', 'hospitalizations', 'cumulative'],
    new_ventilator_patients: ['New patients receiving ventilation', 'hospitalizations', 'daily'],
    current_ventilator_patients: ['Current patients receiving ventilation', 'hospitalizations', 'occupancy'],
    cumulative_ventilator_patients: ['Cumulative patients receiving ventilation', 'hospitalizations', 'cumulative'],
    new_persons_vaccinated: ['Newly vaccinated people', 'vaccinations', 'daily'],
    new_persons_fully_vaccinated: ['Newly fully vaccinated people', 'vaccinations', 'daily'],
    new_vaccine_doses_administered: ['New vaccine doses administered', 'vaccinations', 'daily'],
    cumulative_persons_vaccinated: ['People vaccinated at least once', 'vaccinations', 'cumulative'],
    cumulative_persons_fully_vaccinated: ['People fully vaccinated', 'vaccinations', 'cumulative'],
    cumulative_vaccine_doses_administered: ['Cumulative vaccine doses administered', 'vaccinations', 'cumulative']
};

function metadata(column, label, dataset, kind) {
    const coverage = kind === 'cumulative' && /persons_(fully_)?vaccinated/.test(column);
    const allowedUnits = Object.freeze(['count', /vaccine_doses/.test(column) ? 'per100' : coverage ? 'percent' : 'per100k']);
    return Object.freeze({ column, label, dataset, category: dataset === 'epidem' ? 'epidemiology' : dataset,
        kind, allowedUnits, smoothingAllowed: kind === 'daily',
        description: kind === 'daily' ? 'Reported additions on this date. Negative values indicate reporting corrections.' :
            kind === 'occupancy' ? 'Patients in care on this date, measured as a snapshot.' :
                'The source cumulative total reported on this date, preserved independently of daily observations.' });
}

export const METRICS = Object.freeze(Object.fromEntries(Object.entries(definitions).map(
    ([column, [label, dataset, kind]]) => [column, metadata(column, label, dataset, kind)])));

/** Google also publishes brand-specific vaccination columns; retain their semantics. */
export function getMetricMetadata(column = this?.currentColumn) {
    if (!column || typeof column !== 'string') return null;
    if (Object.hasOwn(METRICS, column)) return METRICS[column];
    const kind = column.startsWith('new_') ? 'daily' : column.startsWith('current_') ? 'occupancy' : 'cumulative';
    const dataset = /vaccin/.test(column) ? 'vaccinations' : /hospital|intensive_care|ventilator/.test(column) ? 'hospitalizations' : 'epidem';
    const canonical = column.replace(/^total_/, 'cumulative_');
    const base = Object.keys(METRICS).find(key => canonical.startsWith(`${key}_`));
    const label = base ? `${METRICS[base].label} · ${canonical.slice(base.length + 1).replaceAll('_', ' ').replace(/^./, character => character.toUpperCase())}` :
        column.replaceAll('_', ' ').replace(/^./, character => character.toUpperCase());
    return metadata(column, label, dataset, kind);
}

export function getUnitLabel(column = this?.currentColumn, unit = this?.displayUnit || 'count') {
    return ({ count: 'Count', per100k: 'Per 100,000 people', percent: '% of population', per100: 'Doses per 100 people' })[unit] || 'Count';
}
