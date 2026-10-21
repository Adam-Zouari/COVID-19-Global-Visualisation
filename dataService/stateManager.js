export function changeDataset(dataset) {
    if (!Object.hasOwn(this.availableColumns, dataset)) throw new RangeError(`Unknown dataset: ${dataset}`);
    this.currentDataset = dataset;
    this.setDefaultValues();
    return { columns: this.availableColumns[dataset], currentColumn: this.currentColumn };
}

export function changeDate(date) {
    if (!this.availableDates.includes(date)) return false;
    this.currentDate = date;
    return true;
}

export function changeColumn(column) {
    if (!this.availableColumns[this.currentDataset]?.includes(column)) return false;
    this.currentColumn = column;
    return true;
}

export function getDateIndex(date) {
    return this.availableDates.indexOf(date);
}

export function getDateFromIndex(index) {
    return Number.isInteger(index) ? this.availableDates[index] || this.currentDate : this.currentDate;
}
