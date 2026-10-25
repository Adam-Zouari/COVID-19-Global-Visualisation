window.CompareUI = {
    preserveScroll(render, { retainHeight = true } = {}) {
        const panel = document.getElementById('comparePanel');
        if (!panel || this.preservingScroll) return render();
        const position = { left: window.scrollX, top: window.scrollY };
        const minimum = this.scrollMinimumActive ? this.originalMinimum : panel.style.minHeight;
        panel.style.minHeight = `${panel.getBoundingClientRect().height}px`;
        this.preservingScroll = true;
        try { return render(); }
        finally {
            panel.style.minHeight = minimum;
            // Settings edits may retain enough height for the current viewport.
            // Switching chart types releases that floor for natural sizing.
            const shortage = retainHeight ? position.top + window.innerHeight - document.documentElement.scrollHeight : 0;
            this.scrollMinimumActive = shortage > 0;
            this.originalMinimum = minimum;
            if (shortage > 0) panel.style.minHeight = `${panel.getBoundingClientRect().height + shortage}px`;
            window.scrollTo({ ...position, behavior: 'instant' });
            this.preservingScroll = false;
        }
    },

    clearScrollMinimum() {
        if (this.scrollMinimumActive) document.getElementById('comparePanel').style.minHeight = this.originalMinimum;
        this.scrollMinimumActive = false;
    },
    initialize({ focus = true } = {}) {
        this.initializeDateRangeSlider(); this.updateCountryList();
        if (focus) document.getElementById('compareTitle')?.focus();
    },
    matchExploreBottomSpacing() {
        const panel = document.getElementById('comparePanel');
        const explore = document.getElementById('exploreView');
        const intro = document.querySelector('.page-intro');
        if (!panel || !explore) return;
        const previous = [explore, intro].filter(Boolean).map(node => [node, node.hidden]);
        const scroll = { left: window.scrollX, top: window.scrollY };
        // Read Explore's actual layout, including responsive heights. Restore
        // hidden content synchronously before paint; Compare stays in place.
        try {
            previous.forEach(([node]) => { node.hidden = false; });
            const bottoms = [...explore.querySelectorAll('.control-panel, .globe-stage, .country-details')]
                .filter(node => node.getClientRects().length)
                .map(node => node.getBoundingClientRect().bottom + window.scrollY);
            const gap = bottoms.length ? Math.max(0, window.innerHeight - Math.max(...bottoms)) : 0;
            panel.style.setProperty('--compare-bottom-space', `${gap}px`);
        } finally {
            previous.forEach(([node, hidden]) => { node.hidden = hidden; });
            if (window.scrollX !== scroll.left || window.scrollY !== scroll.top)
                window.scrollTo({ ...scroll, behavior: 'instant' });
        }
    },

    initializeDateRangeSlider() {
        const sliders = document.getElementById('dateRangeSlider'); if (!sliders) return;
        const service = CompareMode.service(), dates = service.getAvailableDates?.() || service.availableDates;
        new DateRangeControl(sliders, {
            dates, range: CompareMode.state.dateRange, idPrefix: 'compare-date-range',
            sliderIds: { start: 'startDateSlider', end: 'endDateSlider' }, formatDate: date => service.formatDate(date),
            onInput: range => CompareMode.updateDateRange(range.start, range.end),
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
        add.setAttribute('aria-label', 'Add a country to compare'); add.onclick = () => {
            if (CompareMode.state.countries.length >= CompareMode.countryLimit()) CompareMode.message(`Compare up to ${CompareMode.countryLimit()} countries in this chart. Remove a country before adding another.`);
            else openSearch();
        };
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
        const text = document.createElement('p'); text.textContent = `Use Add country above to compare 2–${CompareMode.countryLimit()} countries on the same dates.`;
        wrapper.append(heading, text); document.getElementById('compareChartContainer').replaceChildren(wrapper);
    }
};
