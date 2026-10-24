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

Choose a category, a human-readable metric, and its display unit. Daily reporting is the default; explicit seven-day-average views are retained in shared URLs. Raw/seven-day-average controls appear for daily additions and current hospital, ICU, and ventilation occupancy; cumulative totals remain raw. The timeline sits above the globe so the date can be changed before scrolling past the map, and uses the selected metric's reporting dates. Its editable date field stays synchronized with the slider and previous/next buttons. The compact speed selector beside Play offers 0.5x, 1x, 2x, and 4x playback (1x advances one reporting date every 500 ms). Changing speed during playback takes effect immediately without moving the selected date; choosing a speed while paused keeps it paused. The globe header shows how many countries have an available value for the selected settings. Open comparison through the header navigation or add a selected country from its details panel; the settings sidebar has no duplicate Compare shortcut.

Collapse **Explorer settings** into a narrow rail to the left of the globe; its vertical heading and chevron remain available to reopen it. Expanded settings fit their content without an internal vertical scrollbar. Global View has no duplicate settings shortcut. The expand control opens a full-screen globe workspace containing the dataset-category buttons, date timeline, explorer settings, and country snapshot alongside the globe. These are the existing controls and observations; changing a column or date does not require leaving the expanded workspace. The snapshot's **Explore country data** and **Add to comparison** actions exit fullscreen before opening country analysis or Compare. The expand control or Escape closes it and restores the previous page position; a viewport-sized fallback works when native Fullscreen is unavailable.

Collapsing settings changes the globe panel's available width without increasing its height, matching the sideways expansion when the country snapshot closes. Opening **Color ranges & scale** preserves the space below the workspace and lets the country snapshot stretch without an internal scrollbar. Closing it restores the snapshot's usual height.

The globe slowly rotates on first load. Interacting with it stops that rotation until **Reset globe view** is used; resetting smoothly restores rotation and zoom over 1 second, then restarts rotation. Reduced-motion preferences apply the reset immediately and disable automatic rotation. Drag to rotate manually, use the wheel or a two-finger pinch to zoom, and use the labeled zoom controls.

Without a valid date in the URL, the initial view selects the latest day whose reporting-country count is at least 80% of that metric's peak coverage. This avoids starting on a sparsely reported trailing date. All reported dates remain accessible through the timeline, including the final source observation.

Select a country on the globe or through search, including countries and territories omitted by the low-resolution map. Search identifies available observations, reports on other dates, metrics without observations, missing population denominators, and insufficient averaging history. These states use the actual selected metric, date, and transformation; reported zero counts as available data. The country panel shows the selected metric, date, supporting observations, trend, population provenance, and last reported date. **Explore country data** opens analysis inline below the globe. Trend lines are the default; daily bars are available when appropriate, with labeled weekly aggregation for long histories. The chart selector sits on the right just above the From/To date controls in normal page flow; it does not follow the viewport while scrolling. Expanded analysis retains space above the bottom of the page, matching the other workspaces.

**Compare** keeps country chips, shared metric controls, and the selected period close to the charts. Its empty state is compact. It supports up to four countries, or three for scatter plots, using distinct blue, amber, magenta, and green colors. Active countries keep their assignments when reordered or when another country is removed, independently of earlier browsing history. All trend lines use solid, smooth segments between reported values; actual missing dates remain gaps. Combined trend lines are the default, with separate charts as an alternative. Separate charts share date axes and a common value scale by default; an explicit independent-scale option is available. Chart headings identify the metric and countries, while subtitles state the reporting treatment and selected period. Axes use meaningful units such as people, doses, or tests. A single-country chart omits a redundant country legend. Changing comparison settings preserves the page's scroll position, including when a redraw produces a shorter chart.

The comparison period uses two keyboard-accessible handles on one highlighted track. Date fields provide an alternative to dragging, including on touch screens. Typed dates apply on Enter or when leaving the field, allowing multi-digit days and years; calendar selections apply immediately. Escape cancels an unfinished edit, and empty or invalid entries restore the selected date. Bounds follow actual reporting dates for the selected metric. An entered date without observations snaps to the nearest available date within the interval, and the adjustment is announced; this changes the selected endpoint, never the underlying observations.

