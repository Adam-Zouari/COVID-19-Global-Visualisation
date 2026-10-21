# Audit, repairs, and Midnight Atlas redesign

The project now presents a coherent historical COVID-19 atlas around the original interactive 3D globe. The redesign keeps the D3/TopoJSON and Express stack, introduces a consistent dark interface, and connects exploration, inline country analysis, and a dedicated comparison workspace.

## Completed experience

**Explore** combines labeled category and metric controls, appropriate units, daily smoothing, a fixed-scale map legend, a metric-specific historical timeline, and a country summary. The globe starts still. Search provides a keyboard-accessible path to every indexed country, including locations without map geometry. The selected country panel distinguishes the selected date from the last reported date and explains missing observations and population provenance.

When no valid URL date is supplied, the initial view uses the latest date with at least 80% of the active metric's peak reporting-country coverage. Sparse trailing dates remain available on the timeline. A missing raw observation and an unavailable average caused by insufficient reports receive separate explanations.

**Country analysis** opens inline below the globe and retains the selected metric, unit, and smoothing. Trend lines are the default; daily bars are an alternative for suitable measures, with labeled weekly aggregation when histories are long. Charts preserve calendar gaps, signed corrections, and observation-bound tooltips.

**Compare** supports up to four countries with stable colors and shared metric, normalization, smoothing, and date-range controls. Combined lines are the default. Separate charts use synchronized dates and a shared value scale, with an explicit independent-scale option. The interface avoids nested chart scrollbars and unrelated per-country controls.

A central store and URL state retain view, category, metric, unit, smoothing, selected date/country, and comparison settings. Responsive panels, mobile controls, visible focus states, search focus management, Escape navigation, and reduced-motion behavior accompany the new layout. A persistent source notice and methodology dialog distinguish fictional demo values from locally loaded historical observations.

The homepage loads the prepared original Google datasets by default. Fictional data requires an explicit `?data=sample` URL. Older `?data=csv` links remain valid, and missing archive files show recovery controls without a silent switch to demo data.

## Findings addressed

| Area | Finding | Implemented repair |
| --- | --- | --- |
| Installation | Untracked package setup and an unreproducible server dependency. | Pinned manifest/lockfile and documented run, validation, download, and preparation commands. |
| Structure | Duplicate data services, unused fragments, copied configuration, redundant chart paths and styles. | One modular data service, one page, shared chart renderer, a metric registry, central store, and removal of obsolete assets and chart code. |
| Visual design | Saturated category backgrounds, unlabeled controls, weak hierarchy, fragmented country/chart views. | One Midnight Atlas identity, category accents, labeled navigation, a balanced globe workspace, inline analysis, and a dedicated comparison view. |
| Startup and recovery | Fragile script timing, arbitrary loader timing, failed initial CSV load blocking recovery. | Explicit bootstrap/readiness, actionable errors, atomic uploads, and globe recovery after a validated upload. |
| Provenance | Random samples and generated chart fallbacks could appear to be historical data. | Deterministic fictional observations/populations, prominent demo/archive status, actual loaded periods, source links, and no fabricated fallbacks. |
| Metric meaning | Database identifiers leaked into controls; transformations were scattered or unavailable. | Shared friendly labels, daily/cumulative/occupancy semantics, allowed units, smoothing rules, and explanatory descriptions. |
| CSV ingestion | Fragile identifiers, subregion contamination, malformed cells, partial data replacement. | Google identifier aliases, canonical country index, country-only filtering, date/number/duplicate validation, and transactional replacement. |
| Missing observations | Blank values could become zero or be replaced by another date. | Exact-date queries, separate missing/zero/correction states, calendar gaps, and no nearby-date borrowing. |
| Smoothing | A row-based average could cross calendar gaps or imply an unobserved selected day. | Trailing seven-calendar-day mean, complete window, at least five reports, selected-day report required, and range filtering after averaging. |
| Population comparisons | Absolute counts alone obscured differences in country size. | Integrated demographics; per-100,000 values, vaccination percentages, and doses per 100 people with explicit denominator provenance. |
| Map interpretation | Changing scales and insufficient missing/correction context. | Six logarithmic color bands (linear for vaccination percentages) with a fixed full-period domain for each metric/unit/smoothing choice; gray unavailable values with explanations and amber corrections. |
| Performance | Repeated scans, eager colors, large regional downloads, uncontrolled animation work. | Country/date indexes, bounded caches, memoized display domains and series, streaming country-only preparation, cancellable animation, and lifecycle-owned listeners. |
| Geographic rendering | Far-side overlaps, colliding feature identifiers, inaccessible small locations. | Hemisphere clipping, unique features, selected outlines, responsive sizing, and country selection independent of map geometry. |
| Charts and comparison | Busy markers/bars, inconsistent timelines, misleading metric combinations, stale controls. | One measure per chart, meaningful chart alternatives, shared preparation/axes, clear units, labeled aggregation, gap-aware tooltips, and synchronized comparison controls. |
| Security | Imported text interpolated as HTML, repository exposure, permissive debug paths. | Safe text insertion, explicit asset/API routes, no directory listing, same-origin loading, neutral errors, and basic browser headers. |

