// State management functionality

export function changeDataset(dataset) {
    this.currentDataset = dataset;
    // Set first column of new dataset as current or pick a common one
    if (this.availableColumns[dataset].includes('new_confirmed')) {
        this.currentColumn = 'new_confirmed';
    } else if (this.availableColumns[dataset].includes('cumulative_confirmed')) {
        this.currentColumn = 'cumulative_confirmed';
    } else {
        this.currentColumn = this.availableColumns[dataset][0] || null;
    }

    this.log(`Changed dataset to ${dataset}, column set to ${this.currentColumn}`);

    return {
        columns: this.availableColumns[dataset],
        currentColumn: this.currentColumn
    };
}

export function changeDate(date) {
    if (this.availableDates.includes(date)) {
        this.currentDate = date;
        this.log(`Changed date to ${date}`);
        return true;
    }
    return false;
}

export function changeColumn(column) {
    if (this.availableColumns[this.currentDataset].includes(column)) {
        this.currentColumn = column;
        this.log(`Changed column to ${column}`);
        return true;
    }
    return false;
}

export function getDateIndex(date) {
    return this.availableDates.indexOf(date);
}

export function getDateFromIndex(index) {
    return this.availableDates[index] || this.currentDate;
}