Chart choices follow the workspace: **country analysis** contains line, bar, area, heatmap, scatter, and box plots for one selected country. **Compare** contains line, bar, horizontal bars, heatmap, scatter, dumbbell, and box plots for its selected countries. Every retained chart accepts available measures instead of requiring a fixed vaccination group or indicator profile. Horizontal bars use a date field and a slider; time-based charts retain the selected period. Separate panels and independent scales are available for comparison lines and bars.

Charts without usable observations show a centered **No data available** message, a reason, and a suggestion within the plotting area. Headings and date ranges remain visible, and the same chart retains its populated footprint while empty. Switching chart types still uses their natural heights. Scatter plots use the themed data tooltip and accessible point descriptions without duplicate browser hover bubbles; heatmap and scatter colour legends sit closer to their plots.

| Chart | Available in | Data and interpretation |
| --- | --- | --- |
| Trend line / bars | Country analysis and Compare | The selected measure over time, with missing-data gaps, signed corrections, and the reporting treatment described above. Compare uses consistent country colors, timelines, and scales. |
| Area | Country analysis | A filled time series for the selected country, with a zero baseline, signed values, and missing-data gaps. |
| Heatmap | Country analysis and Compare | Country analysis uses a month-by-day calendar for its selected country. Compare uses one row per selected country and common calendar periods: totals for raw daily additions, means for occupancy or smoothed observations, and exact endpoint snapshots for cumulative values. All columns fit the chart without a horizontal scrollbar. Missing values, corrections, inactive calendar cells, and partial periods are distinct. Arrow keys inspect every cell through one keyboard entry point. |
| Horizontal bars | Compare | Same-date values for the selected countries, using the chosen measure and unit. A date field, slider, and previous/next-day arrows navigate the calendar. The arrows stop at its endpoints; unreported days remain unavailable. |
| Scatter | Country analysis and Compare | Country analysis pairs two numeric columns from any loaded dataset, grouped by dataset in each axis menu. Both axes initially use the selected dataset; chosen axes remain selected when browsing other categories. Each axis has independent units, with daily or seven-day treatment for eligible measures. Compare assigns two countries to X/Y axes or three countries to X/Y/Z axes, using the same selected column and unit for every country. Start/end dates and a dual-handle slider select the period. Each point is one exact shared calendar date, colored by time; any missing axis excludes that date. A continuous **Date** colour bar matches the dots, labels the earliest and latest plotted dates, and becomes a solid colour with one label when only one date is available. Arrow keys inspect points and their values. Both comparison views have bounded +/− and wheel zoom, plus Reset view; the 3D view also supports drag/keyboard rotation. Dragging the plot does not select axis text. Associations do not establish causes. |
| Dumbbell | Compare | Each selected country's value at exact shared start/end dates, preserving signed changes and zero values. Daily averages retain their original trailing windows. A first selection with the default full range starts with a recent 90-day interval; custom periods remain adjustable. Missing endpoints produce an explanation. |
| Box plot | Country analysis and Compare | Summarize one selected column for one country, or compare selected countries' distributions in the chosen period. Boxes show medians, quartiles, observed whiskers within 1.5×IQR, and outliers. Hover or keyboard focus reveals the reported-observation count, minimum, maximum, quartiles, median, mean, IQR, and observed whiskers with full values. Outlier details identify the value and number of repeated observations. There are no extra statistics panels or observation lists. These summarize reported observations rather than people or confidence intervals. |

Histogram was removed to keep the choices focused. Histograms can summarize discrete counts, but their bins answer a distribution question rather than showing values over time. Time bars and the box plot cover the selected workflows without another distribution view. Box plot tooltips label the count **Reported observations** rather than adding a floating `n=` annotation.

