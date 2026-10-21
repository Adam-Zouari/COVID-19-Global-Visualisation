# COVID-19 Atlas

**Midnight Atlas** is a globe-centered explorer for historical country-level COVID-19 observations. It keeps the interactive 3D globe and uses one dark interface for cases and deaths, hospitalizations, and vaccinations. Select a country, open its analysis below the globe, or compare up to four countries while keeping the selected metric and units.

## Run and choose a data source

Use Node.js 22.13 or later in the 22.x line, or Node.js 24+:

```powershell
npm ci
npm start
```

- **Historical archive (default):** [http://127.0.0.1:3000](http://127.0.0.1:3000). The app loads your five downloaded Google datasets, already prepared in `data/` and validated through the data service. Existing `?data=csv` links continue to work. Missing files show recovery controls; the app never silently substitutes fictional data.
- **Optional demo:** [http://127.0.0.1:3000/?data=sample](http://127.0.0.1:3000/?data=sample). Explicit demo mode uses deterministic fictional observations for 31 countries from January 2020 through December 2022, with fictional population denominators. The source notice switches between demo and archive.

Google ended real-time updates in September 2022. The archive displays recorded observations, not current conditions. Its actual loaded dates and reporting coverage appear in the interface; the final observation in this download is September 16, 2022.

The server binds to loopback by default. Set `PORT` to change the port, `HOST` to change the interface, and `DATA_DIR` to change the prepared CSV directory. D3, TopoJSON, and globe geometry are served from installed packages. Decorative flags use flagcdn.com and are hidden if unavailable.

## Explore, analyze, and compare

Choose a category, a human-readable metric, its display unit, and raw values or a trailing seven-day average where supported. The timeline uses the selected metric's reporting dates. The globe stays still until interacted with; drag to rotate, use the wheel or a two-finger pinch to zoom, and use the labeled zoom and reset controls.

Without a valid date in the URL, the initial view selects the latest day whose reporting-country count is at least 80% of that metric's peak coverage. This avoids starting on a sparsely reported trailing date. All reported dates remain accessible through the timeline, including the final source observation.

Select a country on the globe or through search, including countries and territories omitted by the low-resolution map. The country panel shows the selected metric, date, supporting observations, trend, population provenance, and last reported date. **Explore country data** opens analysis inline below the globe. Trend lines are the default; daily bars are available when appropriate, with labeled weekly aggregation for long histories.

**Compare** is a dedicated workspace with country chips and shared metric, unit, smoothing, and date-range controls. It supports up to four countries, stable country colors, combined trend lines by default, and separate charts as an alternative. Separate charts share date axes and a common value scale by default; an explicit independent-scale option is available.

Use `/` or `Ctrl/Cmd+K` to open country search. Search results and controls support keyboard navigation. Escape closes search, leaves comparison, or returns from inline analysis. The layout adapts to mobile, and country navigation honors reduced-motion preferences.

The URL preserves the data mode, view, category, metric, unit, smoothing, selected date and country, and comparison countries, range, layout, chart type, and scale. Copy the address to restore that context. Uploaded files remain local to the current tab and are not embedded in shared links.

## Data sources and preparation

The five selected tables come from [Google COVID-19 Open Data](https://github.com/GoogleCloudPlatform/covid-19-open-data):

| Source file | Role | Prepared filename |
| --- | --- | --- |
| `epidemiology.csv` | Cases, deaths, recoveries, and testing | `country_level_epidem.csv` |
| `hospitalizations.csv` | Admissions, occupancy, ICU, and ventilation | `country_level_hospitalizations.csv` |
| `vaccinations.csv` | Vaccinated people and administered doses | `country_level_vaccinations.csv` |
| `index.csv` | Country identifiers and names | `small_index.csv` |
| `demographics.csv` | Population denominators | `country_level_demographics.csv` |

The original filenames also work as server aliases, as does the legacy `country_level_hopitalizations.csv` spelling. Prefer the smaller prepared files: the original downloads include many regional records.

For a fresh download:

```powershell
npm run download-data
npm run prepare-data -- datasets/google
```

The downloader streams all five originals to `datasets/google/`, shows progress, retries transient failures twice, and skips completed nonempty files. Temporary downloads are published only on completion. Ctrl+C removes the active temporary file; rerunning skips completed files and restarts unfinished ones. To use another download folder:

```powershell
npm run download-data -- "C:\path\to\google-downloads"
npm run prepare-data -- "C:\path\to\google-downloads" data-next
```

Preparation streams country-level records into a new destination and refuses to overwrite existing outputs. To refresh the files already prepared in this workspace, choose a new output directory and point the server at it:

```powershell
$env:DATA_DIR = "data-next"
npm start
```

Demographics is optional during preparation and loading. The four observation/index files still work without it; population-adjusted units then become unavailable. A missing or invalid required dataset opens recovery controls for four CSV uploads plus an optional demographics upload. A successful upload replaces the data atomically and recovers the globe without reloading. Use prepared country-only files for uploads.

The loader accepts `location_key`, older Google `key`, and existing `country_key`/`country_code`/`iso_code` identifiers. It retains country-level two-letter keys and filters subregions. It rejects invalid dates and numeric cells, duplicate country/date rows, and observations whose country is absent from the index.

Official field definitions: [epidemiology](https://github.com/GoogleCloudPlatform/covid-19-open-data/blob/main/docs/table-epidemiology.md), [hospitalizations](https://github.com/GoogleCloudPlatform/covid-19-open-data/blob/main/docs/table-hospitalizations.md), [vaccinations](https://github.com/GoogleCloudPlatform/covid-19-open-data/blob/main/docs/table-vaccinations.md), [index](https://github.com/GoogleCloudPlatform/covid-19-open-data/blob/main/docs/table-index.md), and [demographics](https://github.com/GoogleCloudPlatform/covid-19-open-data/blob/main/docs/table-demographics.md).

## Observations and calculated values

| Display | Calculation and meaning |
| --- | --- |
| Count | Original observed count, or the selected daily average |
| Per 100,000 people | Count divided by available population, multiplied by 100,000 |
| % of population | Cumulative vaccinated people divided by population, multiplied by 100 |
| Doses per 100 people | Vaccine doses divided by population, multiplied by 100; this is not a coverage percentage and can exceed 100 |

The metric registry controls which units and transformations are meaningful. Daily additions can use smoothing; cumulative totals and current patient occupancy retain their source meaning. Cumulative values are preserved independently of daily values rather than rebuilt from their sums.

A seven-day average uses the selected day and six preceding calendar days. It requires a complete seven-calendar-day window inside the dataset period, at least five reported days, and an observation on the selected day. Missing days are omitted from the denominator, never treated as zero. Averaging happens before a chart's selected date range is applied.

A blank cell or absent country/date record remains **Not reported**. Queries never borrow a nearby observation. Reported zero remains zero, and negative daily reporting corrections remain negative. Missing population produces no normalized value. Real denominators are the static population estimates supplied by Google's demographics table; demo denominators are fictional. They are not time-varying population estimates.

An observed daily value without sufficient averaging history is labeled **Unavailable / Not enough reports**, separately from an absent raw report. Switching to raw values retains access to that observation.

The globe uses six ordered color bands on a logarithmic scale (linear for vaccination percentages). Bounds remain fixed across all loaded dates for each category, metric, unit, and smoothing choice. Gray means no displayable value: the observation, sufficient averaging history, or population may be unavailable. Negative corrections use amber. Comparison colors identify countries independently of the map's numeric colors.

## Validation of the supplied download

The actual five files were streamed, normalized, indexed, and loaded through `DataService`:

| Prepared table | Country-level rows |
| --- | ---: |
| Epidemiology | 227,879 |
| Hospitalizations | 17,803 |
| Vaccinations | 56,031 |
| Country index | 246 |
| Demographics | 246 |

There are **243 valid positive population denominators**. Observed date ranges differ by category: epidemiology starts December 31, 2019; hospitalizations December 9, 2019; vaccinations January 25, 2020. All three extend through September 16, 2022. Individual metrics and countries can cover shorter periods.

The original hospital file contained **63 invalid or implausible country-level dates**, including years such as `0022` and dates earlier in 2019. Preparation excludes invalid calendar dates, dates before the explicit archive boundary **2019-12-01**, and dates after the preparation date. It records exclusions and examples in `data/prepare-report.json`, served at `/api/data-quality` and summarized in the archive methodology. Source dates and values are not rewritten, and the original downloads remain untouched. This policy removes identified date anomalies; it does not certify every source observation as accurate.

## Structure

```text
app.js                  module bootstrap, source choice, URL restoration
index.html              page markup and accessible component structure
dataService/            metrics, loading, validation, demographics, queries, normalization, caches
globe/                  orthographic globe, geographic matching, input, timeline, country details
charts/                 common chart preparation, axes, tooltips, analysis and comparison rendering
ui/                     central store, search, navigation, source state, comparison controls
server/                 Express server with explicit browser assets and data/report endpoints
scripts/                syntax checks, streaming download and country-only preparation
styles.css              Midnight Atlas tokens, components, layout, responsive states
styles/compare.css      comparison workspace styling
tests/                  Node regression tests
e2e/                    Playwright desktop, mobile, recovery, and real-data workflows
data/                   prepared local CSVs and quality report (not committed)
datasets/google/        original downloads (not committed)
```

There is no build step. The data layer, registry, store, and bootstrap use ES modules; rendering modules expose a small browser-global API and load in an explicit order. One service and one globe own their data and event lifetimes.

## Validate changes

```powershell
npm run check
npm test
npm run test:e2e
```

Browser tests use installed Google Chrome. Set the Playwright `channel` in `playwright.config.js` to `msedge` to use installed Edge. Tests start a separate local server on port 3100 and save screenshots and failure traces under ignored `test-results/`. Decorative flag requests are stubbed for repeatability.

## Practical limits

Prepared country-only CSVs are still parsed and retained in browser memory. The first full-period smoothed map domain takes more work than cached updates; a server-side country/date API would help larger exports. Low-resolution geometry omits some small locations, which remain available through search.

Population adjustment improves comparability but cannot resolve different reporting definitions, coverage, revisions, or static-denominator limitations. The interface preserves those source gaps and corrections. Automated checks and successful loading validate application behavior and file structure; they do not establish the completeness or clinical accuracy of the source data.

See [AUDIT.md](AUDIT.md) for the audit, redesign, and validation record.
