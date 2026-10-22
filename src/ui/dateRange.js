// Native keyboard controls share one visual timeline; date fields provide a touch alternative.
window.DateRangeControl = class DateRangeControl {
    constructor(container, { dates = [], range = { start: 0, end: 100 }, idPrefix = 'date-range',
        sliderIds = {}, formatDate = date => date, caption = 'Historical period', onInput, onChange } = {}) {
        this.dates = [...dates]; this.formatDate = formatDate; this.onInput = onInput; this.onChange = onChange;
        this.inputs = {}; this.dateInputs = {}; this.indices = {};
        const last = Math.max(0, dates.length - 1);
        const index = percent => Math.max(0, Math.floor(Math.max(0, Math.min(100, Number(percent) || 0)) / 100 * last + 1e-9));
        this.indices.start = index(range.start); this.indices.end = Math.max(this.indices.start, index(range.end));

        this.element = document.createElement('div'); this.element.className = 'date-range-control';
        const heading = document.createElement('div'); heading.className = 'date-range-heading';
        const title = document.createElement('span'); title.className = 'date-range-caption'; title.textContent = caption;
        this.selection = document.createElement('output'); this.selection.className = 'date-range-selection';
        const track = document.createElement('div'); track.className = 'date-range-track';
        const rail = document.createElement('div'); rail.className = 'date-range-rail'; rail.setAttribute('aria-hidden', 'true');
        this.highlight = document.createElement('div'); this.highlight.className = 'date-range-highlight'; this.highlight.setAttribute('aria-hidden', 'true');
        track.append(rail, this.highlight);
        const help = document.createElement('p'); help.id = `${idPrefix}-help`; help.className = 'sr-only';
        help.textContent = 'Use arrow keys to change dates. The start cannot be after the end. Date fields are also available.';
        const fields = document.createElement('div'); fields.className = 'date-range-inputs';
        for (const key of ['start', 'end']) {
            const label = key === 'start' ? 'Start date' : 'End date';
            const slider = document.createElement('input'); slider.type = 'range'; slider.id = sliderIds[key] || `${idPrefix}-${key}`;
            slider.className = `date-range-handle date-range-${key}`; slider.min = '0'; slider.max = String(last); slider.step = '1';
            slider.disabled = dates.length <= 1; slider.setAttribute('aria-label', label); slider.setAttribute('aria-describedby', help.id);
            this.inputs[key] = slider; track.appendChild(slider);
            slider.addEventListener('input', () => this.setIndex(key, Number(slider.value), false));
            slider.addEventListener('change', () => this.setIndex(key, Number(slider.value), true));

            const fieldLabel = document.createElement('label'); fieldLabel.textContent = key === 'start' ? 'From' : 'To';
            const field = document.createElement('input'); field.type = 'date'; field.id = `${idPrefix}-${key}-input`;
            field.setAttribute('aria-label', `${label}, enter a date`); field.disabled = !dates.length;
            this.dateInputs[key] = field; fieldLabel.appendChild(field); fields.appendChild(fieldLabel);
            field.addEventListener('change', () => {
                if (!field.value) { this.refresh(); return; }
                const requested = field.value;
                const nearest = this.nearestIndex(requested);
                this.setIndex(key, nearest, true);
                if (field.value !== requested) this.status.textContent = `Selected ${this.formatDate(field.value)}, the nearest available date within this interval.`;
            });
        }
        const bounds = document.createElement('div'); bounds.className = 'date-range-bounds';
        for (const date of [dates[0], dates.at(-1)]) { const bound = document.createElement('span'); bound.textContent = date ? formatDate(date) : ''; bounds.appendChild(bound); }
        this.status = document.createElement('span'); this.status.className = 'sr-only'; this.status.setAttribute('role', 'status');
        heading.append(title, this.selection); this.element.append(heading, track, bounds, fields, help, this.status);
        container.replaceChildren(this.element); this.refresh();
    }

    nearestIndex(date) {
        let low = 0, high = this.dates.length;
        while (low < high) { const middle = Math.floor((low + high) / 2); if (this.dates[middle] < date) low = middle + 1; else high = middle; }
        if (!low) return 0;
        if (low === this.dates.length) return low - 1;
        return Date.parse(date) - Date.parse(this.dates[low - 1]) <= Date.parse(this.dates[low]) - Date.parse(date) ? low - 1 : low;
    }

    setIndex(key, index, commit) {
        const last = Math.max(0, this.dates.length - 1);
        const clamped = Math.max(0, Math.min(last, Math.round(index) || 0));
        const previous = this.indices[key];
        this.indices[key] = key === 'start' ? Math.min(clamped, this.indices.end) : Math.max(clamped, this.indices.start);
        this.status.textContent = ''; this.refresh();
        if (this.indices[key] !== previous) this.onInput?.(this.getRange(), this.getDates());
        if (commit) this.onChange?.(this.getRange(), this.getDates());
    }

    getRange() {
        const last = this.dates.length - 1;
        return { start: last > 0 ? this.indices.start / last * 100 : 0, end: last > 0 ? this.indices.end / last * 100 : 100 };
    }

    getDates() { return { start: this.dates[this.indices.start], end: this.dates[this.indices.end] }; }

    refresh() {
        const selected = this.getDates(), range = this.getRange();
        for (const key of ['start', 'end']) {
            this.inputs[key].value = String(this.indices[key]);
            this.inputs[key].setAttribute('aria-valuetext', selected[key] ? this.formatDate(selected[key]) : 'No observations');
            const field = this.dateInputs[key]; field.value = selected[key] || '';
            field.min = key === 'start' ? this.dates[0] || '' : selected.start || '';
            field.max = key === 'start' ? selected.end || '' : this.dates.at(-1) || '';
        }
        // Keep the two native tracks equal in width. Their allowed interval is enforced in setIndex.
        this.inputs.start.setAttribute('aria-valuemax', String(this.indices.end));
        this.inputs.end.setAttribute('aria-valuemin', String(this.indices.start));
        this.selection.textContent = selected.start ? selected.start === selected.end ? this.formatDate(selected.start) :
            `${this.formatDate(selected.start)} – ${this.formatDate(selected.end)}` : 'No observations';
        this.highlight.style.left = `${range.start}%`; this.highlight.style.width = `${range.end - range.start}%`;
        // When both handles coincide, the start handle stays reachable at the right endpoint.
        this.inputs.start.style.zIndex = this.indices.start === this.dates.length - 1 ? '4' : '';
    }
};
