window.CompareUI = {
    show() {
        const panel = document.getElementById('comparePanel'); panel.hidden = false;
        this.initializeDateRangeSlider(); this.updateCountryList(); document.getElementById('exitCompareBtn')?.focus();
    },
    hide() { document.getElementById('comparePanel').hidden = true; },

    initializeDateRangeSlider() {
        const sliders = document.getElementById('dateRangeSlider'); if (!sliders) return;
        sliders.replaceChildren();
        const service = window.globeInstance.dataService, dates = service.getAvailableDates?.() || service.availableDates;
        this.rangeControl = new DateRangeControl(sliders, {
            dates, range: CompareMode.state.dateRange, idPrefix: 'compare-date-range',
            sliderIds: { start: 'startDateSlider', end: 'endDateSlider' }, formatDate: date => service.formatDate(date),
            onChange: range => CompareMode.updateDateRange(range.start, range.end)
        });
    },

    updateCountryList() {
        ChartFactory.reconcileComparisonCountries(CompareMode.state.countries);
        const list = document.getElementById('headerCountriesList'); list.replaceChildren();
        for (const code of CompareMode.state.countries) {
            const name = window.globeInstance.dataService.getCountryName(code);
            const item = document.createElement('div'); item.className = 'header-country-item'; item.draggable = true; item.dataset.countryCode = code;
            const swatch = document.createElement('i'); swatch.className = 'country-color'; swatch.style.backgroundColor = ChartFactory.countryColor(code); item.appendChild(swatch);
            appendCountryLabel(item, code, name, 'header-country-flag');
            const remove = document.createElement('button'); remove.className = 'remove-country-btn'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove ${name}`);
            remove.onclick = () => CompareMode.removeCountry(code); item.appendChild(remove);
            item.ondragstart = event => { item.classList.add('dragging'); event.dataTransfer.setData('text/plain', code); };
            item.ondragover = event => event.preventDefault();
            item.ondrop = event => { event.preventDefault(); CompareMode.reorderCountries(event.dataTransfer.getData('text/plain'), code); };
            item.ondragend = () => item.classList.remove('dragging'); list.appendChild(item);
        }
        const add = document.createElement('button'); add.id = 'addCountryBtn'; add.className = 'add-country-btn'; add.textContent = '+ Add country';
        add.setAttribute('aria-label', 'Add a country to compare'); add.onclick = () => { if (CompareMode.state.countries.length >= 4) CompareMode.message('Compare up to 4 countries. Remove a country before adding another.'); else openSearch(); };
        list.appendChild(add);
    },

    updateCountryColors() {
        // Update existing chips in place so appearance changes preserve drag
        // handlers, accessible labels, and keyboard focus.
        for (const item of document.querySelectorAll('#headerCountriesList .header-country-item')) {
            const swatch = item.querySelector('.country-color');
            if (swatch) swatch.style.backgroundColor = ChartFactory.countryColor(item.dataset.countryCode);
        }
    },

    showNoCountriesMessage() {
        const wrapper = document.createElement('div'); wrapper.className = 'no-countries-message';
        const heading = document.createElement('h3'); heading.textContent = 'Choose countries to compare';
        const text = document.createElement('p'); text.textContent = 'Use Add country above to compare 2–4 countries on the same dates.';
        wrapper.append(heading, text); document.getElementById('compareChartContainer').replaceChildren(wrapper);
    }
};
