// Search functionality
function openSearch() {
    console.log("Opening search modal");
    const searchModal = document.getElementById('searchModal');
    if (!searchModal) {
        console.error("Search modal not found");
        return;
    }

    searchModal.style.display = 'flex';

    const searchInput = document.getElementById('countrySearchInput');
    if (searchInput) {
        searchInput.value = ''; // Clear previous search
        searchInput.focus();
    }

    // Always populate the country list when opening search
    populateCountryList();
}

function closeSearch() {
    console.log("Closing search modal");
    const searchModal = document.getElementById('searchModal');
    if (searchModal) {
        searchModal.style.display = 'none';
    }
}

// Global function to handle country selection
// This will be overridden by compare.js when in compare mode
if (typeof window.handleCountryClick !== 'function') {
    window.handleCountryClick = function(countryCode) {
        console.log("Default handleCountryClick called with:", countryCode);
        if (window.globeInstance) {
            window.globeInstance.goToCountry(countryCode);
        }
        closeSearch();
    };
}

function populateCountryList() {
    if (!window.globeInstance) return;

    const countryList = document.getElementById('countryList');
    countryList.innerHTML = '';

    // Get all countries from the dataService
    const countries = window.globeInstance.dataService.getAllCountries();

    if (countries.length === 0) {
        // If no countries are found, show a message
        countryList.innerHTML = '<div class="no-countries">Loading countries... Please wait.</div>';

        // Try again in a moment - data might still be loading
        setTimeout(() => {
            const retryCountries = window.globeInstance.dataService.getAllCountries();
            if (retryCountries.length > 0) {
                populateCountryList();
            }
        }, 1000);
        return;
    }

    // Sort countries alphabetically by name
    countries.sort((a, b) => a.countryName.localeCompare(b.countryName));

    // Create elements for each country
    countries.forEach(country => {
        const countryItem = document.createElement('div');
        countryItem.className = 'country-item';
        countryItem.innerHTML = `
            <img class="country-flag" src="https://flagcdn.com/${country.countryCode.toLowerCase()}.svg"
                 onerror="this.src='https://via.placeholder.com/24x16/ddd/aaa?text=?'">
            <span>${country.countryName}</span>
        `;

        countryItem.addEventListener('click', () => {
            console.log("Country clicked:", country.countryCode);
            // Use the global handleCountryClick function which will handle both normal and compare modes
            if (typeof window.handleCountryClick === 'function') {
                window.handleCountryClick(country.countryCode);
            } else {
                console.error("handleCountryClick function not found");
                window.globeInstance.goToCountry(country.countryCode);
                closeSearch();
            }
        });

        countryList.appendChild(countryItem);
    });

    // Set up live filtering
    document.getElementById('countrySearchInput').addEventListener('input', filterCountries);
}

function filterCountries() {
    const input = document.getElementById('countrySearchInput');
    const filter = input.value.toUpperCase();
    const countryList = document.getElementById('countryList');
    const countryItems = countryList.getElementsByClassName('country-item');

    for (let i = 0; i < countryItems.length; i++) {
        const span = countryItems[i].getElementsByTagName('span')[0];
        const txtValue = span.textContent || span.innerText;

        if (txtValue.toUpperCase().indexOf(filter) > -1) {
            countryItems[i].style.display = '';
        } else {
            countryItems[i].style.display = 'none';
        }
    }
}