The horizontal-bar date, comparison chart type, and comparison period are retained in shared comparison URLs. Clearing the horizontal-bar date returns to the globe's selected date. Country scatter's X/Y columns, units, and averaging remain local to the current tab. Switching charts does not change the globe's selected measure or reinterpret source observations. Missing observations or population denominators remain unavailable. Older comparison links to removed or country-only charts restore trend lines.

The country-analysis heading shows the selected metric's value and selected day below its units. It follows the country, timeline, metric, units, and averaging settings across chart types; it is independent of the chart's local date range. Unavailable values include a reason rather than a substituted zero. Line and area charts also reveal dated values on hover or keyboard focus. Left/Right arrows move through dates, and Home/End jump to the period's endpoints. Zero values, corrections, and missing reports retain their distinct meanings.

Use `/` or `Ctrl/Cmd+K` to open country search. Search results and controls support keyboard navigation. Escape closes search, leaves comparison, or closes inline analysis. The layout adapts to mobile, and country navigation honors reduced-motion preferences.

The URL preserves the data mode, view, category, metric, unit, smoothing, selected date and country, whether country analysis is open, and comparison countries, range, layout, chart type, and scale. Refreshing keeps an open country-analysis panel open after its data loads; closing it clears that saved state. Its open state also survives a refresh in Compare and returning to Explore. Restoration does not force a scroll or focus change. Copy the address to restore that context. Uploaded files remain local to the current tab and are not embedded in shared links.

## Appearance

The compact sun/moon control beside search offers **Light**, **Dark**, and **System**. Dark is the default, even on an operating system using light appearance. A chosen preference is stored locally under `atlas-appearance`; System follows operating-system changes while the page is open and remains selected after refresh. Appearance is a browser preference, separate from shared data-view URLs. If storage is unavailable, changing appearance still works for the current page.

Both appearances use the same layout and components. Dark restores the original deep navy page, panels, controls, and coral, purple, and teal accents. Light uses muted blue-gray page backgrounds, gently tinted panels, and navy text, including the Global View panel, ocean, map labels, and globe controls. The map uses brighter colors for higher values on the dark background and darker colors for higher values on the light background. Category identities, numeric bands, and reporting meanings stay consistent. Chart series, axes, legends, tooltips, form controls, and focus states adapt to the chosen appearance.

`src/ui/theme.js` runs before the stylesheets to resolve the stored preference before the initial paint. It owns preference persistence, operating-system updates, the accessible header menu, and the small `window.AtlasTheme` API. CSS custom properties define the palettes; imperative D3 rendering reads those properties through the API and responds to `atlas:themechange`. Switching appearance updates the active visualizations without reloading observations or rebuilding geographic features. Statistical calculations and reporting rules are independent of appearance.

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

The loader accepts `location_key`, older Google `key`, and existing `country_key`/`country_code`/`iso_code` identifiers. It retains country-level two-letter keys and filters subregions using the same rules as preparation. It rejects inconsistent CSV row widths, duplicate or empty headers, missing required columns, invalid dates and numeric cells, duplicate country/date rows, and observations whose country is absent from the index. Rejected data leaves the previous observations and caches intact. Valid reloads retain the selected metric when it remains available; uploaded population files are identified as uploaded demographics.

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
index.html              page markup and accessible component structure
src/
  app.js                module bootstrap, source choice, URL restoration
  dataService/          metrics, loading, validation, demographics, queries, normalization, caches
  globe/                geographic matching, rendering, input, timeline, country details
  charts/               chart models, axes, tooltips, analysis and comparison rendering
  ui/                   appearance, store, search, navigation and workspace controls
styles/
  main.css              theme tokens, shared controls, page layout and responsive states
  charts.css            shared chart rendering, tooltips and analytical controls
  compare.css           comparison workspace layout, country chips and controls
assets/                 static icons; installed globe geometry is served through a dedicated route
server/                 Express server with explicit browser assets and data/report endpoints
scripts/                syntax checks, streaming download and country-only preparation
tests/                  Node regression tests
e2e/                    Playwright desktop, mobile, recovery, and real-data workflows
docs/
  AUDIT.md              audit decisions, repairs and validation record
  design/               design reference screenshots
