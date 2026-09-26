# Alejandro's tickets

Data, story and glue (playbook T-01). Ordered by what unblocks the team first.
Done means `make data` rebuilds features from scratch and `docs/DATA_SOURCES.md` lists
every source with license and as-of date.

| # | Ticket | Unblocks | Status |
|---|---|---|---|
| A1 | EAGLE-I download + Texas-only parquet + 3-county subset | Nolan (events, outlook) | done: 0abef63 (Alejandro), 5c1b178 (Nolan: 2023 `sum` column, outputs built) |
| A2 | ERCOT RTM load-zone prices 2018-2025 via gridstatus (DST-safe) | Nolan (grid value) | done by Nolan: 8e69a00, 27843d5 (LZ only, not LZEW; hubs; 2018) |
| A3 | County crosswalk: FIPS -> ERCOT weather zone, load zone | Nolan, Victor | weather zone done: 2427ba0; load zone todo (demo counties in pipeline/settings.py) |
| A4 | Base availability YAML: utility -> Base offer, with source URL and date | report page | todo |
| A5 | ZIP -> utility lookup (NREL/OpenEI 2024) | Victor (address flow) | todo |
| A6 | EIA-861 service territory crosswalk + real territory shapes (replace P-04 mock) | Christian (/utility-map) | todo |
| A7 | NRI, EIA-861 reliability, ACS into data/features.duckdb | map layers, outlook prior | todo |
| A8 | Marquee storm labels + persona anchor addresses; hand-check persona numbers | 1 PM gate | storm labels done by Nolan: 073112e (settings.STORM_LABELS); addresses and hand check todo |
| A9 | `make data` target + DATA_SOURCES.md | done criterion | todo |
| A10 | Story: H-01 questions to Base, insight charts with Nolan, demo script, README skeleton, safety video, submit | video | todo (human) |

## A1 EAGLE-I
- Source: Figshare article 24237376 v4 (2014-2025). We pull 2018-2025 (RATES_START) plus MCC.csv, DQI.csv, coverage_history.csv.
- Raw: data/raw/eaglei/eaglei_outages_YYYY.csv, data/raw/reference/MCC.csv (paths in pipeline/settings.py).
- Output: data/processed/eaglei_tx.parquet (state == Texas, all years) and a Collin/Harris/Travis subset so the demo never waits on the full build.
- Accept: row counts per year logged; FIPS zero-padded to 5; timestamps UTC; test on a tiny fixture.
- Shipped: `python -m pipeline.sources.eaglei_texas` runs in about 6 s; 19.6M Texas rows 2018-2025. eaglei_tx.parquet is
  139 MB, so it is gitignored; eaglei_demo.parquet (5.7 MB) is committed.

## A2 ERCOT prices
- `gridstatus.Ercot().get_rtm_spp(year)`, keep load zones and hubs only.
- Watch the fall-back DST hour: keep both intervals, key on UTC.
- Output: data/processed/ercot_rtm_spp.parquet.
- Shipped: `python -m pipeline.sources.ercot_prices` writes data/raw/ercot_prices/rtm_spp_lz_hub_YYYY.parquet (gitignored, about 17 MB),
  columns interval_start_utc, location, location_type (load_zone or hub), spp. The annual file also has an
  energy-weighted LZEW series under the same zone names; gridstatus labels both "Load Zone", so we rename
  `Settlement Point Type` before parsing and keep LZ only.

## A3 County crosswalk
- 254 Texas counties -> ERCOT weather zone (8) and load zone (LZ_HOUSTON, LZ_NORTH, LZ_SOUTH, LZ_WEST, plus non-ERCOT flag).
- Must agree with DEMO_WEATHER_ZONE in pipeline/settings.py (Collin NCENT, Harris COAST, Travis SCENT).
- Counties split across zones: pick the majority and flag it.

## A4 Base availability
- data/reference/base_availability.yaml: utility, Base product, source URL, as-of date.
- Only published facts; confirm with Base engineers.

## A6 P-04 territories
- EIA-861 Service_Territory file, Texas rows, weight by customers.
- Dissolve Census county shapes by utility; same output shape as public/utility-map/mock/.
