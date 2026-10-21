window.CompareUI = {
    show() {
        const panel = document.getElementById('comparePanel'); panel.hidden = false;
        this.initializeDateRangeSlider(); this.updateCountryList(); document.getElementById('exitCompareBtn')?.focus();
    },
    hide() { document.getElementById('comparePanel').hidden = true; },

    initializeDateRangeSlider() {
        const label = document.getElementById('compareDateModeLabel'); if (label) label.textContent = 'Historical period';
        const sliders = document.getElementById('dateRangeSlider'); if (!sliders) return;
        sliders.replaceChildren();
        const service = window.globeInstance.dataService, dates = service.getAvailableDates?.() || service.availableDates;
        const inputs = {};
        for (const key of ['start', 'end']) {
            const input = document.createElement('input'); input.type = 'range'; input.id = `${key}DateSlider`; input.className = 'date-slider';
            input.min = '0'; input.max = String(Math.max(0, dates.length - 1)); input.step = '1';
            input.value = String(ChartFactory.dateIndex(CompareMode.state.dateRange[key], dates.length)); input.disabled = dates.length <= 1;
            input.setAttribute('aria-label', `${key === 'start' ? 'Start' : 'End'} date`); inputs[key] = input; sliders.appendChild(input);
        }
        const update = () => {
            for (const key of ['start', 'end']) {
                const text = service.formatDate(dates[Number(inputs[key].value)]);
                const label = document.getElementById(`${key}DateLabel`); if (label) label.textContent = text;
                inputs[key].setAttribute('aria-valuetext', text);
            }
        };
        for (const key of ['start', 'end']) {
            inputs[key].oninput = () => {
                if (Number(inputs.start.value) > Number(inputs.end.value)) inputs[key].value = inputs[key === 'start' ? 'end' : 'start'].value;
                update();
            };
            inputs[key].onchange = () => {
                const percent = input => dates.length > 1 ? Number(input.value) / (dates.length - 1) * 100 : 100;
                CompareMode.updateDateRange(percent(inputs.start), percent(inputs.end));
            };
        }
        update();
    },

    updateCountryList() {
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

    showNoCountriesMessage() {
        const wrapper = document.createElement('div'); wrapper.className = 'no-countries-message';
        const heading = document.createElement('h3'); heading.textContent = 'A shared perspective';
        const text = document.createElement('p'); text.textContent = 'Choose 2–4 countries to compare the same metric across history. Start with population-adjusted values for a fairer comparison.';
        const button = document.createElement('button'); button.className = 'primary-btn'; button.textContent = 'Choose countries'; button.onclick = openSearch;
        wrapper.append(heading, text, button); document.getElementById('compareChartContainer').replaceChildren(wrapper);
    }
};
