// Utility functions

export function formatDate(dateString) {
    if (!dateString) return '';

    // Assuming dates are in YYYY-MM-DD format
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

export function formatNumber(num) {
    if (num === undefined || num === null || isNaN(num)) return '-';
    return parseFloat(num).toLocaleString();
}

export function log(message, data) {
    if (this.debug) {
        if (data) {
            console.log(`[DataService] ${message}`, data);
        } else {
            console.log(`[DataService] ${message}`);
        }
    }
}
