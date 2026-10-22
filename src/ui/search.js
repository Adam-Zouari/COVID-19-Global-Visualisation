let searchReturnFocus;

function openSearch() {
    stopTimeline();
    searchReturnFocus = document.activeElement;
    const modal = document.getElementById('searchModal'); modal.hidden = false;
    const input = document.getElementById('countrySearchInput'); input.value = '';
    populateCountryList(); input.focus();
    if (window.matchMedia?.('(max-width: 760px)').matches) document.body.style.overflow = 'hidden';
    document.getElementById('search')?.setAttribute('aria-expanded', 'true');
}

function closeSearch() {
    document.getElementById('searchModal').hidden = true;
    document.body.style.overflow = '';
    document.getElementById('search')?.setAttribute('aria-expanded', 'false');
    if (searchReturnFocus?.isConnected) searchReturnFocus.focus({ preventScroll: true });
    else document.getElementById(window.CompareMode?.state.active ? 'addCountryBtn' : 'search')?.focus({ preventScroll: true });
}

function populateCountryList() {
    const list = document.getElementById('countryList'); list.replaceChildren();
    const service = window.globeInstance?.dataService;
    const countries = service?.getAllCountries() || [];
    for (const country of countries.sort((a, b) => a.countryName.localeCompare(b.countryName))) {
        const item = document.createElement('button'); item.type = 'button'; item.className = 'country-item';
        item.classList.toggle('selected', window.globeInstance.selectedCountryCode === country.countryCode);
        const identity = document.createElement('span'); identity.className = 'country-search-label';
        appendCountryLabel(identity, country.countryCode, country.countryName, 'country-flag');
        item.appendChild(identity);
        const code = document.createElement('span'); code.className = 'country-code'; code.textContent = country.countryCode.toUpperCase(); code.setAttribute('aria-hidden', 'true'); item.appendChild(code);
        const availability = service.getCountryAvailability?.(country.countryCode);
        if (availability) {
            const status = document.createElement('span'); status.className = 'country-availability';
            status.id = `search-availability-${list.childElementCount}`;
            status.dataset.availability = availability.status;
            status.textContent = availability.label;
            status.title = availability.description;
            item.appendChild(status); item.setAttribute('aria-describedby', status.id);
        }
        item.dataset.searchText = `${country.countryName} ${country.countryCode}`;
        item.setAttribute('aria-label', country.countryName);
        item.addEventListener('click', () => {
            if (window.CompareMode?.state.active) CompareMode.addCountry(country.countryCode);
            else window.globeInstance.goToCountry(country.countryCode);
            closeSearch();
        });
        list.appendChild(item);
    }
    const empty = document.createElement('p'); empty.className = 'no-countries'; empty.id = 'searchEmpty';
    empty.textContent = countries.length ? 'No matching countries. Try another name.' : 'No countries available. Load a dataset first.';
    empty.hidden = countries.length > 0; list.appendChild(empty);
    const resultCount = document.getElementById('searchResultCount'); if (resultCount) resultCount.textContent = countries.length;
}

function filterCountries() {
    const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const filter = normalize(document.getElementById('countrySearchInput').value.trim());
    let matches = 0;
    document.querySelectorAll('#countryList .country-item').forEach(item => {
        item.hidden = !normalize(item.dataset.searchText).includes(filter);
        if (!item.hidden) matches++;
    });
    const empty = document.getElementById('searchEmpty'); if (empty) empty.hidden = matches > 0;
    const count = document.getElementById('searchResultCount'); if (count) count.textContent = matches;
}
