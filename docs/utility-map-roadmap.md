# Utility Map roadmap and tickets

**Implements:** [PRD v3](utility-map-prd-v3.md). **Owner:** Alejandro. **Branch:** `ale-dev`, one PR per phase to Christian.
**Written:** Saturday September 26, 2026, 3 PM CT. **Deadline:** Sunday September 27, 11 AM CT.

## How to read this

- Phases run in order; tickets inside a phase can run in parallel unless "Needs" says otherwise.
- **Priority:** P0 = the demo is broken without it. P1 = the demo is much stronger with it. P2 = nice to have before the deadline.
- **Est** is focused hours with Claude doing the coding.
- Every ticket follows the superpowers loop: failing test, code, passing test, `python -m pytest -q` (and `npm run lint` for UI), commit.

### Conventions used by every ticket

| Thing | Where |
|---|---|
| Raw downloads (gitignored) | `data/raw/<source>/` in the main checkout. The worktree reads them through `PORCHLIGHT_RAW_DIR` (UM-0.1). |
| Normalized tables | `data/processed/utility_map/<name>.parquet` |
| Pipeline code | `pipeline/utility_map/<module>.py`, run as `python -m pipeline.utility_map.<module>` |
| Tests | `tests/utility_map/test_<module>.py` with tiny fixtures in `tests/fixtures/utility_map/` |
| Published data | `public/utility-map/releases/<release_id>/` + `public/utility-map/current.json` |
| Frontend | `src/lib/utility-map/*` (pure logic, tested with `npm run test:web`), `src/components/utility-map/*` |
| County key | 5-character FIPS string, e.g. `"48201"` |
| Python | `/Users/jorgealejandrodiez/Desktop/base-power-app/.venv/bin/python` |

Every normalizer writes three things: the parquet table, a row in `data/processed/utility_map/manifest.json` (source URL, file name, SHA-256, retrieved UTC, rows, period), and a printed summary (rows, counties covered, nulls).

---

## Phase 0: Real data on screen (tonight, P0, ~4 h)

The mockup becomes honest: it loads the real release built from data we already have.

### UM-0.1 Pipeline scaffolding and raw-data path (P0, 0.5 h)
**Goal:** one place for utility-map pipeline code, and the worktree can read raw files from the main checkout.
**Steps:**
1. In `pipeline/settings.py`, add `RAW_DIR = Path(os.environ.get("PORCHLIGHT_RAW_DIR", REPO_ROOT / "data" / "raw"))` and `UTILITY_MAP_DIR = REPO_ROOT / "data" / "processed" / "utility_map"`. Don't change other paths.
2. Create `pipeline/utility_map/__init__.py` and `pipeline/utility_map/manifest.py` with `sha256(path) -> str` and `record(source_id, url, path, rows, period_start, period_end)`, which upserts into `manifest.json`.
3. Tests: env override is honored; `record` is idempotent for the same source.
4. Add `export PORCHLIGHT_RAW_DIR=~/Desktop/base-power-app/data/raw` to the worktree README section of `CLAUDE.md`.
**Done when:** `python -c "from pipeline import settings; print(settings.RAW_DIR)"` prints the main checkout path in the worktree.

### UM-0.2 Release loader and contract types (P0, 1 h)
**Goal:** the app loads `current.json` → the release, and never shows mock data by accident.
**Steps:**
1. Add `"allowImportingTsExtensions": true` to `tsconfig.json` and `"test:web": "node --test src/**/*.test.ts"` to `package.json` (flag both to Christian in the PR).
2. `src/lib/utility-map/types.ts`: add `schema_version`, `release_id`, `data_mode: "real" | "partial" | "mock"`, nullable `customers`, `eligible_homes`, `base_offer`, `core_coverage_hours`; `quality: Record<LayerId, "ok" | "missing" | "not_applicable">` on counties; `county_weights: {fips, customers_est, share}[]` on utilities; layer `available`, `period_start`, `period_end`, `source_ids`; live `status: "ok" | "stale" | "unavailable"`.
3. `src/lib/utility-map/load.ts`: `resolveDataBase(search: URLSearchParams)` returns `/utility-map/mock` for `?data=mock`, otherwise reads `/utility-map/current.json`; `upgradeV1(data)` fills the new fields for the old mock; `validateContract(data): string[]` checks 254 unique FIPS, finite numbers or null, all layer keys present.
4. In `utility-map-experience.tsx` replace `DATA_BASE` with the loader; show the validation errors in the error panel.
5. Tests (`load.test.ts`): mock upgrade, validation catches NaN and a missing layer key.
**Done when:** `?data=mock` shows the old mockup; no param shows the real release built by the UM-0.3 assembler.

