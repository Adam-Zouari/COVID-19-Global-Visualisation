export function isValidDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/** Blank/unreported values are missing; zero and negative corrections are valid. */
export function numericValue(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export const COUNTRY_IDENTIFIER_FIELDS = Object.freeze(['location_key', 'key', 'country_key', 'country_code', 'iso_code']);

export function countryKey(row) {
    for (const field of COUNTRY_IDENTIFIER_FIELDS) {
        const key = String(row[field] ?? '').trim();
        if (key) return key.toLowerCase();
    }
    return '';
}

/** Source national rows can contain whitespace-only optional region fields. */
export function isCountryRow(row, key = countryKey(row)) {
    return /^[a-z]{2}$/.test(key) &&
        (!String(row.aggregation_level ?? '').trim() || Number(row.aggregation_level) === 0) &&
        !String(row.subregion1_code ?? '').trim() && !String(row.subregion2_code ?? '').trim();
}

// Archive policy: observations predating the first COVID-19 outbreak month are excluded.
export const MIN_OBSERVATION_DATE = '2019-12-01';

export function formatDate(dateString) {
    if (!isValidDate(dateString)) return '';
    return new Date(`${dateString}T00:00:00Z`).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'
    });
}

export function formatNumber(value) {
    const number = numericValue(value);
    return number === null ? '—' : number.toLocaleString('en-US');
}

export function setStatus(message) {
    if (typeof document === 'undefined') return;
    const status = document.getElementById('dataStatus');
    if (status) status.textContent = message;
}
