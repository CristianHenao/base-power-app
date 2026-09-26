# Data sources

Every number Porchlight shows comes from one of these sources. Raw files live in
`data/raw` (gitignored); `make data` downloads them and rebuilds everything derived.
Outage data is county-level: it describes homes in a county, never one home.

As of September 26, 2026.

## Sources

| Source | What we use it for | As of | License | Fetched by | Owner |
|---|---|---|---|---|---|
| [EAGLE-I recorded outages 2014-2025](https://doi.org/10.6084/m9.figshare.24237376.v4) (ORNL, Figshare v4) | 15-minute customers out by county, 2018-2025; outage events, durations, outlook | 2025-12-31 | CC BY 4.0 | `pipeline.download` | Alejandro, Nolan |
| EAGLE-I `MCC.csv` (same release) | Modeled customers per county, 2022 | 2022 | CC BY 4.0 | `pipeline.download` | Alejandro |
| [ERCOT backcasted (actual) load profiles](https://www.ercot.com/mktinfo/loadprofile/alp) | 15-minute household load on real storm dates; backup hours | yearly files through 2025 | ERCOT public market information | `pipeline.download` | Nolan |
| ERCOT RTM load zone and hub prices, NP6-785-ER (via [gridstatus](https://github.com/gridstatus/gridstatus)) | Scarcity hours and battery value by load zone | 2025-12-31 | ERCOT public market information; gridstatus is BSD-3 | `pipeline.sources.ercot_prices` | Nolan |
| [ERCOT Load Profiling Guide App. D, Profile Decision Tree](https://www.ercot.com/files/docs/2024/04/30/Appendix_D_Profile_Decision_Tree_050124.xlsx) (`ZipToZone`) | ZIP to ERCOT weather zone | 2024-05-01 | ERCOT public market information | `pipeline.download` | Alejandro |
| [Census 2020 ZCTA-to-county relationship file](https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/) | ZIP to county, by land area | 2020 | U.S. Government work, public domain | `pipeline.download` | Alejandro |
| Census cartographic boundary counties, 2010 20m (via [plotly/datasets](https://github.com/plotly/datasets)) | County shapes; utility territories dissolved from them | 2010 | Public domain source; mirror is MIT | `pipeline.download` | Alejandro |
| [EIA-861, 2024](https://www.eia.gov/electricity/data/eia861/) | Utility service territories by county, customers, SAIDI and SAIFI with and without major event days | 2024 | U.S. Government work, public domain | `pipeline.download` | Alejandro |
| [FEMA National Risk Index, counties](https://hazards.fema.gov/nri/) (ArcGIS feature service) | Weather and flood hazard layers | December 2025 | U.S. Government work, public domain | `pipeline.download` | Alejandro |
| [ACS 5-year 2020-2024, table B25032](https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/) | Owner-occupied single-family homes per county (area level only, never used to target anyone) | 2024 | U.S. Government work, public domain | `pipeline.download` | Alejandro |
| [NREL/OpenEI utility look-up by ZIP, 2024](https://data.openei.org/submissions/8563) | Bundled utilities (co-ops, munis) per ZIP | 2024 | CC BY 4.0 | `pipeline.download` | Alejandro |
| [PUCT Power to Choose](http://www.powertochoose.org/) | Wires company (TDU) per competitive ZIP; plan data is discarded | 2026-09-26 | Public State of Texas site | `pipeline.download --with-ptc` | Alejandro |
| [Base pricing page](https://www.basepowercompany.com/pricing), hand-built into `data/reference/base_availability.yaml` | Which Base offer applies per utility; no prices | 2026-09-26 | Facts from Base's public site; confirm with Base | by hand | Alejandro |
| `src/lib/backup/appliance-loads.json`, hand-built | Typical appliance watts for the "must stay on" list | 2026-09-25 | Sources per value in the file | by hand | Alejandro |

## Derived files

| File | Built by | Tracked in git |
|---|---|---|
| `data/processed/eaglei_tx.parquet` (139 MB), `data/raw/eaglei_tx/` | `pipeline.sources.eaglei_texas` | no |
| `data/processed/eaglei_demo.parquet` (Collin, Harris, Travis) | `pipeline.sources.eaglei_texas` | yes |
| `data/processed/county_weather_zone.csv` | `pipeline.sources.crosswalk` | yes |
| `data/processed/events_texas.parquet`, `outlook.parquet`, `backtest.json` | `pipeline.backtest` | yes |
| `data/processed/grid_value.parquet` | `pipeline.grid_value` | yes |
| `data/processed/insights.json`, `tail_share.parquet` | `pipeline.insights` | yes |
| `data/processed/county_utility.csv` | `pipeline.sources.eia861` | yes |
| `data/processed/zip_utility.csv` | `pipeline.sources.zip_utility` | yes |
| `public/utility-map/data/*` (P-04 sales map) | `pipeline.sources.eia861`, then `pipeline.map_layers` | yes |
| `data/features.duckdb` | `pipeline.features` (report tables), `pipeline.map_layers` (`county_layers`, `utility_reliability`) | yes |

## Known limits

- **EAGLE-I undercounts big storms.** It scrapes utility outage maps, which fail under load. For example, Harris shows 456k customers out in Uri, while CenterPoint reported about 1.4M. A zero doesn't always mean no outage. Rates start in 2018, when coverage is fuller.
- **EAGLE-I headers change by year.** 2023 names the outage column `sum`, and 2024 adds `total_customers`. Both loaders handle this.
- **EAGLE-I timestamps have no timezone.** We read them as UTC.
- **Customer splits between utilities in a county are estimates.** They're fitted to EIA-861 utility totals and EAGLE-I county totals. Primary utilities are reliable; secondary shares in big metros are rough.
- **Utility territories are whole counties merged.** They overstate coverage and overlap. Use them for display only.
- **County load zones are approximate.** ERCOT publishes no county-to-load-zone table.
- **ERCOT prices list each load zone twice** (`LZ` and energy-weighted `LZEW`). Count one per interval.
- **NREL's ZIP file omits the competitive wires companies** (Oncor, CenterPoint, AEP Texas, TNMP). That's why competitive ZIPs come from Power to Choose.
- **ZIP-to-utility is ambiguous.** 1,146 ZIPs have more than one candidate, so the app always asks the user to confirm.
