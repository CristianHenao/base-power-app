# Alejandro's tickets

Data, story and glue (playbook T-01). Ordered by what unblocks the team first.
Done means `make data` rebuilds features from scratch and `docs/DATA_SOURCES.md` lists
every source with license and as-of date.

| # | Ticket | Unblocks | Status |
|---|---|---|---|
| A1 | EAGLE-I download + Texas-only parquet + 3-county subset | Nolan (events, outlook) | done: #20, #28 (2023 `sum` header, demo parquet) |
| A2 | ERCOT RTM load-zone prices | Nolan (grid value) | superseded by Nolan's `ercot_prices.py`; #23 closed (LZ/LZEW double count flagged) |
| A3 | County crosswalk: FIPS -> ERCOT weather zone | Nolan, Victor | done: #21 |
| A4 | Base availability YAML: utility -> Base offer, with source URL and date | report page | done: #24 |
| A5 | ZIP -> utility candidates (NREL + PUCT Power to Choose) | Victor (address flow) | done: #30 |
| A6 | EIA-861 county-utility crosswalk + real territory shapes | Christian (/utility-map) | done: #26 |
| A7 | NRI, ACS, reliability, outlook, scarcity into the map and features.duckdb | map layers | done: #29 |
| A8 | Marquee storm labels + persona anchor addresses; hand-check persona numbers | 1 PM gate | todo |
| A9 | `make data` target + DATA_SOURCES.md | done criterion | in review |
| A10 | Story: H-01 questions to Base, insight charts with Nolan, demo script, README skeleton, safety video, submit | video | todo (human) |

## A1 EAGLE-I
- Source: Figshare article 24237376 v4 (2014-2025). We pull 2018-2025 (RATES_START) plus MCC.csv, DQI.csv, coverage_history.csv.
- Raw: data/raw/eaglei/eaglei_outages_YYYY.csv, data/raw/reference/MCC.csv (paths in pipeline/settings.py).
- Output: data/processed/eaglei_tx.parquet (state == Texas, all years) and a Collin/Harris/Travis subset so the demo never waits on the full build.
- Accept: row counts per year logged; FIPS zero-padded to 5; timestamps UTC; test on a tiny fixture.

## A2 ERCOT prices
- `gridstatus.Ercot().get_rtm_spp(year)`, keep load zones and hubs only.
- Watch the fall-back DST hour: keep both intervals, key on UTC.
- Superseded: Nolan's pipeline/sources/ercot_prices.py (gridstatus). Keep one row per (zone, interval): LZ and LZEW both say "Load Zone".

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
