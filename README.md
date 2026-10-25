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
- A modern browser.
- An internet connection to install dependencies and download the original datasets.

## Run locally

The commands below work on **Windows** (PowerShell or Command Prompt), **macOS**
(Terminal with zsh or Bash), and **Linux** (a terminal with Bash).

Clone the repository and install dependencies:

```text
git clone https://github.com/Adam-Zouari/COVID-19-Global-Visualisation.git
cd COVID-19-Global-Visualisation
npm ci
```

Download the five Google datasets and prepare them for the website:

```text
npm run download-data
npm run prepare-data -- datasets/google
```

**CSV files are excluded from Git.** A fresh clone needs this preparation step
before the historical archive can load.

Start the server:

```text
npm start
```

Preparation writes to `data/` by default, and `npm start` automatically serves
those files on port `3000`.

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

The globe, country analysis, and Compare retain independent settings. Shared URLs
restore your selections. Uploaded CSV contents are temporary and are not included
in shared links.

Country scatter plots can pair metrics from different datasets. Comparison scatter
plots use two or three countries as axes, with each point representing a date.

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

The downloader saves the original Google CSVs in `datasets/google/`, including
regional records. It skips completed downloads and can be rerun after an
interruption.

Preparation reads those files and creates the smaller files used by the website:

1. **Keep national records.** State, province, and other subregion rows are
   excluded because the globe and comparisons operate at country level. National
   totals are taken from the source; regional values are not added together.
2. **Check dates.** Keep dated observations only when the date is valid and falls
   between **December 1, 2019** and the day preparation runs.

   The project includes the full month when the outbreak was first reported.
   [WHO's timeline](https://www.who.int/news/item/29-06-2020-COVIDtimeline)
   records the Wuhan pneumonia cluster on December 31, 2019. Earlier dates, such
   as Argentina's `2019-03-30`, fall outside this period. Those rows are skipped;
   their dates are not rewritten, and the original files remain unchanged.
3. **Validate structure.** Files must contain country identifiers and the required
   date, country-name, or population columns. Missing required columns or duplicate
   headers stop preparation.
4. **Preserve observations.** Retained rows keep their source columns and values,
   including missing values, reported zeros, and negative corrections. Preparation
   does not fill gaps, calculate averages, or rewrite source dates.
5. **Write prepared files.** The output names are listed in the table above. If
   dates were excluded, `prepare-report.json` records the date rule, row counts,
   and examples for review. The original downloads remain unchanged.

If you already have the prepared CSVs, copy them into `data/` and skip downloading
and preparation. The three observation tables and country index are required.
The population file is optional: counts work without it, but population-adjusted
units need valid population estimates.

By default, preparation refuses to replace existing outputs. To regenerate the
prepared files in `data/`, explicitly allow replacement:

```text
npm run prepare-data -- datasets/google --overwrite
```

New outputs are validated before replacement; failed validation preserves the
existing prepared files. Original downloads remain unchanged. Stop the server
before replacing its data, and keep source and output folders separate.

The archive contains historical observations through September 2022. Reporting
periods and coverage vary by country and metric. Missing observations remain
unavailable; reported zeros and negative reporting corrections are preserved.

## Optional configuration

Use these settings if you want to use a different data folder, port, or listening
address.

The server accepts these environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Local server port |
| `HOST` | `127.0.0.1` | Interface the server listens on |
| `DATA_DIR` | `data/` in the project | Directory containing prepared CSV files |

To prepare a separate copy in `data-next/`:

```text
npm run prepare-data -- datasets/google data-next
```

To serve this copy on port `3001`, choose the example for your terminal:

**Windows — PowerShell:**

```powershell
$env:DATA_DIR = "data-next"
$env:PORT = "3001"
npm start
```

**Windows — Command Prompt:**

```bat
set "DATA_DIR=data-next"
set "PORT=3001"
npm start
```

**macOS and Linux — zsh or Bash:**

```bash
DATA_DIR=data-next PORT=3001 npm start
```

Set only the variable you need, or use plain `npm start` for the defaults in a
fresh terminal. PowerShell and Command Prompt retain these settings for the
current terminal session; the zsh/Bash example applies them to that command only.

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

## Tests

These are development checks; you do not need to run them to use the website.
The commands work on Windows, macOS, and Linux.

Check JavaScript syntax and run the Node tests for data handling, calculations,
state, charts, and other application behavior:

```text
npm run check
npm test
```

**Playwright** checks website interactions in its own Chromium browser, including
controls, charts, sliders, and saved views. Install the matching browser once
after `npm ci` (and again after upgrading Playwright), then run the tests:

```text
npx playwright install chromium
npm run test:e2e
```

Playwright uses this downloaded browser regardless of your default browser. See
[Playwright's browser documentation](https://playwright.dev/docs/browsers).

To watch the browser while the tests run:

```text
npm run test:e2e -- --headed
```

Playwright starts and stops its own server on port `3100`; you do not need to run
`npm start` separately for these tests. Failed tests can save screenshots and
traces in `test-results/` for debugging. That folder is excluded from Git. Some
browser checks use the prepared archive, so complete data preparation before
running the full suite.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| PowerShell blocks `npm.ps1` | Use `npm.cmd` instead of `npm`, such as `npm.cmd start`. Both run the same npm tool. For `npx`, use `npx.cmd` if needed. |
| Chromium cannot start on Linux because system libraries are missing | Run `npx playwright install --with-deps chromium` to install the browser and required system libraries. |
| Data files are unavailable | Download and prepare the datasets, or place the prepared files in `data/`. Check `DATA_DIR` if using another folder. |
| Preparation reports that an output already exists | Add `--overwrite` to regenerate the prepared files, or use a new destination folder and point `DATA_DIR` at it. |
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