### UM-0.3 Counties served by several utilities (P0, 1 h)
**Goal:** stop crediting a county to whichever utility is listed first (250 of 254 counties are shared).
**Steps:**
1. Export `county_weights` per utility from `data/processed/county_utility.csv` (`county_fips`, `customers_est`, `share`) in the assembler (UM-6.1 builds on this; for now a small `pipeline/utility_map/assemble.py` that copies `public/utility-map/data/*` into a release and adds the new fields).
2. `scoring.ts`: utility score and layer summaries weight by `customers_est` for that utility; homes = Σ county homes × share.
3. Map paint: statewide color = the county's largest-share utility. Clicking a shared county opens a picker in the panel: "Anderson County is served by 3 utilities (estimated split): Oncor 80%, Houston County Co-op 12%, …".
4. Selecting a utility highlights *all* its counties, including ones where it is not the largest.
5. Tests: two utilities sharing a county don't both get the full homes; the score uses the split.
**Done when:** Oncor's homes total equals the sum of its county shares, and clicking Anderson County shows the picker.

### UM-0.4 Honest labels (P0, 1 h)
**Goal:** nothing on screen claims more than the data supports.
**Steps:**
1. Offer not in `base_availability.yaml` → `base_offer: null`, shown as "Offer not verified". Remove "Base doesn't serve X today". Unknown offer gets its own list group "Offer not verified".
2. Each layer row gets an ⓘ (`<details>`) with unit, source, period, "estimate", and counts of ok/missing/not applicable counties.
3. Values format from the layer's unit, not hard-coded strings (today outages wrongly say "h per customer / yr").
4. Stamp: `data_mode` → "Mockup · dummy data", "Partial release · estimates" or "Real data · estimates", plus the release date.
5. Live strip: `status: "unavailable"` → "Live warnings unavailable", never "No active NWS warnings".
**Done when:** a browser pass finds no "Not served", "No active warnings" (while live is off) or wrong units.

### UM-0.5 Layer registry, lenses and modes scaffold (P0, 0.5 h)
**Goal:** the UI knows about all 13 layers and 4 modes before their data exists.
**Steps:**
1. `LayerId` grows to the 13 IDs in PRD v3 §5 with a `group: "grid" | "hazard" | "exposure"`. Layers with `available: false` render disabled with "Coming in this release" and the reason.
2. Presets become the five lenses (PRD v3 §6). Keep "Custom".
3. Add the mode switch (Risk, Heatmap, Grid, Base fleet); only Risk works for now, others show "Loading data…" placeholders.
**Done when:** toggling any available layer re-scores; unavailable ones can't be toggled.

---

## Phase 1: Grid consumption and capacity (P0/P1, ~5 h)