data/                   prepared local CSVs and quality report (not committed)
datasets/google/        original downloads (not committed)
```

The root keeps the HTML entry point and project configuration. Application code lives under `src/`, while styles, static assets, server tooling, tests, documentation and local datasets have separate homes. The data layer's pure validation helpers are reused by the preparation script. The server serves only the HTML entry point, `src/`, `styles/`, `assets/`, and explicit vendor/data endpoints; documentation, scripts, tests and raw dataset directories are not public.

There is no build step. The data layer, registry, store, and bootstrap use ES modules; rendering modules expose a small browser-global API and load in an explicit order. One service and one globe own their data and event lifetimes. `src/ui/view.js` applies the requested workspace before the first paint and retains navigation changes made while application code or CSVs are loading. `src/ui/globeWorkspace.js` owns settings collapse, the expanded workspace's existing controls, full-screen presentation and focus restoration, and the expanded analysis's bottom spacing. Comparison reads the active metric from the data service instead of maintaining a second copy.

Analytical charts separate semantic models (`src/charts/analyticsData.js`), shared rendering utilities (`src/charts/analyticsRendering.js`), comparison/distribution renderers (`src/charts/analyticsComparisons.js` and `src/charts/analyticsDistributions.js`), and contextual controls (`src/ui/analytics.js`). `src/charts/chartTypes.js` defines each workspace's chart choices and validates shared settings. All charts reuse the existing D3 package and appearance palette.

## Validate changes

```powershell
npm run check
npm test
npm run test:e2e
```

Browser tests use installed Google Chrome. Set the Playwright `channel` in `playwright.config.js` to `msedge` to use installed Edge. Tests start a separate local server on port 3100 and save screenshots and failure traces under ignored `test-results/`. Decorative flag requests are stubbed for repeatability.

`e2e/appearance.spec.js` exercises the original dark palette, default, stored and System preferences; early appearance application; keyboard and pointer menu behavior; live chart and globe recoloring with data, scale bounds, rotation, and geography retained; light globe labels and controls; and both appearances at 320px and 390px widths. It also writes Explore and Compare screenshots for visual review. To run this coverage separately, use `npm run test:e2e -- e2e/appearance.spec.js`.

`e2e/explorer-controls.spec.js` checks real pointer zoom/reset at laptop and 320px mobile sizes in both appearances, including maximum zoom, preserved country/date context, and the globe-header reporting count. A controlled hospitalization fixture verifies daily occupancy, seven-day means, admissions, and unsmoothed cumulative totals in Explore and Compare.

`e2e/view-restoration.spec.js` holds application and data requests to verify the first painted workspace, refresh without an Explore flash or unwanted heading focus, navigation during loading, retained URL settings, and archive-failure recovery. Node regressions also cover isolated reports, tiny nonzero rates, keyboard chart inspection, selection event lifetimes, pinch gestures, and CSV/preparation failure atomicity.

`e2e/analytics.spec.js` checks the distinct chart choices in each workspace, retained charts across available measures, selected-country scope, dark and light appearances, 320px/390px layouts, grouped cross-dataset scatter controls, old-link fallback, shared-settings restoration, keyboard inspection, live recoloring, and the installed original archive. Focused `tests/analytics-*.test.js` suites cover transformations, shared dates, reporting completeness, negative corrections, distributions, and renderer geometry.

## Practical limits

Prepared country-only CSVs are still parsed and retained in browser memory. The first full-period smoothed map domain takes more work than cached updates; a server-side country/date API would help larger exports. Low-resolution geometry omits some small locations, which remain available through search.

Population adjustment improves comparability but cannot resolve different reporting definitions, coverage, revisions, or static-denominator limitations. The interface preserves those source gaps and corrections. Automated checks and successful loading validate application behavior and file structure; they do not establish the completeness or clinical accuracy of the source data.

See [AUDIT.md](docs/AUDIT.md) for the audit, redesign, and validation record.