## Actual five-dataset integration

The supplied original Google CSVs were processed without modifying the downloads. Streaming preparation produced:

| File | National rows |
| --- | ---: |
| `country_level_epidem.csv` | 227,879 |
| `country_level_hospitalizations.csv` | 17,803 |
| `country_level_vaccinations.csv` | 56,031 |
| `small_index.csv` | 246 |
| `country_level_demographics.csv` | 246 |

All five prepared files passed the same normalization, indexing, population, and display APIs used by the browser. The index contains **246 countries/territories**, and **243 have valid positive population denominators**. Dates extend through September 16, 2022; their starts vary by category: December 31, 2019 for epidemiology, December 9, 2019 for hospitalizations, and January 25, 2020 for vaccinations. The controls derive their bounds from the active metric's actual reporting calendar.

The hospitalization source contained **63 invalid or implausible country-level dates**. The explicit preparation policy excludes invalid calendar dates, dates before **2019-12-01**, and dates after the preparation date. Exclusion counts and examples are recorded in `data/prepare-report.json`, exposed by `/api/data-quality`, and summarized in archive methodology. No original date is guessed or rewritten, and source files remain intact. The date policy and optional demographics preparation are covered by regression tests.

Population data is loaded from the optional fifth file. Existing four-file archives and upload recovery remain supported; without usable denominators, normalized results are unavailable. Sample populations are explicitly fictional. Counts, per-100,000 rates, percentages of vaccinated people, and doses per 100 people remain distinct units. Static population estimates are not substituted with invented values or interpolated across dates.

## Validation

JavaScript syntax checks, Node regression tests, and Chrome browser workflows have been exercised after the redesign. Regression coverage includes CSV ingestion and aliases, source/date validation, missingness and corrections, deterministic sample data, population normalization, trailing averages, metric-specific calendars and initial coverage-based dates, cache behavior, upload atomicity, server exposure/report endpoints, streaming preprocessing, chart geometry/tooltips, shared comparison scales, URL/store state, and globe lifecycle behavior.

Browser workflows cover desktop, tablet, and mobile exploration, still-globe startup, source/methodology presentation, metric and unit changes, keyboard search, inline country analysis, countries without geometry, comparisons and their four-country limit, shared/separate chart layouts, date controls, URL restoration, failed-CSV upload recovery, the original archive as the default, and explicit demo/archive switching. Screenshots were reviewed alongside browser assertions. Final verification passed: JavaScript syntax checks, all **69 Node regression tests**, and all **8 Chrome browser workflows**, including the real archive.

## Remaining practical limits

- Country-only CSVs are parsed and retained in browser memory. The initial full-period smoothed domain has a measurable computation cost; later domain queries use a cache. A server-side country/date query API remains a useful future performance improvement.
- Simplified globe geometry omits some small countries and territories. Search continues to expose their observations.
- Reporting coverage, definitions, revisions, and static population estimates vary. Normalization and successful ingestion do not remove those limitations or certify the observations' clinical accuracy.
- The date filter addresses identified malformed dates. Other source errors may remain, and retained dates/values are preserved as supplied.
- Some rendering/UI modules still use an explicit browser-global API alongside ES modules. Responsibilities are separated and tested; migration of those remaining modules can be incremental.
- Shared URLs restore exploration settings but do not contain uploaded files. Uploads must be supplied again in a new tab or session.