### UM-1.1 Utility sales and peak demand from EIA-861 (P0, 1 h)
**Source:** EIA-861 2024 (already in `data/raw/eia861/`): `Operational_Data_2024.xlsx` sheet `States` (Summer Peak Demand, Winter Peak Demand in MW; Sales to Ultimate Customers in MWh), `Sales_Ult_Cust_2024.xlsx` sheet `States` (residential MWh and count), `Delivery_Companies_2024.xlsx` (wires companies' delivered MWh).
**Steps:**
1. `pipeline/utility_map/eia_grid.py`: read with `header=2`, strip column names at the first newline, keep `State == "TX"`. EIA writes blanks as `"."`: convert with `pd.to_numeric(errors="coerce")`.
2. Output `utility_grid.parquet`: `utility_id, summer_peak_mw?, winter_peak_mw?, sales_mwh?, residential_mwh?, residential_customers?, peak_source ("eia861" | "ercot_zone_estimate" | null)`.
3. Tests with a 3-row fixture, including a `"."` row.
**Known gap:** CenterPoint and AEP Texas report no peak (they are wires-only). UM-1.2 fills them.
**Done when:** Oncor shows 30,509.7 MW, Austin Energy 3,110 MW.

### UM-1.2 ERCOT hourly load by weather zone (P0, 1 h)
**Source:** ERCOT Hourly Load Data Archives, https://www.ercot.com/gridinfo/load/load_hist, files `Native_Load_2018.zip` … `Native_Load_2025.zip` (one xlsx each: `Hour Ending`, `COAST`, `EAST`, `FWEST`, `NORTH`, `NCENT`, `SOUTH`, `SCENT`, `WEST`, `ERCOT`).
**Steps:**
1. `pipeline/utility_map/ercot_load.py download` saves the zips to `data/raw/ercot_load/`.
2. Parse: `Hour Ending` is Central time with "24:00" and a DST "02:00" duplicate marked in some years; convert to UTC hour start, keep both duplicate hours.
3. Output `zone_load.parquet` (`weather_zone, hour_start_utc, load_mw`) and `zone_peaks.parquet` (`weather_zone, year, summer_peak_mw, winter_peak_mw, top100_mean_mw`).
4. Fallback peak for wires utilities without an EIA peak: zone peak × (utility customers in that zone ÷ all customers in the zone), using the county-utility split and `county_weather_zone.csv`. Mark `peak_source = "ercot_zone_estimate"`.
5. Tests: DST fall-back day has 25 rows; spring-forward has 23.
**Done when:** CenterPoint gets an estimated peak labeled as an estimate.

### UM-1.3 County peak demand layer (P0, 0.5 h)
**Steps:** county `peak_demand` = Σ over its utilities (utility peak × utility's share of its customers in that county). Rank across Texas. Unit "MW, estimated 2024 summer peak".
**Done when:** Harris is in the top five counties, and county values sum to each utility's peak within 1%.

### UM-1.4 Local generation from EIA-860 (P1, 1.5 h)
**Source:** EIA-860 2024, https://www.eia.gov/electricity/data/eia860/ → `eia8602024.zip`: `2___Plant_Y2024.xlsx` (Plant Code, State, County, Latitude, Longitude, Balancing Authority Code) and `3_1_Generator_Y2024.xlsx` sheet `Operable` (Plant Code, Generator ID, Nameplate Capacity (MW), Technology, Energy Source 1). Both have one title row: `header=1`.
**Steps:**
1. Join generators to plants on Plant Code; keep State = TX; map County name to FIPS with the same `_county_key` used in `pipeline/sources/eia861.py`; unmatched names fail the build.
2. Output `county_generation.parquet` (`county_fips, nameplate_mw, mw_by_fuel{solar, wind, gas, coal, nuclear, storage, other}`) and `public/.../generators.geojson` (one point per plant, `mw`, `fuel`).
3. Layer `generation` = county nameplate MW (rank). Also compute `gap_mw = peak_demand − generation` for the Grid panel.
**Done when:** statewide total operable nameplate is within 5% of EIA's published Texas total for 2024.

### UM-1.5 Grid mode UI (P1, 1 h)
**Steps:**
1. Grid mode paints counties by `peak_demand` (sequential blue ramp, separate from the orange risk ramp) and draws generator circles (radius ∝ √MW, color by fuel, legend).
2. Utility panel "Grid" card: residential sales (GWh/yr), summer peak (MW, with source), local generation (MW), and a one-line honest note: "ERCOT is one connected grid; generation inside a territory is not reserved for it."
**Done when:** switching to Grid mode on Oncor shows all four numbers with sources.

---

## Phase 2: Base fleet effect (P0, ~4 h)

### UM-2.1 Long-outage hours and backup coverage from EAGLE-I (P0, 1.5 h)
**Source:** `data/processed/events_texas.parquet` (already built from EAGLE-I 2018–2025) and `pipeline/events.py` functions `customer_durations(customers_out, order="stay")` and `coverage(durations, weights, backup_h)` (import only, don't edit).
**Steps:**
1. `pipeline/utility_map/outages.py`: for each county and year in 2018–2024, get customer durations per event, keep durations ≥ 12 h, sum `duration × customers` → `long_customer_hours`. Divide by (MCC customers × years with data) → `long_hours_per_customer_year`.
2. `coverage_12h` = Σ min(d, 12) × w / Σ d × w over the same long-outage durations.
3. Output `county_outages.parquet` (`county_fips, long_hours_per_customer_year, coverage_12h, years_observed, quality`). Counties with < 5 usable years → `quality = "missing"`.
4. Tests: one synthetic 20-hour outage for 100 customers over one year of 1,000 customers → 2.0 h per customer-year and coverage 0.6.
**Done when:** the `outages` layer reads this table instead of the outlook rate, and Harris shows Beryl-era values that pass a sanity check against `docs/persona-check.md`.

### UM-2.2 Fleet math (P0, 1 h)
**Steps:**
1. `src/lib/utility-map/fleet.ts`, pure: `fleetScenario(utility, counties, share, battery, grid)` returns `{cores, storageMwh, nameplateMw, dispatchMw2h, peakShare, backupCustomerHours, spikeMwh}` using PRD v3 §8 exactly; any missing input → that field `null`.
2. `battery` in the release gains `reserve_fraction: 0.2`, `backup_hours_assumed: 12`, `dispatch_window_h: 2`.
3. Tests: the Oncor worked example (15,336 Cores → 240.5 MW over 2 h); monotonic in share; missing peak → `peakShare: null`.
**Done when:** tests pass and the panel reads from `fleetScenario`.

### UM-2.3 Base fleet mode (P0, 1.5 h)
**Steps:**
1. Map: utilities colored by `peakShare` at the chosen share (green ramp from the style guide, 5 steps, legend "Share of summer peak a Base fleet could supply for 2 h").
2. Panel: horizontal bar "Summer peak 30,510 MW" with the fleet segment in lime; stats: Cores, MWh stored, MW for 2 h, backup customer-hours/yr, price-spike hours/yr in its zone.
3. Fine print: "Idealized ceiling: full charge, 20% reserve, 2-hour window. Not a dispatch commitment."
**Done when:** flipping 1% → 10% visibly recolors the map and the bar grows tenfold.

---

## Phase 3: Flood (P0/P1, ~5 h)

### UM-3.1 NOAA Storm Events and zone crosswalk (P0, 1.5 h; also feeds Phases 4 and 5)
**Source:** NCEI Storm Events bulk CSV, https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/ → `StormEvents_details-ftp_v1.0_d{YEAR}_c*.csv.gz` for 2000–2024. NWS zone–county correlation file, https://www.weather.gov/gis/ZoneCounty (pipe-delimited: `STATE|ZONE|CWA|NAME|STATE_ZONE|COUNTY|FIPS|TIME_ZONE|FE_AREA|LAT|LON`).
**Steps:**
1. `pipeline/utility_map/storm_events.py download` picks the newest `_c` file per year from the directory listing.
2. Keep `STATE_FIPS == 48`. `CZ_TYPE == "C"` → county FIPS `48` + `CZ_FIPS` zero-padded. `CZ_TYPE == "Z"` → expand to every county in that forecast zone via the correlation file (keep `via_zone = True`). Drop marine (`M`).
3. Output `storm_events.parquet`: `event_id, episode_id, event_type, county_fips, begin_utc, end_utc, begin_lat?, begin_lon?, magnitude?, injuries, deaths, damage_usd, via_zone`. Parse damage strings like `"2.5K"`, `"1.2M"`.
4. Also download the Census 2024 Gazetteer county file (`ALAND`) for per-area rates → `county_area.parquet`.
5. Tests: a zone event expands to two counties; `"1.5M"` → 1,500,000.
**Done when:** Harris 2017 includes Hurricane Harvey flood events.

### UM-3.2 Statewide flood layer (P0, 0.5 h)
**Steps:** county `flood` = rank-mean of (a) Flood + Flash Flood event-days per year 2000–2024 from UM-3.1 and (b) the FEMA NRI inland/coastal flood score (already staged in `data/raw/fema/nri_counties_tx.csv`). Keep both components in the ⓘ.
**Done when:** all 254 counties have a value or a stated reason.

### UM-3.3 FEMA flood zones for the 5 demo counties (P0, 2 h)
**Source:** FEMA National Flood Hazard Layer, ArcGIS REST: https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer, layer "Flood Hazard Zones" (`S_FLD_HAZ_AR`; confirm the layer ID, usually 28, from the service page). Backup: county NFHL zip from https://msc.fema.gov/portal/advanceSearch.
**Steps:**
1. `pipeline/utility_map/nfhl.py fetch --fips 48201 48167 48453 48085 48355`: query by county bounding box with `where=1=1&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF&f=geojson&resultOffset=…` paging until done. Save raw pages under `data/raw/nfhl/<fips>/`.
2. Clip to the county polygon (shapely), dissolve by class: `floodway`, `1pct` (A, AE, AH, AO, VE: `SFHA_TF == "T"`), `0.2pct` (X shaded), drop X unshaded. Simplify (tolerance 0.0002°) until each county file ≤ 3 MB.
3. Output `public/.../flood/<fips>.geojson` and `county_sfha.parquet` (`county_fips, sfha_land_pct`).
4. Tests: class mapping, and pct stays within [0, 100].
**Done when:** Harris shows the Buffalo/Brays bayou floodplains; `sfha_land_pct` is shown in the county ⓘ.
**If the service times out:** use the MSC county zip (same fields in `S_FLD_HAZ_AR.shp`).

### UM-3.4 Flood zones on the map (P1, 1 h)
**Steps:** when a demo county is selected or zoom ≥ 8 over it, fetch `flood/<fips>.geojson` and draw fills: floodway dark blue, 1% blue (`--bp-blue-100` at 45%), 0.2% light blue. Legend "FEMA flood zones (effective maps)". Other counties show "Flood-zone polygons: demo counties only".
**Done when:** the 5 counties show polygons; no network requests for others.

---

## Phase 4: Storms, heatmap and overlap (P0/P1, ~6 h)

### UM-4.1 Tornadoes from SPC (P0, 1 h)
**Source:** NOAA SPC Severe Weather Database, https://www.spc.noaa.gov/wcm/#data → `1950-2024_actual_tornadoes.csv` (columns `om,yr,mo,dy,date,time,tz,st,stf,stn,mag,inj,fat,loss,closs,slat,slon,elat,elon,len,wid,ns,sn,sg,f1,f2,f3,f4,fc`).
**Steps:**
1. Keep `st == "TX"`, `yr` 2000–2024, `sg in (1, -9)` (whole-track rows; avoid double counting state segments). Counties from `f1..f4` (county FIPS within state; 0 = none).
2. County `tornado` = Σ (length_miles × (mag + 1)) per county / county land area (1,000 km²) / years. `mag == -9` (unknown) counts as EF0.
3. Points for the heatmap: start points with weight `mag + 1` → `events_tornado.geojson`.
4. Tests: a two-county track credits both; unknown magnitude handled.
**Done when:** the classic North Texas/Panhandle band ranks high.

### UM-4.2 Hail and wind from SPC (P1, 1 h)
**Source:** same page, `1955-2024_hail.csv` and `1955-2024_wind.csv`.
**Steps:** keep TX, 2000–2024, hail `mag ≥ 1.0` inch, wind `mag ≥ 50` knots (58 mph). Assign county from `f1` (fallback: point-in-polygon on `slat/slon`). County `severe_storm` = reports per 1,000 km² per year. Heatmap points `events_severe.geojson` (weight: hail inches, or wind knots ÷ 50).
**Done when:** layer ranks exist for all counties; Panhandle and DFW show hot.

### UM-4.3 Hurricanes and storm surge (P0, 1.5 h)
**Source:** NHC HURDAT2 Atlantic, https://www.nhc.noaa.gov/data/hurdat/ → newest `hurdat2-1851-2024-*.txt`. Storm Events types `Hurricane (Typhoon)`, `Tropical Storm`, `Storm Surge/Tide` from UM-3.1.
**Steps:**
1. Parse header lines (`AL092008, IKE, …`) and fix lines (date, time, status, `29.3N`, `94.7W`, max wind kt). Keep 1980–2024, status `TS` or `HU`.
2. Interpolate each track to 1-hour points. A county "is hit" by a storm when any point with wind ≥ 34 kt lies within 100 km of the county's interior point. County `hurricane` = Σ over storms of (max wind at closest approach ÷ 64) per decade, plus Storm Surge/Tide event-days for coastal counties as a second component.
3. Heatmap points `events_hurricane.geojson` (hourly points inside a Texas buffer, weight wind ÷ 64).
4. Tests: a synthetic straight track 50 km from a county hits it, 150 km away doesn't.
**Done when:** Galveston, Harris and Nueces rank in the top fifth; Harvey, Ike and Beryl appear.

### UM-4.4 Heatmap mode (P0, 1.5 h)
**Steps:**
1. Assembler merges the hazard point files that belong to the active lens into `events.geojson` properties `{hazard, weight, year}`; each file ≤ 5 MB (thin to one point per storm-hour and round coordinates to 3 decimals).
2. Add a Mapbox `heatmap` layer (`heatmap-weight` from `weight`, `heatmap-radius` 8→30 px by zoom, `heatmap-intensity` 0.6→2), filtered to the active hazards; colors: the style guide's warm ramp. County fills drop to 25% opacity in this mode.
3. Legend: "Historical events 2000–2024 (hurricanes 1980–2024)". Heatmap is context, not the score.
**Done when:** switching lens between Hurricane season and Severe storms visibly moves the heat.

### UM-4.5 Overlap count and validation (P0, 1 h)
**Steps:**
1. `scoring.ts`: `overlapCount(county, activeHazards)` = number of active hazard layers with rank ≥ 0.8. Show "Top-fifth in 3 of 6 hazards" in tooltips and panels; the county list can sort by it.
2. `pipeline/utility_map/validate_hazards.py`: Spearman correlation of each hazard layer (and the composite) with `outages` across counties; writes `hazard_validation.json`. The methods ⓘ shows it: e.g. "Winter freeze vs long outages: ρ = 0.41".
**Done when:** numbers are in the release and on screen; any hazard with ρ < 0.1 is labeled "weak link to outages" in its ⓘ.

---

## Phase 5: Summer peak, winter freeze, outages and price spikes (P1, ~3 h)

### UM-5.1 Winter and heat layers (P1, 1 h)
**Source:** `storm_events.parquet` from UM-3.1.
**Steps:** `winter` event-days/yr from `Winter Storm`, `Ice Storm`, `Extreme Cold/Wind Chill`, `Cold/Wind Chill`, `Frost/Freeze`, `Heavy Snow`, `Blizzard`, `Winter Weather`. `heat` event-days/yr from `Heat` and `Excessive Heat`. Event-days = unique (county, local date) so a multi-row storm counts once per day. Heatmap points: county interior points weighted by event-days (Storm Events has no lat/lon for zone events).
**Done when:** February 2021 (Uri) appears for all five demo counties.

### UM-5.2 Price spikes from ERCOT prices, our own build (P1, 1 h)
**Source:** `data/raw/ercot_prices/rtm_spp_2019.parquet` … `2024` (already downloaded; columns `interval_start_utc, settlement_point, point_type, price`).
**Steps:** load-zone points only (`LZ_*`); hours ≥ $1,000/MWh = Σ interval duration (15 min) per zone-year; require ≥ 99% of intervals per year; mean over complete years. Counties inherit their load zone (already approximate in the crosswalk, labeled). Non-ERCOT → `not_applicable`. Sensitivity at $500 and $2,000 goes into the ⓘ.
**Done when:** the layer matches `pipeline/grid_value.py` output within rounding (cross-check, not a dependency).

### UM-5.3 ERCOT peer groups and final lenses (P1, 1 h)
**Steps:** when `price_spikes` is active, score and quintile ERCOT and non-ERCOT counties/utilities separately (PRD v3 §7). Lenses per PRD v3 §6. Tests: a non-ERCOT county never gets a price-spike rank and is leveled only among non-ERCOT peers.
**Done when:** El Paso (WECC) and Panhandle SPP counties show "Price spikes: not applicable (outside ERCOT)".

---

## Phase 6: Release, live warnings and QA (P0, ~3 h)

### UM-6.1 Assembler, gates and `make export-map` (P0, 1.5 h)
**Steps:**
1. `pipeline/utility_map/assemble.py` joins every normalized table into the v3 contract, computes ranks, writes `public/utility-map/releases/<YYYY-MM-DD-hash>/` (utility-map.json, counties.geojson, territories.geojson, generators.geojson, events_*.geojson, flood/*.geojson, manifest.json, gate-report.json).
2. `pipeline/utility_map/gates.py`: 254 unique FIPS; GeoJSON IDs match; county shares sum to 1 ± 1e-3; no NaN/Infinity; every layer has period and source; value null ⇔ quality ≠ ok; ranks in [0, 1]; fleet monotonic; files ≤ 5 MB each except flood (≤ 3 MB per county).
3. Only if all gates pass, update `public/utility-map/current.json`. Otherwise print the failures and exit 1.
4. Makefile: `export-map:` runs every `pipeline.utility_map.*` build step in order, then assemble.
**Done when:** `make export-map` produces a release and the app loads it.

### UM-6.2 Live NWS warnings, our own route (P1, 1 h)
**Source:** https://api.weather.gov/alerts/active?area=TX (GeoJSON, no key; send a `User-Agent` with a contact email).
**Steps:** `src/app/api/utility-map/live/route.ts`: fetch with `next: { revalidate: 60 }`; keep `status == "Actual"` and events ending in "Warning"; map `geocode.SAME` (`048201` → `48201`) to FIPS; return `{status, fetched_at, alerts: [{id, fips, event, expires}]}`; on failure `{status: "unavailable"}`. Drop expired alerts. The UI polls every 60 s while the tab is visible.
**Done when:** a failure shows "Live warnings unavailable", and an empty success shows "No active warnings".

### UM-6.3 Browser QA, demo path and PR (P0, 1 h)
**Steps:** at 1440×900 and 1024×768: every lens, every mode, every layer toggle, 1/5/10% fleet, the 5 demo counties, a shared county picker, a non-ERCOT utility, mock mode. `python -m pytest -q`, `npm run test:web`, `npm run lint`, `npm run build`. Write a 60-second demo path in `docs/demo-script.md` (utility map section). PR to Christian.
**Done when:** checklist is green and the PR is open.

---

## Phase 7: After the hackathon

| Item | Why later |
|---|---|
| Statewide FEMA flood zones (vector tiles via tippecanoe + Mapbox tileset upload) | Texas NFHL is gigabytes; needs tiling and a Mapbox secret token |
| Precise utility service polygons (PUCT / HIFLD archive) | Licensing and vintage review |
| ERCOT live grid conditions | Needs a stable machine-readable source |
| DOE OE-417 major disturbance events as an outage cross-check | Adds credibility, not needed for the demo |
| Storm replay timeline (Uri, Beryl) | Needs per-event time series in the release |
| 72-hour forecast risk | Needs a trained, backtested model |
| Present mode and phone layout | Spec already written, postponed |
| Shared cloud storage for raw data | Team decision (PRD v2 §5) |

---

## Demo cut: what to finish by Sunday 11 AM

If time runs short, ship in this order and stop anywhere; every step leaves the map working and honest.

| Order | Tickets | What the demo gains |
|---|---|---|
| 1 | UM-0.1 → UM-0.5 | Real data, shared counties, honest labels |
| 2 | UM-1.1 → UM-1.3, UM-2.1 → UM-2.3 | Peak demand and the Base fleet story (pitch item 2) |
| 3 | UM-3.1 → UM-3.3 | Flood, including polygons for the 5 counties |
| 4 | UM-4.1, UM-4.3, UM-4.4, UM-4.5 | Tornado and hurricane heatmap, overlap count |
| 5 | UM-6.1, UM-6.3 | Reproducible release, QA, PR |
| 6 | UM-1.4, UM-1.5, UM-3.4, UM-4.2, Phase 5, UM-6.2 | Grid mode, flood fills, hail/wind, winter/heat, live warnings |

Rough total: P0 ≈ 22 h, all of Phases 0–6 ≈ 30 h. That is more than the time left, so the realistic Sunday demo is orders 1–3 plus as much of 4 as fits.
