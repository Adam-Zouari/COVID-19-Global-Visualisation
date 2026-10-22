import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { DataService } from '../src/dataService/DataService.js';

function fixture() {
    const service = new DataService({ useSampleData: true });
    service.currentColumn = 'new_confirmed'; service.currentDate = '2020-01-08';
    service.availableColumns.epidem = ['new_confirmed', 'new_tested'];
    service.datesByDataset.epidem = ['2020-01-01', '2020-01-08'];
    service.indexedData = { epidem: {
        tn: Object.fromEntries(Array.from({ length: 8 }, (_, index) =>
            [`2020-01-0${index + 1}`, { new_confirmed: 0 }])),
        fr: { '2020-01-01': { new_confirmed: 7 } },
        ci: { '2020-01-08': { new_confirmed: -3 } },
        de: { '2020-01-08': { new_confirmed: 12 } },
        ad: { '2020-01-08': { new_confirmed: null } }
    } };
    service.populationByCountry = { tn: 100000, fr: 100000, ci: 100000 };
    const names = { tn: 'Tunisia', fr: 'France', ci: "Côte d’Ivoire", de: 'Germany', ad: 'Andorra' };
    service.getAllCountries = () => Object.entries(names).map(([countryCode, countryName]) => ({ countryCode, countryName }));
    return service;
}

test('search availability distinguishes metric history, selected-day reports, zero, and corrections', () => {
    const service = fixture();
    assert.equal(service.getCountryAvailability('TN').status, 'available');
    assert.match(service.getCountryAvailability('tn').description, /reported zero/);
    assert.equal(service.getCountryAvailability('ci').status, 'available');
    assert.equal(service.getCountryAvailability('fr').status, 'other-dates');
    assert.equal(service.getCountryAvailability('ad').status, 'no-observations');
    assert.equal(service.getCountryAvailability('unindexed').status, 'no-observations');
    assert.equal(service.getCountryAvailability('tn', { column: 'new_tested' }).status, 'no-observations');
});

test('search explains unavailable transformations without hiding reported observations', () => {
    const service = fixture();
    service.displayUnit = 'per100k';
    assert.equal(service.getCountryAvailability('de').status, 'missing-population');
    assert.equal(service.getCountryAvailability('fr').status, 'other-dates');
    service.smoothing = '7day';
    assert.equal(service.getCountryAvailability('tn').status, 'available');
    assert.equal(service.getCountryAvailability('ci').status, 'insufficient-history');
    assert.match(service.getCountryAvailability('ci').description, /five reports/);
    service.smoothing = 'raw';
    assert.equal(service.getCountryAvailability('ci').status, 'available');
});

test('raw metric-history availability is cached and invalidates when data is replaced', () => {
    const service = fixture(); let reads = 0;
    service.indexedData.epidem.fr['2020-01-01'] = { get new_confirmed() { reads++; return 7; } };
    service.getCountrySeries = () => { throw new Error('Search should not build transformed calendar series'); };
    assert.equal(service.getCountryAvailability('fr').status, 'other-dates');
    assert.equal(service.getCountryAvailability('fr').status, 'other-dates');
    assert.equal(reads, 1);
    service.indexedData = { epidem: {} };
    assert.equal(service.getCountryAvailability('fr').status, 'no-observations');
});

test('country search shows accessible availability and filters names and codes, not status text', t => {
    const dom = new JSDOM(`<button id="search"></button><div id="searchModal" hidden>
        <input id="countrySearchInput"><span id="searchResultCount"></span><div id="countryList"></div></div>`, { runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const context = dom.getInternalVMContext();
    context.window.globeInstance = { dataService: fixture(), selectedCountryCode: 'tn', goToCountry() {} };
    context.stopTimeline = () => {};
    for (const file of ['ui/uiUtils.js', 'ui/search.js'])
        vm.runInContext(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), context, { filename: file });
    dom.window.openSearch();
    const document = dom.window.document;
    const tunisia = document.querySelector('[aria-label="Tunisia"]');
    assert.equal(document.getElementById(tunisia.getAttribute('aria-describedby')).textContent, 'Data available');
    assert.equal(document.querySelector('[aria-label="Andorra"] .country-availability').textContent, 'No observations for this metric');
    assert.equal(document.querySelector('[aria-label="France"] .country-availability').dataset.availability, 'other-dates');
    const input = document.getElementById('countrySearchInput');
    input.value = 'cote'; dom.window.filterCountries();
    assert.equal(document.querySelectorAll('.country-item:not([hidden])').length, 1);
    assert.equal(document.querySelector('.country-item:not([hidden])').getAttribute('aria-label'), 'Côte d’Ivoire');
    input.value = 'TN'; dom.window.filterCountries();
    assert.equal(document.querySelectorAll('.country-item:not([hidden])').length, 1);
    assert.equal(document.querySelector('.country-item:not([hidden])'), tunisia);
    input.value = 'available'; dom.window.filterCountries();
    assert.equal(document.querySelectorAll('.country-item:not([hidden])').length, 0);
    assert.equal(document.getElementById('searchEmpty').hidden, false);
});
