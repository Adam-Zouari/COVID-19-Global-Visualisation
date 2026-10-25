# COVID-19 Atlas

An interactive globe for exploring historical COVID-19 data from Google Open
Data. Follow cases, deaths, hospitalizations, and vaccinations across countries
and dates, inspect one country's trends, or compare countries side by side.

The interface uses HTML, CSS, JavaScript, D3.js, and TopoJSON. A small Node.js and
Express server serves the application and its prepared CSV files.

## Features

- Interactive 3D globe with country search, rotation, zoom, and a full-screen workspace.
- Date navigation with a slider, editable dates, previous/next arrows, and adjustable playback speed.
- Daily values and seven-day averages, with counts and population-adjusted units where applicable.
- Country analysis and comparisons of up to four countries, or three for scatter plots.
- Line, bar, area, heatmap, scatter, dumbbell, and box plots, depending on the workspace.
- Light, dark, and system appearance, responsive layouts, and keyboard navigation.
- Shareable URLs that retain the selected country, metric, date, and comparison settings.

## Requirements

- **Node.js 24 or newer**, or Node.js **22.13 or newer within the 22.x line**.
- npm and Git available on `PATH`.
- A modern browser. Browser tests use installed Google Chrome.
- An internet connection to install dependencies and download the original datasets.

## Run locally

Clone the repository and install dependencies:

```bash
git clone https://github.com/Adam-Zouari/COVID-19-Global-Visualisation.git
cd COVID-19-Global-Visualisation
npm ci
```

Download the five Google datasets and prepare them for the website:

```bash
npm run download-data
npm run prepare-data -- datasets/google
```

**CSV files are excluded from Git.** A fresh clone needs this preparation step
before the historical archive can load.

Start the server:

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000). Keep the terminal open while
using the website, and stop the server with **Ctrl+C**. There is no build step.

Downloading and preparation are only needed once. On later visits, run
`npm start` from the project directory.

To try the interface without downloading the archive, run `npm start` after
installing dependencies and open
[the fictional demo](http://localhost:3000/?data=sample). Its observations and
population values are simulated.

## Use the website

1. Choose **Cases & deaths**, **Hospitalizations**, or **Vaccinations**, then select a metric, display unit, and reporting mode.
2. Use the timeline to select a date, enter it manually, or play through the available reporting dates.
3. Select a country on the globe or through search. Open **Explore country data** for charts and a custom date range.
4. Add countries to **Compare**, then choose a chart, metric, unit, and period.
5. Collapse Explorer settings or expand the globe for more viewing space. The full-screen workspace retains the timeline, settings, and country snapshot.
6. Use the appearance control to choose Light, Dark, or System. Copy the page URL to share the current view.

| Workspace | Available charts |
| --- | --- |
| Explore country data | Line, bar, area, calendar heatmap, scatter, and box plot |
| Compare | Line, bar, horizontal bars, heatmap, scatter, dumbbell, and box plot |

Country scatter plots can pair columns from different loaded datasets. Comparison
scatter plots use two countries as X/Y axes or three as X/Y/Z axes. Each point
represents a date with reported values for every selected axis.

Uploaded CSVs stay in the current browser tab and are not included in shared URLs.

## Data sources and preparation

The application uses five tables from
[Google COVID-19 Open Data](https://github.com/GoogleCloudPlatform/covid-19-open-data):

| Original file | Contents | Prepared file |
| --- | --- | --- |
| `epidemiology.csv` | Cases, deaths, recoveries, and testing | `country_level_epidem.csv` |
| `hospitalizations.csv` | Admissions, occupancy, ICU, and ventilation | `country_level_hospitalizations.csv` |
| `vaccinations.csv` | Vaccinated people and administered doses | `country_level_vaccinations.csv` |
| `index.csv` | Country identifiers and names | `small_index.csv` |
| `demographics.csv` | Population estimates | `country_level_demographics.csv` |

```text
datasets/google/       Original downloads, including regional records
        |
        v
scripts/prepare-data.js
        |
        v
data/                  Prepared country-level CSVs used by the website
```

The downloader preserves completed files and can be rerun after an interrupted
download. Preparation keeps country-level records, preserves their reported
values, and excludes invalid or out-of-range dates. When dates are excluded,
`data/prepare-report.json` records the reasons and examples. The original
files remain untouched.

You can also place the five prepared CSVs directly in `data/` and skip downloading
and preparation. Population data is optional, but population-adjusted units need
valid population estimates.

Preparation refuses to overwrite existing outputs. To prepare another copy and
use it with the server, choose a new output folder. For example, in Bash:

```bash
npm run prepare-data -- datasets/google data-next
DATA_DIR=data-next npm start
```

The archive contains historical observations through September 2022. Reporting
periods and coverage vary by country and metric. Missing observations remain
unavailable; reported zeros and negative reporting corrections are preserved.

Daily reporting is the default. A seven-day average uses the selected day and
previous six calendar days, requires a full window, at least five reports, and a
report on the selected day. Missing days are not treated as zero. Cumulative
metrics remain unsmoothed.

## Configuration

The server reads these environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Local server port |
| `HOST` | `127.0.0.1` | Interface the server listens on |
| `DATA_DIR` | `data/` in the project | Directory containing prepared CSV files |

For a different port, in Bash:

```bash
PORT=3001 npm start
```

## Project structure

```text
index.html             Page entry point
src/
  app.js               Application startup and saved-view restoration
  dataService/         CSV loading, validation, metrics, and data queries
  globe/               Globe rendering, country selection, and interactions
  charts/              Chart models, rendering, axes, and tooltips
  ui/                  Search, navigation, appearance, and workspace controls
styles/                Shared, chart, and comparison styles
assets/                Icons and other static assets
server/                Express server and data endpoints
scripts/               Download, preparation, and syntax-check commands
tests/                 Node regression tests
e2e/                   Playwright browser tests
docs/                  Audit record and design references
datasets/google/       Original CSV downloads; excluded from Git
data/                  Prepared CSVs and data-quality report; excluded from Git
```

See [the audit record](docs/AUDIT.md) for implementation decisions, data handling,
known limitations, and verification history.

## Tests

Run syntax checks and the Node test suite:

```bash
npm run check
npm test
```

With Google Chrome installed, run the browser tests:

```bash
npm run test:e2e
```

Playwright starts a separate server on port `3100`. Screenshots and failure traces
are written to `test-results/`, which is excluded from Git. Some browser checks
use the prepared archive, so complete data preparation before running the full
suite.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Data files are unavailable | Download and prepare the datasets, or place the prepared files in `data/`. Check `DATA_DIR` if using another folder. |
| Preparation reports that an output already exists | Use a new destination folder and point `DATA_DIR` at it. Existing files are preserved. |
| The server port is already in use | Stop the other server or choose a different `PORT`. |
| A country or chart has no data | Try another metric or date range. Reporting gaps and missing population estimates can make values unavailable. |

## License

Copyright (c) 2026 Adam Zouari.

COVID-19 Atlas's source code and project documentation are available under the
[PolyForm Strict License 1.0.0](LICENSE). This is a source-available license:
it permits noncommercial use under its terms but does not grant permission to
modify or redistribute the software. Uses outside those permissions require a
separate license from the copyright holder.

Google's datasets and third-party dependencies retain their own upstream
licenses. The project license does not replace those terms.
