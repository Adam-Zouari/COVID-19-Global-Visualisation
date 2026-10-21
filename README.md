# COVID-19 Atlas

**Midnight Atlas** is a globe-centered explorer for historical country-level COVID-19 observations. It keeps the interactive 3D globe, with the original navy dark appearance and an optional light appearance for cases and deaths, hospitalizations, and vaccinations. Select a country, open its analysis below the globe, or compare up to four countries while keeping the selected metric and units.

## Run and choose a data source

Use Node.js 22.13 or later in the 22.x line, or Node.js 24+:

```powershell
npm ci
npm start
```

- **Historical archive (default):** [http://127.0.0.1:3000](http://127.0.0.1:3000). The app loads your five downloaded Google datasets, already prepared in `data/` and validated through the data service. Existing `?data=csv` links continue to work. Missing files show recovery controls; the app never silently substitutes fictional data.
- **Optional demo:** [http://127.0.0.1:3000/?data=sample](http://127.0.0.1:3000/?data=sample). Explicit demo mode uses deterministic fictional observations for 31 countries from January 2020 through December 2022, with fictional population denominators. The compact header selector switches between **Google data** and **Fictional demo**; uploaded files are identified separately when active.

Google ended real-time updates in September 2022. The archive displays recorded observations, not current conditions. Its actual loaded dates and reporting coverage appear in the interface; the final observation in this download is September 16, 2022.

The server binds to loopback by default. Set `PORT` to change the port, `HOST` to change the interface, and `DATA_DIR` to change the prepared CSV directory. D3, TopoJSON, and globe geometry are served from installed packages. Decorative flags use flagcdn.com and are hidden if unavailable.

## Explore, analyze, and compare

The compact introduction puts the globe near the top of a laptop screen. An opaque sticky header keeps scrolling content legible and contains the data-source selector. Reporting limitations and source details remain available in Methodology. The desktop settings sidebar is 332px wide, with responsive arrangements for smaller screens and expandable explanations to keep the main controls compact.

Choose a category, a human-readable metric, and its display unit. Raw/seven-day-average controls appear for daily additions and current hospital, ICU, and ventilation occupancy; cumulative totals remain raw. The timeline sits above the globe so the date can be changed before scrolling past the map, and uses the selected metric's reporting dates. The compact speed selector beside Play offers 0.5x, 1x, 2x, and 4x playback (1x advances one reporting date every 500 ms). Changing speed during playback takes effect immediately without moving the selected date; choosing a speed while paused keeps it paused. The globe header shows how many countries have an available value for the selected settings. The globe stays still until interacted with; drag to rotate, use the wheel or a two-finger pinch to zoom, and use the labeled zoom and reset controls. Open comparison through the header navigation or add a selected country from its details panel; the settings sidebar has no duplicate Compare shortcut.

Without a valid date in the URL, the initial view selects the latest day whose reporting-country count is at least 80% of that metric's peak coverage. This avoids starting on a sparsely reported trailing date. All reported dates remain accessible through the timeline, including the final source observation.

Select a country on the globe or through search, including countries and territories omitted by the low-resolution map. Search identifies available observations, reports on other dates, metrics without observations, missing population denominators, and insufficient averaging history. These states use the actual selected metric, date, and transformation; reported zero counts as available data. The country panel shows the selected metric, date, supporting observations, trend, population provenance, and last reported date. **Explore country data** opens analysis inline below the globe. Trend lines are the default; daily bars are available when appropriate, with labeled weekly aggregation for long histories.

**Compare** keeps country chips, shared metric controls, and the selected period close to the charts. Its empty state is compact. It supports up to four countries using distinct blue, amber, magenta, and green colors. Active countries keep their assignments when reordered or when another country is removed, independently of earlier browsing history. Solid, dashed, dotted, and dash-dot lines match the legend and provide an additional way to distinguish countries. Combined trend lines are the default, with separate charts as an alternative. Separate charts share date axes and a common value scale by default; an explicit independent-scale option is available. Chart headings identify the metric and countries, while subtitles state the reporting treatment and selected period. Axes use meaningful units such as people, doses, or tests. A single-country chart omits a redundant country legend.

The comparison period uses two keyboard-accessible handles on one highlighted track. Date fields provide an alternative to dragging, including on touch screens. Bounds follow actual reporting dates for the selected metric. An entered date without observations snaps to the nearest available date within the interval, and the adjustment is announced; this changes the selected endpoint, never the underlying observations.

Use `/` or `Ctrl/Cmd+K` to open country search. Search results and controls support keyboard navigation. Escape closes search, leaves comparison, or returns from inline analysis. The layout adapts to mobile, and country navigation honors reduced-motion preferences.

The URL preserves the data mode, view, category, metric, unit, smoothing, selected date and country, and comparison countries, range, layout, chart type, and scale. Copy the address to restore that context. Uploaded files remain local to the current tab and are not embedded in shared links.

## Appearance

The compact sun/moon control beside search offers **Light**, **Dark**, and **System**. Dark is the default, even on an operating system using light appearance. A chosen preference is stored locally under `atlas-appearance`; System follows operating-system changes while the page is open and remains selected after refresh. Appearance is a browser preference, separate from shared data-view URLs. If storage is unavailable, changing appearance still works for the current page.

Both appearances use the same layout and components. Dark restores the original deep navy page, panels, controls, and coral, purple, and teal accents. Light uses muted blue-gray page backgrounds, gently tinted panels, and navy text, including the Global View panel, ocean, map labels, and globe controls. The map uses brighter colors for higher values on the dark background and darker colors for higher values on the light background. Category identities, numeric bands, and reporting meanings stay consistent. Chart series, axes, legends, tooltips, form controls, and focus states adapt to the chosen appearance.

`ui/theme.js` runs before the stylesheets to resolve the stored preference before the initial paint. It owns preference persistence, operating-system updates, the accessible header menu, and the small `window.AtlasTheme` API. CSS custom properties define the palettes; imperative D3 rendering reads those properties through the API and responds to `atlas:themechange`. Switching appearance updates the active visualizations without reloading observations or rebuilding geographic features. Statistical calculations and reporting rules are independent of appearance.

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
| Per 1,000,000 people | Count divided by available population, multiplied by 1,000,000 |
| % of population | Cumulative vaccinated people divided by population, multiplied by 100 |
| Doses per 100 people | Vaccine doses divided by population, multiplied by 100; this is not a coverage percentage and can exceed 100 |

The metric registry controls which units and transformations are meaningful. Daily additions and current patient occupancy can use smoothing; cumulative totals remain raw. Cumulative values are preserved independently of daily values rather than rebuilt from their sums.

Population-adjusted rates depend on the country's population. For example, **2,000,000 deaths in a population of 100,000,000 = 2,000 deaths per 100,000 people**: `2,000,000 ÷ 100,000,000 × 100,000`. A chart tick labeled `2k` means 2,000 in the axis's stated unit. Per-million rates are ten times the corresponding per-100,000 rates. The selected-country panel shows the actual count, population, and calculation; when averaging is active it uses the averaged count as its basis.

A seven-day average uses the selected day and six preceding calendar days to make daily trends easier to read when reporting varies across weekdays. With seven reported values of `0, 0, 0, 0, 0, 0, 700`, the average is **100 per day**, while the seven-day total is 700. An average can soften abrupt changes and cannot identify their cause or correct source errors; raw observations remain available for inspection.

The app requires a complete seven-calendar-day window inside the dataset period, at least five reported days, and an observation on the selected day. It divides by the number of available reports in that window. Missing days are omitted from the denominator, never treated as zero. Averaging happens before a chart's selected date range is applied. For current hospital, ICU, or ventilation occupancy, the result is the mean of reported daily patient snapshots. It describes average occupancy, not new admissions or the number of unique people treated; a patient present on several days contributes to several snapshots. Cumulative metrics are never smoothed.

A blank cell or absent country/date record remains **Not reported**. Queries never borrow a nearby observation. Reported zero remains zero, and negative daily reporting corrections remain negative. Missing population produces no normalized value. Real denominators are the static population estimates supplied by Google's demographics table; demo denominators are fictional. They are not time-varying population estimates.

An observed daily value without sufficient averaging history is labeled **Unavailable / Not enough reports**, separately from an absent raw report. Switching to raw values retains access to that observation.

Long-range bar charts group dates into Monday–Sunday weeks. Daily totals and means use only available values; they do not fill absent days. Occupancy bars show weekly means of available daily snapshots, or of available seven-day occupancy averages when smoothing is active; patient counts are never summed across days. Hatched bars identify incomplete weeks, including partially selected boundary weeks. Tooltips state the aggregation and reported-day coverage, and give available-average coverage when smoothing is selected. Hollow diamonds mark unavailable values; short solid baseline marks identify reported zeros. Only cumulative metrics use the last selected calendar day of each week and remain unavailable if that day's report is missing, rather than carrying an earlier value forward. Raw daily trend charts flag isolated peaks without attributing a cause, and offer averages or weekly bars for inspection.

The globe uses six ordered color bands on an explicitly labeled logarithmic scale (linear for vaccination percentages). Endpoint labels avoid suggesting that the middle color is half the maximum; **Color ranges & scale** expands to show approximate band boundaries and explain the progression, including the distinction between reported zero and missing data. The compact legend omits a duplicate zero/low-value key already represented by the scale. Bounds remain fixed across all loaded dates for each category, metric, unit, and smoothing choice and do not change with appearance. Each appearance has a matching sequential palette and legend, keeping reported zero and low observations distinct from gray unavailable values. Gray means the observation, sufficient averaging history, or population may be unavailable. Negative corrections use amber. Comparison colors identify countries independently of the map's numeric colors.

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
ui/                     appearance bootstrap, central store, search, navigation, source and comparison controls
server/                 Express server with explicit browser assets and data/report endpoints
scripts/                syntax checks, streaming download and country-only preparation
styles.css              dark/light theme tokens, Midnight Atlas components, layout, responsive states
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

`e2e/appearance.spec.js` exercises the original dark palette, default, stored and System preferences; early appearance application; keyboard and pointer menu behavior; live chart and globe recoloring with data, scale bounds, rotation, and geography retained; light globe labels and controls; and both appearances at 320px and 390px widths. It also writes Explore and Compare screenshots for visual review. To run this coverage separately, use `npm run test:e2e -- e2e/appearance.spec.js`.

`e2e/explorer-controls.spec.js` checks real pointer zoom/reset at laptop and 320px mobile sizes in both appearances, including maximum zoom, preserved country/date context, and the globe-header reporting count. A controlled hospitalization fixture verifies daily occupancy, seven-day means, admissions, and unsmoothed cumulative totals in Explore and Compare.

## Practical limits

Prepared country-only CSVs are still parsed and retained in browser memory. The first full-period smoothed map domain takes more work than cached updates; a server-side country/date API would help larger exports. Low-resolution geometry omits some small locations, which remain available through search.

Population adjustment improves comparability but cannot resolve different reporting definitions, coverage, revisions, or static-denominator limitations. The interface preserves those source gaps and corrections. Automated checks and successful loading validate application behavior and file structure; they do not establish the completeness or clinical accuracy of the source data.

See [AUDIT.md](AUDIT.md) for the audit, redesign, and validation record.
