# Utility Map PRD 2.0

**Status:** superseded where they differ by [PRD v3](utility-map-prd-v3.md) (September 26, 2026). Implementation specification; recommendations are identified below, not claims that integration is complete.  
**Owner:** Alejandro owns the Utility Map implementation and assembly of its final dataset, confirmed September 26, 2026.  
**Audience:** Base sales and partnerships; prospective customers are utilities and co-ops. County governments are not the buyers.  
**Related:** [PRD v1](utility-map-prd.md), [battery facts](battery-tech-specs.md), [data tickets](alejandro-tickets.md), [Nolan model specification](nolan-spec.md), playbook P-04.  
**Review date:** September 26, 2026. This document preserves v1 as historical context and supplies the integration contract where v1 is incomplete or inaccurate.

## 1. Product and decision boundary

A rep compares public outage history, hazard exposure, household counts and wholesale price stress across Texas utilities, drills into counties, and explores a proposed battery fleet. The experience answers: **where should Base prepare a utility conversation, what evidence supports it, and what scale of deployment is plausible?** The homeowner report remains separate and shares source inputs/model outputs.

Retain the flat map, utility-to-county navigation, equal-weight layer toggles, explainable breakdown, grouped prospect list, separate current-conditions strip, and 1/5/10% deployment scenarios. A rep should assemble a sourced profile in under two minutes. Every displayed value must expose its unit, source, observation period, estimate status and missingness. A map score is a relative screening index, not an engineering measurement of circuit stress.

Non-goals: operating a utility grid, predicting an individual home's outage, proving feeder/substation relief from county totals, installation approval, revenue forecasts, or live outage counts. Batteries can supply protected household loads; they do not shorten the utility's restoration time. Hazard scores do not directly quantify battery benefit. Flood exposure does not imply a flooded installation remains operable.

### Retained interaction requirements

- Statewide utility colors; select a utility to see its counties, dim the remainder, and open a breakdown. Where multiple utilities serve a county, offer a utility selector instead of treating the first array member as exclusive service.
- Layers: `outages`, `weather`, `flood`, `scarcity`, `homes`. Weather is a combined index; individual hazard controls and event simulations are not implemented by preset selection.
- Presets: Winter freeze = outages/weather/homes; Hurricane season = outages/weather/flood/homes; Summer peak = scarcity/weather/homes. Disable unavailable inputs; disclose the actual included set. Manual edits indicate Custom unless they exactly match a preset.
- Expansion/Grow/Monitor retains v1's level-3 threshold. Base offering determines commercial grouping, not data eligibility. Unknown offering must not become a factual “Base does not serve” assertion.
- NWS warnings are independent overlays. Current conditions never modify structural scores.
- Keep `/utility-map` during integration. `/sales`, CRM replacement and email allowlisting remain coordination decisions with Christian/Victor, not prerequisites for data assembly.

## 2. Verified checkout and implementation inventory

Inspection is a snapshot, not a merge or runtime certification:

| Checkout | Revision at inspection | Observed state |
|---|---|---|
| `base-power-app-ale-dev` | `ale-dev`, `dd16350` | Dedicated v1 PRD; utility-map mock/types/scoring; EAGLE-I/event/outlook/backtest/profile/replay code and tests; county weather-zone code; Compose API/worker are Node health stubs. Initially clean. |
| `base-power-app` | `data/zip-utility`, `d1692cd` | Additional `pipeline/sources/eia861.py`, `zip_utility.py`, curated `data/reference/base_availability.yaml`, crosswalk and map skeleton. EIA work commit `4960784`; ZIP work `d1692cd`. Not assumed merged into ale-dev. |

Observed main-checkout Parquet metadata: `ercot_rtm_spp.parquet` 6,986,120 rows; `eaglei_tx.parquet` 19,563,842 rows; `events_texas.parquet` 150,586 rows. These counts are inventory, not validation. Raw EAGLE-I filenames cover 2018–2025; actual usable periods must be measured. Main checkout also contains a December 2025 FEMA subset, an **empty (0-byte)** `acs5_2023_b25032_tx.json`, and an untracked `features.duckdb`; contents/completion of that database were not certified. Other work is occurring in that checkout; do not overwrite it.

No real NWS/ERCOT live adapters, real final map assembler, or `make data` target were found in the inspected source trees. Victor's live-adapter ownership is documented intent. An API health stub does not establish data integration. Local data files do not establish reproducible acquisition. No pipeline tests, build or new data downloads were run for this documentation task.

### Reuse with corrections

- `pipeline/sources/eia861.py` already joins utility/county membership and estimates customer splits using iterative proportional fitting (IPF). It rescales utility margins to county totals and imputes missing totals. Preserve original versus fitted margins; reject silent imputation for a published release. It uses weather zones to approximate load zones and unsafe default grid classifications; replace unknowns with explicit null/unknown.
- Its `public/utility-map/data/` skeleton contains null homes/coverage/live metadata, although current TypeScript requires numbers/strings. It is **not** a drop-in real dataset.
- Current scoring weights each overlapping utility by the county's entire customer count; household totals sum whole counties. Use allocated utility–county weights to avoid double counting.
- Current map interaction uses `county.utilities[0]`. Rendering/selection must support overlapping membership.
- `crosswalk.py` fills non-ERCOT/unmatched counties with a nearby weather zone. That can be a disclosed climate/profile proxy; it is never evidence of ERCOT membership or settlement zone. Its `zone_share` denominator is matched land, not necessarily all county land.
- `events.py` fills missing 15-minute samples with zero; source collection gaps must be assessed before annualizing. Event `customer_hours` is not automatically 12-hour-plus customer-hours.
- `replay_coverage()` computes affected-home and dark-hour fractions for an event; it does not export a county/year long-outage-only coverage contract.

## 3. Ownership and handoffs

| Owner | Accountable output | Consumer / acceptance |
|---|---|---|
| **Alejandro — confirmed** | Map UI, final dataset, acquisition/normalization of geography, EIA, FEMA, ACS, curated offerings; versioned crosswalks; shared feature assembly; JSON/GeoJSON export; provenance and release QA | Map and shared consumer inputs; owns resolving schema integration and publication readiness |
| **Nolan** | Historical outage ingestion, event/duration methods, load profiles, battery replay/simulation and model outputs; scarcity aggregation/model definition coordinated with Alejandro | Supplies normalized outage and coverage tables below plus assumptions, fixtures and tests. Existing code is reused, not rebuilt independently |
| **Victor — documented assignment** | NWS and ERCOT current-condition adapters, backend cache/API wiring and availability/error semantics | Supplies live contract below, source endpoint evidence and stale/failure tests; not assumed delivered |
| **Christian — existing app boundary** | Shared app/auth coordination and any route/CRM replacement approval | Alejandro owns the map; shared auth/layout changes remain coordinated |

Recommended coordination sequence: Alejandro publishes versioned schemas/fixtures; Nolan and Victor return those exact tables/payloads with source metadata; Alejandro validates and assembles. Do not create a competing outage model or a second live-adapter implementation merely to unblock a screen. Missing handoffs produce unavailable states or a narrower release.

## 4. Source inventory and acquisition contracts

All schemas in this section are **proposed normalized contracts** unless explicitly labeled existing. `?` means nullable. Every table carries `source_id`, `source_version`, `retrieved_at_utc` and quality flags directly or through its manifest entry. Raw headers are checked per pinned release; a familiar filename is not a schema guarantee.

### Normalization boundary: source adapters → canonical tables → release assembler

Normalization is a first-class shared layer, not cleanup inside the React app or the final exporter. Every source adapter owns parsing, type coercion, units and source-specific quality flags. Alejandro joins **validated canonical outputs**; a schema mismatch rejects the handoff rather than triggering an undocumented local fix. Preserve immutable originals so each conversion is auditable.

| Concern | Canonical rule | Validation / owner |
|---|---|---|
| County identity | Five-digit string FIPS, Texas prefix 48; source STCOFIPS or state+county mapped explicitly | No integer-truncated IDs; name joins only through reviewed aliases; Alejandro |
| Utility identity | EIA utility number as stable string plus separate versioned frontend slug | Mergers/aliases effective-dated; REPs not merged with wires companies; Alejandro |
| Time | UTC ISO-8601 timestamps / timezone-aware Parquet, end-exclusive windows; local source date/interval and DST flag retained | America/Chicago only for UI/report-year boundaries; Nolan/Victor adapters |
| Units | Customers/accounts distinct from households; kWh interval energy distinct from kW; MWh/MW export; prices USD/MWh; durations hours | Explicit conversion map, no inferred units based only on column name; producer |
| Geography | Each metric stores native resolution: county, utility/state, load zone, weather zone, alert polygon/zone | County assignment is a derivation with method/confidence, never improved source precision; Alejandro |
| Crosswalk weights | Keep county→utility, county→zone and alert→county relations separate with source, method, vintage and uncertainty | Land share is not residential/customer/load share; many-to-many joins tested for fanout; Alejandro |
| Missingness | Null plus missing/not_applicable/suppressed reason; measured zero remains zero | No median/zero fallback hidden in assembly; every producer |
| Provenance | Source file hash/version, source field, retrieval time, period, parser/model version, transformation method | Manifest foreign keys resolve; dataset and field definitions available; every producer |
| Physical versus scoring values | Store source units and normalized physical metrics separately from percentile ranks and composite scores | Rank derived only at release assembly; never overwrite hours/homes/price with percentile; Alejandro |

Native-resolution tables remain available even after county projection. Example: scarcity remains load-zone/year data; joining it to ten counties does not produce ten independent observations. Utility/account allocations preserve original utility totals alongside modeled county shares. FEMA component scores retain their original national interpretation even when a separate Texas percentile is produced.

**Handoff envelopes (required):** `handoff.json` contains producer, build ID, schema version, artifact paths/hashes, row counts, source manifests, exact observation period, quality summary and known exclusions. Tables are Parquet with explicit Arrow types; small review crosswalks can additionally be UTF-8 CSV with declared dtypes. Live fixtures are JSON. All normalized tables include method/version references. Do not send only screenshots, rounded UI values or a mutable unversioned file.

- **Nolan input → output:** normalized county observations + denominators/quality + dated profiles + versioned battery assumptions → outage metrics and county coverage tables in A/I. Include a three-county fixture, a known long-duration cohort fixture, DST example and missing-coverage case. Explicitly export `long_dark_customer_hours` versus `covered_long_customer_hours`; Alejandro must not reconstruct these from rounded `share_12h` columns.
- **Victor input → output:** exact source endpoint/product and raw success/update/cancellation/failure snapshots → timestamped NWS alert and ERCOT snapshot contracts in G/H. Declare null-geometry resolution, freshness windows and error status. No bare status string without observation time/source.
- **Alejandro input → output:** accepted producer envelopes plus EIA/FEMA/ACS/geography/reference tables → DuckDB feature build, compatibility-reviewed v2 release and gate report. Unknown IDs, unit conflicts, incomplete source metadata or unexpected fields stop the affected layer at validation. Other validated layers can produce an explicitly partial release.

### A. EAGLE-I history and denominators — Nolan → Alejandro

Primary references: [ORNL authors' data paper](https://www.nature.com/articles/s41597-024-03095-5), [dataset DOI](https://doi.org/10.6084/m9.figshare.24237376), [Figshare metadata API](https://api.figshare.com/v2/articles/24237376). The paper documents county observations at 15-minute intervals and collection/coverage limitations. Figshare direct pages/API could not be fetched in this review; the precise current version, downloadable file list and dataset license must be captured before a new release. Do not infer 2025 completeness from local filenames or v1's checkmark.

Raw: version-pinned annual CSVs plus `MCC.csv`, `DQI.csv`, `coverage_history.csv` in `data/raw/eaglei/<version>/` and source metadata. Existing header mapping: `fips_code`, `state`, `customers_out`, `run_start_time`; MCC uses `County_FIPS`, `Customers` (repository describes a 2022 modeled denominator). Public archive acquisition; no browser credentials. Retain dataset attribution/license from the actual archive, independently of the paper's license.

Existing processed observations: `county_fips:string(5), county:string, customers_out:float64, timestamp:UTC`. Key `(county_fips,timestamp)`. Deduplicate with logged policy; negative counts invalid. Separate genuine zero from unknown observation coverage.

Required `county_outage_metrics.parquet`:
`county_fips, period_start_utc, period_end_utc, observed_years, modeled_customers, denominator_vintage, long_customer_hours_fifo, long_customer_hours_lifo, long_hours_per_customer_year, coverage_fraction, quality_status`.

Recommended metric: for inferred customer durations `d` and cohort weights `w`, sum `w*d` where `d>=12h`, then divide by customer-years of usable observation. This counts all dark hours in qualifying long outages, not only hours beyond 12. Use LIFO as the primary assumption to match `LONG_OUTAGE_ORDER`, retain FIFO sensitivity, and require Nolan's sign-off. Do **not** multiply total event hours by an affected-customer fraction and call that long-outage hours. Reject unknown/zero denominator. Pin a common complete period (candidate 2018–2024); extend to 2025 only after quality checks. Proposed release gate: at least five usable years and 90% assessable coverage; report sensitivity and do not fill missing counties with zero.

### B. FEMA NRI weather and flood — Alejandro

Primary links: [FEMA NRI](https://www.fema.gov/flood-maps/products-tools/national-risk-index), [OpenFEMA NRI data](https://www.fema.gov/about/openfema/data-sets/national-risk-index-data), [technical documentation](https://www.fema.gov/sites/default/files/documents/fema_national-risk-index_technical-documentation.pdf). Direct FEMA access returned 403/502 here: archive retrieval, publisher/service provenance and release dictionary remain an acquisition gate, not a verified downloadable API URL. Use the official release CSV/ZIP and dictionary, or a FEMA-owned ArcGIS service linked by FEMA with pagination/count checks. Do not choose a third-party copy solely because its title matches.

Local staged CSV has `STCOFIPS, COUNTY, NRI_VER` and hazard-specific `*_RISKS`, including **`IFLD_RISKS`** (inland flooding) and `CFLD_RISKS`; `NRI_VER=December 2025`. Older riverine `RFLD_*` schemas cannot be silently mixed with this release. NRI risk scores include dimensions beyond physical hazard; describe them as **hazard-specific risk indicators**, not outage probabilities or purely meteorological frequency. Preserve source field definitions and missing/not-applicable flags. Pin a release; check for updates quarterly, do not promise annual publication. Record FEMA/OpenFEMA terms and attribution in the manifest; retrieval/license evidence is still required.

Normalized `county_hazards.parquet`:
`county_fips, nri_version, hazard_code, source_field, risk_score_0_100?, source_status, weather_composite?, flood_composite?`.

Recommended v2 composite, pending dictionary validation: arithmetic mean of `WNTW_RISKS, ISTM_RISKS, HRCN_RISKS, HWAV_RISKS, SWND_RISKS, TRND_RISKS`. Six equal components; no silent substitution of cold-wave/hail fields. Weather requires all six valid components. Flood uses mean of inland and coastal scores where applicable; inland-only for explicitly non-applicable coastal geography. Unknown coastal data is not “not applicable”; unresolved components make the composite null. Preserve component count and method version. The app then computes Texas peer ranks from these composite values, distinct from FEMA's national scores.

### C. ERCOT historical scarcity prices — acquisition Alejandro, metric Nolan

Primary: [ERCOT Market Prices / historical RTM load-zone and hub prices](https://www.ercot.com/mktinfo/prices), [RTM product definitions](https://www.ercot.com/mktinfo/rtm), [public API access](https://www.ercot.com/services/mdt/data-portal), [registration/authentication guide](https://developer.ercot.com/applications/pubapi/user-guide/registration-and-authentication/). Use annual public archive workbooks/ZIPs for reproducible history; resolve their exact download URLs from the product listing and record hashes. API access requires registration, subscription key and authentication; it is not an anonymous browser endpoint. Preserve ERCOT terms; `gridstatus` is an adapter, not the source or evidence of download success.

Observed Parquet columns: `interval_start_utc, settlement_point, point_type, price`. Target adds `interval_end_utc, duration_hours, price_usd_per_mwh, source_revision`; rename/alias `price` explicitly. Key `(settlement_point,interval_start_utc)`. Keep load zones for scoring, hubs for diagnostics only. Historical intervals are commonly 15 minutes; consume actual product interval duration rather than assuming all years/products have identical cadence. Resolve repeated DST hours using source flags/local interval metadata; retain both UTC intervals, handle 24:00, and reject ambiguous conversions.

Proposed scarcity definition: hours with RTM SPP **>= $1,000/MWh**, sensitivity at $500 and $2,000; this is a product threshold, not an ERCOT emergency designation. Nolan confirms the threshold before release. `zone_scarcity.parquet`: `load_zone, year, threshold_usd_mwh, valid_hours, expected_hours, scarcity_hours, completeness, source_revision`. Sum interval durations, never row counts. Recommend complete calendar years with >=99% intervals; no annualization of incomplete years. Release value = mean annual scarcity hours over the pinned common window. Out-of-ERCOT counties are null/not_applicable, not zero. Price does not prove a distribution circuit is constrained. No money/ROI output in this product.

### D. ACS household proxy — Alejandro

Primary: [2024 ACS 5-year table B25032 dictionary](https://api.census.gov/data/2024/acs/acs5/groups/B25032.html), [dataset](https://api.census.gov/data/2024/acs/acs5.html), [current query/key instructions](https://api.census.gov/data/2024/acs/acs5/examples.html). Query `/data/2024/acs/acs5?get=NAME,B25032_003E,B25032_003M&for=county:*&in=state:48&key=<server-secret>` at `https://api.census.gov`. Current examples require an API key. Save the JSON array-of-arrays response without persisting the secret URL. Census federal statistical data: retain attribution and vintage; no personal records are requested.

Use **owner-occupied, one-unit detached** estimate `B25032_003E`, margin of error `003M`. Attached homes (`004E`) are excluded by recommended default and can be a separate scenario. Join concatenated state+county strings. `county_homes.parquet`: `county_fips, acs_end_year, period_start_year, detached_owner_units, detached_owner_moe, attached_owner_units?, status`. Negative sentinel/annotation values become null, never zero. Five-year estimates span 2020–2024; the end year is not an observation date for every home. Refresh with each annual ACS5 release.

This is an **addressable household proxy**, not confirmed installation eligibility. Roof/yard, electrical panel, ownership permission, service address and program checks remain unknown. Utility proxy = county proxy × allocated residential share; if only all-customer share exists, label that approximation. Never sum a shared county's full homes into every utility. Keep the legacy `eligible_homes` field only as a compatibility alias with explicit proxy semantics, and change visible wording.

### E. EIA-861 utilities, customers and county membership — Alejandro

Primary: [EIA-861 detailed files](https://www.eia.gov/electricity/data/eia861/). Download one pinned annual ZIP; current implementation expects 2024 workbooks `Service_Territory`, `Sales_Ult_Cust` (States sheet), and `Delivery_Companies`. Public bulk files; capture revised/preliminary status and attribution. The service-territory file provides **county membership**, not county-specific customers or exact polygons. Sales/delivery data supply different utility/state/sector aggregates; avoid counting competitive retail providers on top of wires customers. Grid classification needs Utility Data/BA evidence, not Service Territory alone.

Normalized `utilities.parquet`: `utility_id:string` (EIA number), `name, state, service_type, ba_codes[], grids[], residential_customers?, all_customers?, year, source_status`. Display slugs use a versioned EIA-ID lookup; names are not primary keys. `county_utility.parquet`: `county_fips, utility_id, membership_source, residential_share?, all_customer_share?, customers_est?, allocation_method, allocation_year, confidence, primary_display_only`.

County names from the workbook join to a controlled Census name/FIPS dictionary with unmatched/ambiguous names rejected. Preserve every utility membership. IPF is a proposed allocation model, not observed data: document EIA versus MCC vintages, sector differences, original/fitted margins, rescaling factor, convergence residuals and uncertainty. Do not use median customer counts or `1` to make missing data appear valid. Where allocation cannot be defended, publish membership-only and suppress utility-weighted/fleet claims. Utility total and allocated total need separate fields; do not imply they are identical after margin rescaling.

Do not map every unrecognized BA to WECC or every missing grid to ERCOT. Support unknown/multi-grid states. EIA peak-demand data, if evaluated later, must match scope/year/coincident definition; no “percent of utility peak” until that join is validated.

### F. County geometry and zone crosswalks — Alejandro

Primary: [Census cartographic boundary downloads](https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html), [2020 ZCTA relationship files](https://www.census.gov/geographies/reference-files/time-series/geo/relationship-files.2020.html), [ERCOT current Load Profiling Guide / Appendix D](https://www.ercot.com/mktrules/guides/loadprofiling/current). County boundaries are simplified thematic shapes, not property boundaries. Recommended common geography vintage 2024, Texas `STATEFP=48`, a scale suitable for county zoom; record actual archive URL/checksum. Convert shapefile/geopackage coordinates to WGS84 GeoJSON longitude/latitude. Federal geography inputs require attribution; ERCOT workbook follows its terms.

`counties.geojson`: exactly 254 Polygon/MultiPolygon features, `properties.fips` five-character string, `properties.name`; retain numeric `Feature.id=Number(fips)` for current Mapbox feature-state calls. Use representative interior points for labels. `territories.geojson`: county unions keyed by `properties.utility` (the frontend ID), with `approximation=county_membership`, vintage and source. Overlap is expected. These are **counties served**, not exact service boundaries; avoid exclusive “served by” wording. Never fabricate boundaries from nearest towns in a real release.

`county_zones.parquet`: `county_fips, weather_zone?, weather_method, matched_land_fraction?, assigned_zone_fraction?, ercot_membership:yes|no|mixed|unknown, load_zone?, load_zone_method, source_version, confidence` plus a many-to-many `county_zone_shares` table when supported. Existing Appendix-D ZIP→weather-zone + Census ZCTA→county join is an approximation: USPS ZIPs and ZCTAs differ, land is not load, and nearest-zone fallback must stay flagged. Separate weather profile assignment from electrical market membership. Current weather→load-zone heuristic omits LZ_LCRA/LZ_RAYBN and cannot certify settlements. Default: verified mappings where available, otherwise null or prominently approximate scenario; no scarcity rank for unknown electrical mapping.

### G. NWS current alerts — Victor

Primary: [NWS API](https://www.weather.gov/documentation/services-web-api), [alert service](https://www.weather.gov/documentation/services-web-alerts), [geolocation guide](https://www.weather.gov/media/documentation/docs/NWS_Geolocation.pdf). Endpoint: `https://api.weather.gov/alerts/active?area=TX`; request GeoJSON, send descriptive User-Agent/contact and honor caching/rate limits. Open government service; no API key currently required. Poll centrally every 60 seconds (recommended), not once per browser; use conditional requests/backoff.

Raw: cached GeoJSON including `id`, geometry, `properties.event/status/messageType/sent/effective/onset/expires/ends/severity/urgency/certainty`, geocodes, affectedZones and references. Keep Actual alerts; correctly process cancellations/updates, filter warnings for the warnings toggle. Dedupe by alert identifier, not county/event text. Polygon geometry can be null: use documented SAME/county identifiers or official affected-zone geometry/crosswalk, never parse a zone code as county FIPS by substring without validation. A county outline is a geographic summary of an alert, not its exact hazard footprint.

Normalized alert: `id, event, sent_at, effective_at, expires_at, county_fips[], geometry?, geometry_basis, severity, status, source_url`. Mark fetch failures separately from a successful empty list. Recommended stale after 5 minutes; expired alerts are removed even when upstream fails. Do not show “No active warnings” on failure.

### H. ERCOT current snapshot — Victor

Primary: [ERCOT Grid Conditions](https://www.ercot.com/gridmktinfo/dashboards/gridconditions), [current SPP display](https://www.ercot.com/content/cdr/html/real_time_spp.html), [API guide](https://www.ercot.com/services/mdt/data-portal). These are different products: current prices cannot be translated into an emergency status. The exact supported machine-readable conditions feed and field definitions remain **Victor's discovery/fixture handoff**, not an invented endpoint in this PRD. Public API credentials, if used, stay server-side; Data Access Portal lag may make it unsuitable for a minute-level conditions label.

Target `ercot_snapshot`: `status:ok|stale|unavailable, observed_at_utc?, fetched_at_utc, condition_text?, condition_code?, demand_mw?, available_capacity_mw?, reserves_mw?, source_url, product_id`. Only expose metrics actually defined in the chosen source. Recommended fetch every 60 seconds where supported, stale at 5 minutes; record upstream update cadence. ERCOT is statewide context, not a utility outage measurement; non-ERCOT utility panels say not applicable. No invented normal state.

### I. Battery facts, profiles, coverage and offering — Nolan + Alejandro

Primary: [Core specifications](https://www.basepowercompany.com/specs/core), [utility product](https://www.basepowercompany.com/utilities), [Base offering directory](https://www.basepowercompany.com/pricing), [ERCOT load-profile archives/layouts](https://www.ercot.com/mktinfo/loadprofile). Base currently publishes 39.2 kWh and a utility-facing 20 kW/39.2 kWh system; the exact continuous/export/combined-system interpretation still needs confirmation. Availability varies by address. These are vendor claims, not local verification. Cite facts and link rather than republishing proprietary assets. Check offers before every release/monthly; battery assumptions are versioned, not silently refreshed.

Raw profiles: annual ZIP/workbooks of 15-minute **kWh**, profile type × weather zone × date; preserve 92/96/100-interval DST days and ignore ADDTIME as an energy interval, matching existing parser intent. Target `load_profiles.parquet`: `profile_type, weather_zone, interval_start_utc, interval_end_utc, energy_kwh, profile_year, source_revision`. Profiles represent groups, not measured household usage; normalization to annual home consumption is a model assumption.

Nolan supplies `county_core_coverage.parquet`: `county_fips, period_start, period_end, cores, profile_type, weather_zone, annual_kwh_assumption, start_soc, reserve_soc, storm_factor, duration_order, long_dark_customer_hours, covered_long_customer_hours, coverage_share?, model_version, quality_status`. Restrict both numerator and denominator to the same >=12h cohorts and observation window as outage metrics. `coverage_share = covered_long_customer_hours / long_dark_customer_hours`; no qualifying hours → null/not_applicable, not 100%. Preserve forecast-storm versus surprise-outage scenarios; do not reuse all-outage coverage as long-outage coverage.

Alejandro maintains `data/reference/base_availability.yaml` (existing in main checkout) with stable EIA ID, frontend ID, offer enum, source URL, checked date, applicability and `verification_status`. Absence means unknown/unverified, not proven no service. Texas filter excludes Illinois records. Keep legal entity/merged-utility aliases explicit. Battery reference JSON/YAML stores capacity, power ceiling, reserve assumption, sources, checked date, model and unresolved interpretation.

## 5. Storage and build architecture

**Current state:** local raw/processed files in the inspected checkouts; no shared storage provider is established by v1 or verified here. **Recommendation, not an approved vendor:** team-accessible cloud object/file storage is the shared exchange layer for immutable source downloads, normalized handoffs and releases. Provider choice, bucket/container, region, access roles, costs and credentials remain open; no infrastructure is provisioned by this task. Local files are working caches, not the only team handoff.

Use vendor-neutral remote keys `utility-map/raw/<source>/<version>/`, `utility-map/processed/<source>/<version>/`, `utility-map/handoffs/<owner>/<build-id>/`, and `utility-map/releases/<release-id>/`. Each upload includes manifest, schema version and SHA-256 checksums; upload under a staging prefix and publish a completion manifest last. Consumers accept only completed handoffs and validate hashes/schema before copying into a local build. Keep a small release-pointer JSON selecting the last validated immutable release; promotion uses provider-supported conditional update or a single release owner. Credentials use scoped roles, never a publicly writable bucket or secrets embedded in URLs. Raw redistribution permissions are checked per source; web releases contain only publishable aggregates.

Paths below describe the **local cache/build layout**, selected through a proposed `PORCHLIGHT_DATA_ROOT` (for example an operator-selected directory outside the worktree). Cloud key layout mirrors raw/processed/releases; DuckDB build files remain local, and finalized snapshots are uploaded only if needed. Existing code hardcodes `settings.REPO_ROOT`; implementation must first introduce and test this one root override. Separate worktrees must not concurrently write the same DuckDB file. **Do not create/move data or provision storage as part of this document task.**

```text
<local-data-cache>/
  raw/<source>/<version>/                 immutable originals + acquisition manifest
  processed/<source>/<version>/           normalized Parquet; crosswalk CSVs
  builds/<build-id>/features.duckdb        one writer per build
  releases/<release-id>/                  validated immutable aggregate exports
repo/
  pipeline/settings.py                   root configuration, sole path authority
  pipeline/sources/                       reusable acquisition/normalization
  pipeline/utility_map/                   PROPOSED assembly, ranking, validation/export
  data/reference/                         small reviewed YAML/CSV assumptions in Git
  schemas/utility-map/v2/                 PROPOSED JSON Schema + table contracts
  tests/fixtures/utility-map/             tiny deterministic inputs in Git
  public/utility-map/<release-id>/         publishable aggregates only
    utility-map.json
    counties.geojson
    territories.geojson
    manifest.json
```

For a single-checkout build, keep current `data/raw`, `data/processed`, `data/features.duckdb` via settings until root support is implemented. `data/raw` is ignored; processed Parquet is currently not universally ignored. Deliberately decide which small derived files are tracked; do not accidentally commit full archives/databases. Never hardlink mutable databases between worktrees. Transfer validated immutable releases, not arbitrary live data directories.

DuckDB is a local assembly/query store, not a browser database or mandatory running backend. Tables: counties, utilities, county_utility, county_zones, outage_metrics, hazards, homes, zone_scarcity, core_coverage, source_manifest. Browser loads aggregate release files once; toggles recompute without network calls. Victor's proposed `/api/utility-map/live` serves separately cached current conditions. Supabase remains auth/profile storage, not the raw-data warehouse. Postgres/Redis stubs do not need to block static maps.

Secrets: Census key, ERCOT credentials/subscription key and privileged service credentials in ignored environment/secret manager only. Never in manifests, request URLs written to logs, `NEXT_PUBLIC_*`, public data or Git. Browser-visible Mapbox token must be restricted public-scope; the existing token route exposes it. No household addresses, medical data, OTPs or user profiles in map exports. Static public-directory data is accessible independently of page authentication: publish only redistributable, non-sensitive aggregates.

Proposed commands (not currently implemented): `make data-sources` → normalize, `make data-map` → assemble, `make validate-map RELEASE=...` → gates, `make export-map RELEASE=...` → immutable release. Pin source versions/config/hash rather than fetching “latest” inside scoring. Build in staging, validate all files, atomically publish the release pointer; keep last-good release and rollback. Hashes and source watermarks make rebuilds reproducible.

## 6. Final JSON/GeoJSON contract and migration

Preserve current `LayerId`, `BaseOffer`, `values/ranks`, `geometry.counties/territories`, `centroid` and `label_point` names. The following is a **v2 target**, requiring schema/types/UI changes before activation. Do not silently reinterpret old payloads. Author machine-readable JSON Schema first; these definitions specify its required content.

| Object | Required fields / additions |
|---|---|
| Root | `schema_version:"2.0"`, `release_id`, `mock:boolean`, `data_mode:real|partial|mock`, `as_of` (build UTC), `note`, `layers`, `presets`, `battery`, `counties`, `utilities`, `geometry`, `scoring`, `sources`, `live` |
| Layer | Existing id/label/unit/source; `as_of:string|null`, `available:boolean`, `period_start/end`, `method_version`, `source_ids[]`, `coverage_summary` |
| County | Existing fips/name/utilities/customers/load_zone/centroid/values/ranks; nullable customers; `quality` per layer (`ok|missing|not_applicable|suppressed` + reason), `weather_zone?`, `grid_status`, `load_zone_method`, component metadata |
| Utility | Existing id/name/grid/scored/base_offer/counties/customers/eligible_homes/core_coverage_hours/label_point; nullable unknown numeric fields and offer; `eia_utility_id`, `grids[]`, `offer_verification`, `county_weights[]`, `household_proxy_method`, `coverage_scenarios[]`, `quality` |
| County weight | `fips, customers_est?, residential_share?, all_customer_share?, method, confidence`; weights explicit per utility, not whole-county count |
| Battery | Existing kwh_per_core/kw_per_core; `reserve_fraction`, `power_basis`, `model`, `source_ids[]`, `assumption_version`; unknown performance inputs remain null |
| Scoring | `method_version, rank_method, peer_scope, available_layers, thresholds, coverage_policy`; records actual comparability set |
| Sources / manifest | Source ID, publisher URL, exact credential-free download URL, version, observation period, retrieval UTC, license/terms URL/status, SHA-256, rows, join coverage, model/config/Git revisions, limitations |
| Live | `status`, `as_of:string|null`, `ercot:string|null`, `alerts:[{fips,event,id,expires_at}]`, source-specific `nws/ercot_snapshot` status, observed and fetched timestamps; cached release snapshot is labeled historical until refreshed |

Use JSON null, never NaN/Infinity or a numeric zero for unknown. Include all five keys in `values/ranks`; disabled layers remain null. A live empty list is meaningful only with successful status. GeoJSON remains WGS84 with the feature IDs described above. Source timestamps need not match: `as_of` is not a substitute for per-layer vintage. Runtime payload validation must run before painting.

Minimum required consumer adaptations beyond changing DATA_BASE: null-safe display and arithmetic; live error semantics; source/period UI; allocated scoring/household totals; overlapping utility selection; nullable/unknown grid and offering; optional fleet outputs; conditional mock/partial badges; first valid release selection. Existing mock fixture can remain v1 until explicitly migrated; never mix mock figures into a `real` release.

## 7. Scoring, missingness and fleet formulas

Recommended rank definition: `(average_tie_rank-1)/(n_valid-1)`; at n<2 emit null. Recompute on the pinned Texas comparison set. County score remains equal mean of enabled ranks. Missing inputs do not mean low exposure: display available/requested counts. For ranking, require a common applicable-layer set within each comparison group; separate ERCOT versus non-ERCOT when scarcity is enabled. Unavailable statewide layer is disabled. Utilities need recommended >=90% allocated-customer coverage for a ranked score; below this, show “insufficient coverage.” Quintiles use documented cut rules, stable ties and labels; ties need not yield exactly 20% in each level. Core commercial list and numerical peer denominator must be visibly consistent.

For utility u and county c use weights `C_uc` (allocated customers), not `C_c`. Layer means and utility score normalize over valid weights and report omitted fraction. Homes total `H_u=sum(H_c * residential_share_uc)`; all-customer allocation is a disclosed fallback. A selected utility includes every matching county even when it is not that county's primary display utility.

Fleet scenario, one Core per proxy household:

```text
N_uc = share * H_c * residential_share_uc  # retain fractions until displayed totals
N_u = round(sum(N_uc))                    # documented rounding reconciliation
storage_MWh = N_u * 39.2 / 1000
nameplate_ceiling_MW = N_u * 20 / 1000
scenario_energy_MWh = N_u * 39.2 * max(start_soc-reserve_soc,0) / 1000
scenario_sustained_MW = min(nameplate_ceiling_MW, scenario_energy_MWh/window_hours)
covered_customer_hours_per_year = sum(N_uc * outage_hours_c * coverage_share_c)
```

The last product is calculated **per county before summing**; multiplying two independently averaged outage/coverage values introduces bias. Compatibility `core_coverage_hours` can only be derived with outage-and-deployment weights for that exact scenario; retain null otherwise. Relabel “outage hours” as “estimated customer-hours of backup supplied per year.”

Reserve default 20% and start SoC 100% are explicit illustrative assumptions pending Base confirmation; use a 2-hour dispatch window by default with a 1-hour comparison. They are not observed fleet availability. Household load, conversion loss, temperature, enrollment, interconnection and dispatch availability reduce delivered export. Without those inputs label sustained output **idealized energy-limited ceiling**, not a commitment. Do not apply published fleet availability blindly as an independent efficiency factor. No simultaneous promise of full stored energy for backup and full grid export; outage scenarios and grid-connected dispatch scenarios are separate. No circuit relief percentage, peak reduction promise or site selection from these totals.

## 8. Delivery order and validation gates

1. **Freeze contracts and imports — Alejandro.** Compare ale-dev with EIA/ZIP commits; port/reconcile approved source work without merging unrelated app changes. Preserve v1 and mock fixture. Publish schemas, source manifest template and three-county plus overlapping-utility fixtures.
2. **Geographic spine — Alejandro.** All 254 counties, stable EIA IDs, multi-utility memberships, Base offer provenance, grid/zone uncertainty. Decide whether IPF is defensible; membership-only is acceptable until allocation passes.
3. **Two real evidence layers — Nolan + Alejandro.** Nolan delivers long-outage metrics/quality; Alejandro validates FEMA release and composite. Do not enable statewide rankings with a three-county sample mislabeled Texas.
4. **Smallest working slice.** Real county geography, documented approximate utility membership, outage and weather layers with breakdown/source dates. Disable other layers and fleet outputs pending data. Live strip can say unavailable. If no reliable allocation, show county evidence within a utility but withhold utility rank. This is a narrowed partial release, not v1's complete thin slice. V1 thin slice acceptance additionally requires defensible utility rankings and Victor's live integration.
5. **Complete structural dataset — Alejandro + Nolan.** ACS proxy, validated customer allocation, scarcity window/threshold and zone mapping, flood composite, model coverage. Gate each layer independently.
6. **Live adapters — Victor.** Recorded success/empty/update/cancel/stale/failure fixtures, then endpoint integration. No dependency on live connectivity for structural map rendering.
7. **End-to-end release — Alejandro.** Publish immutable JSON/GeoJSON + manifest, switch release only after gates; inspect running map, toggle every layer/preset, verify selection on overlapping counties, non-ERCOT/unknown cases, fleet arithmetic and failure states. Keep existing auth and consumer flow working.

Required gate report:

- Source: nonempty downloads, exact version/dictionary, valid license/access evidence, checksum, reproducible parser and timestamp range. Reject the observed empty ACS file. File existence and old PR status are not gates.
- Geography: 254 unique five-digit TX FIPS; no orphan joins; valid GeoJSON IDs/coordinates; explicit overlap, null zone and approximate boundary disclosures. No silent missing-grid fallback.
- Allocations: unique pairs; shares in [0,1], within 1e-6 of one per fully allocated county; disjoint account roles; convergence/rescaling residuals reported; statewide household totals not duplicated. Unallocated share stays visible.
- Temporal: DST/leap-year tests; UTC uniqueness; observed versus expected coverage; no silent interpolation/zero-fill across known collection gaps. Missing prices do not create zero scarcity.
- Metrics: risk fields match release dictionary; rank ties/nulls tested; denominator/model window agreement; long-only coverage verified from a tiny known duration fixture; 0<=coverage<=1 and covered hours<=eligible dark hours.
- Contract: JSON Schema, finite numbers/nulls, referential integrity and per-source statuses; loader handles partial and unavailable cases without fake zeroes. Test scored-list versus rank denominator.
- Fleet: monotonic 1/5/10% scenario within rounding; energy ceiling never exceeds power ceiling; heterogeneous-county aggregation fixture; unknown coverage hides only that metric. No claim of measured local grid relief.
- Live: expired/cancelled alerts disappear, absent geometry resolves honestly, duplicate alerts do not inflate county counts, outage of upstream is distinct from no alerts. Non-ERCOT displays no ERCOT-local inference.
- Release: deterministic output under same manifest/config, aggregate-only secret scan, last-good rollback, browser verification with actual served bundle. Run existing Python tests plus meaningful adapter/assembler tests; frontend lint/build when code changes. This documentation-only task does not certify those checks.

## 9. Refresh policy and operational ownership

Alejandro owns release builds and manifests. Historical sources update offline on a reviewed release: EIA/ACS yearly, FEMA on publisher revision, EAGLE-I on archive revision with quality recheck, ERCOT prices after final/corrected periods. Check official versions rather than a fixed guessed calendar. Rebuild all affected ranks together; preserve old release for comparisons. Maintain source-specific observations and retrieval time separately. Victor owns live polling/cache/health; proposed 60-second polling and 5-minute staleness must respect each upstream's supported cadence. Failed live calls keep labeled last-known observations, never silently fresh dates. New raw data must not mutate a published release.

## 10. Roadmap dependencies and remaining decisions

| Item | Dependency / disposition |
|---|---|
| FEMA acquisition | Official files/dictionary access was blocked here; validate the staged December 2025 subset's provenance and `IFLD` semantics before enabling the layer. |
| Shared team storage | Choose cloud object/file provider and scoped access; cloud exchange keys are specified in section 5, but no vendor/service or credentials are approved/provisioned. |
| Customer allocation | EIA county shares are modeled, not provided. Decide acceptable IPF assumptions and exposure labels; residential allocation remains a material limitation. |
| Outage/coverage metric | Nolan must deliver long-only customer-hour aggregates and usable observation years; existing event tables/replays are not the exact final contract. |
| Scarcity | Confirm $1,000/MWh threshold, complete window and authoritative/approximate zone mapping policy. Do not infer load zone solely from climate zone. |
| Live ERCOT/grid feed | Victor confirms actual ERCOT conditions endpoint/product and source fields; no adapter implementation verified in this review. |
| Base performance | Continuous versus peak/export power, reserve behavior and utility dispatch availability require confirmation. Nameplate/idealized scenarios can ship with qualified labels. |
| Product comparison | Recommended ranking separates incompatible layer coverage; confirm this refinement to v1's all-Texas utility rank before implementation. |
| Ownership | **Resolved: Alejandro owns map and final dataset/export assembly.** Nolan owns historical/model handoffs; Victor owns documented live/API handoffs. |
| Route/auth | Keep `/utility-map`; `/sales`, CRM retirement, email allowlist stay open coordination work. |
| Precise service polygons | Authoritative utility/PUCT or verified archived HIFLD polygons, vintage/license/overlap validation. County unions remain approximate. |
| Detailed flood zones | [FEMA NFHL](https://www.fema.gov/flood-maps/national-flood-hazard-layer), coverage/effective dates and separate geometry pipeline. Not interchangeable with NRI risk scores. Primary link is a roadmap discovery entry; not downloaded here. |
| Storm replay | Nolan event time-series + profiles + validated cohort coverage + timeline UI; not implied by Winter/Hurricane presets. |
| Forecast/72h score | Forecast ingestion, spatial/time matching, trained/calibrated method and uncertainty/backtest; maintain separation from structural score. |
| Targeted deployment/nodal relief | Feeder/substation topology, load/generation constraints, battery locations, dispatch/SoC and utility validation; transmission maps alone are insufficient. |
| Paid live outages | Provider contract, redistribution rights and operational monitoring; no synthetic values labeled live. |

## 11. Running source register — easiest to hardest

**Maintainer: Alejandro. Last reviewed: September 26, 2026.** This register inventories all core inputs, model-derived handoffs and roadmap source families in this PRD. It is a planning snapshot of the inspected checkouts, not a live completion tracker. Update a row whenever an artifact, source version, access decision or validation result changes; record evidence path/commit, review date and next owner action. Keep stable IDs when splitting or adding rows. Detailed schemas and primary links remain in section 4; this register does not replace those contracts.

**Difficulty rubric:** assess remaining work across acquisition, normalization, geographic joins, UI integration and refresh operations. **Easy** = small/static input and direct identifiers with established UI concepts. **Medium** = schema/version handling, a bounded crosswalk or recurring adapter plus quality states. **Hard** = unresolved allocation/model semantics, many-to-many geography, substantial temporal validation or engineering-dependent claims. A difficult stage determines the overall band; existing reusable work reduces remaining effort but does not remove validation. Order within a band is approximate, not a precise estimate.

**Access and uncertainty are separate from difficulty.** “Access blocked in review” describes the attempted retrieval, not a permanent outage. “Unverified” means no accepted handoff/source access evidence was observed. An easy source may be credential-blocked; a publicly downloadable source can still be hard to integrate. Status terms: **existing code/artifact** (observed, not necessarily validated), **partial**, **not verified**, **roadmap**. Only change to **accepted** after the section 8 gate report exists. No source below is newly certified accepted by this documentation review.

### Core sources and required derived handoffs

Sorted by remaining end-to-end engineering difficulty. A = Alejandro, N = Nolan, V = Victor. Alejandro owns integration of every row; listed owners identify source/model producers.

| ID / source or handoff | Owner | Difficulty | Current evidence / status | Why this difficulty; dependencies and blockers | Next action |
|---|---|---|---|---|---|
| C01 Base published battery facts | A; N consumes | Easy for qualified nameplate display | Existing battery reference doc and mock constants; official pages checked (§4I) | Small versioned reference; source conflict/continuous-export interpretation remains uncertain. Dispatch claims require C14, not just these constants | Create reviewed battery reference with field-level sources and assumption version; retain power upper-bound wording |
| C02 Curated Base offerings / program coverage | A | Easy | YAML exists in main checkout, not assumed in ale-dev; directory checked (§4I) | Small manual dataset; EIA aliases and unknown versus no service need care; address-specific qualification is unavailable | Reconcile/import YAML, verify each utility link/date, add unknown status and review cadence |
| C03 Census county geometry | A | Easy | Real county shapes and renderer exist; current mirror/vintage differs from proposed pinned release (§4F) | Direct FIPS join; reprojection/simplification and feature IDs are bounded work. Requires consistent vintage/provenance | Pin official archive, validate 254 FIPS and geometry, export stable IDs/interior label points |
| C04 ACS5 B25032 household proxy | A | Medium | Official field dictionary/API verified; staged 2023 JSON is empty (§4D) | Straight county join, but MOE/sentinels, current API key, proxy labeling and utility allocation matter; C10 needed for utility totals | Obtain keyed 2024 response, normalize estimate/MOE and validate all counties; expose county proxy before utility totals |
| C05 FEMA NRI weather indicators | A | Medium | December 2025 subset staged; provenance not accepted; official download/dictionary access blocked in review (§4B) | Direct FIPS; versioned component semantics, completeness, source attribution and percentile separation. Retrieval blocker is separate from engineering | Recover official source/dictionary evidence, validate six fields and composite method, retain component values |
| C06 FEMA NRI flood indicators | A | Medium | Staged file has IFLD_RISKS/CFLD_RISKS; same retrieval limitation as C05 (§4B) | Reuses C05 ingest but inland/legacy-riverine and coastal not-applicable rules need explicit validation; no NFHL geometry implied | Validate current dictionary, implement missing versus not-applicable rules and flood fixture |
| C07 EIA-861 utility identity and service membership | A | Medium | Reader, crosswalk and skeleton exist in main commit 4960784 (§4E) | Multi-sheet/annual schema, REP versus wires roles and utility aliases; membership is usable before precise allocation. C03 needed for geography | Reconcile source code into ale-dev, retain all memberships, separate EIA totals and unknown grids; do not publish IPF as observed |
| C08 ERCOT Appendix D + Census ZCTA–county weather crosswalk | A; N consumes | Medium | crosswalk.py and processed CSV exist (§4F) | Reuse reduces work; ZIP/ZCTA mismatch, matched-land denominator and nearest-zone flags require validation. No electrical membership inference | Export match coverage/method flags, verify demo counties, keep nearest-climate fallback out of grid classification |
| C09 NWS live warnings | V → A | Medium | Official API/format verified; adapter implementation not found (§4G) | Public access but alert lifecycle, null polygons, zone/county joins, caching and stale UI are real work; C03/C07 for map joins | Deliver endpoint fixtures, normalized alert IDs/times/geography and success-empty versus failed status |
| C10 EIA customer totals + modeled utility–county/residential allocation | A | Hard | IPF code and county_utility.csv exist in main; margins rescaled and missing totals imputed (§4E) | Customer shares are not supplied by membership file; mixed vintages/sectors and overlapping counties affect scores/homes. Needs C03/C04/C07/C12 | Validate margins/convergence, remove silent imputation, agree residential fallback; otherwise suppress utility-weighted and fleet outputs |
| C11 ERCOT electrical membership / load-zone mapping | A; N reviews model use | Hard | Main EIA code has weather-based heuristic and default grid fallbacks (§4F) | Weather geography does not identify settlement zones; mixed territories and omitted special zones. More data download alone does not resolve this | Preserve unknown/mixed mappings; document verified sources and approximation; withhold scarcity ranking for unresolved cases |
| C12 EAGLE-I annual observations + MCC/DQI/coverage metadata | N → A | Hard | Ingestion/events code and large local Parquets exist; archive version/access/license not reverified (§4A) | Reuse substantial, but zero versus collection gap, modeled denominators and usable customer-years control validity | Deliver pinned archive manifest, actual period/coverage audit and normalized observations/denominators; do not infer completeness from filenames |
| C13 ERCOT RTM price history → annual scarcity | A acquisition; N metric | Hard | 6.99M-row local price Parquet observed; reproducible downloader/aggregate handoff not certified (§4C) | DST, corrections, duration/completeness and threshold semantics; county UI depends on C11. Annual archive can avoid API credentials; API path needs them | Attach source hashes/parser, confirm threshold/window, validate intervals and produce zone-year aggregates |
| C14 ERCOT load profiles + Nolan battery coverage outputs | N → A | Hard | Profile parser, simulator and event replay code/tests exist; final long-only county coverage absent (§4I) | Profile alignment/scaling, SoC assumptions and cohort-weighted coverage differ from existing all-event fractions. Depends C01/C08/C12 | Deliver long-only covered/total customer-hours and scenario metadata with known-cohort fixtures; integrate only validated county results |
| C15 EAGLE-I events → long-outage screening metric | N → A | Hard | events_texas.parquet exists; exact >=12h customer-hour aggregate missing (§4A) | Event length/customer-hours/share_12h cannot substitute for cohort hours; annualization depends on C12 quality, FIFO/LIFO assumptions | Export section 4A metrics with usable customer-years and uncertainty; resolve definition before statewide rankings |
| C16 ERCOT live grid snapshot | V → A | Hard until source contract resolved | Official dashboard/API docs checked; machine-feed endpoint and adapter not verified (§4H) | Access/product discovery, status interpretation, authentication/lag, state versus utility scope and fresh/stale states; not interchangeable with current prices | Identify supported feed and schema, prove cadence/access with fixtures, implement cached adapter or explicit unavailable state |

C14 and C15 are **derived model handoffs**, not additional external publishers. List them separately because their definitions and acceptance gates are material blockers despite existing source data. C08 similarly names both inputs to a derived crosswalk. EIA Utility Data/BA metadata, Delivery Companies and Sales to Ultimate Customers are all included in C07/C10/C11; service membership alone cannot replace them.

### Roadmap sources — separate from core acceptance

These rows are discovery requirements, not verified feeds or assigned delivery commitments. Owner recommendations below require team agreement; they preserve the existing boundary of A on map/assembly, N on models, V on operational adapters. Difficulty includes the intended map feature, not merely obtaining a file.

| ID / source family and feature | Proposed owner | Difficulty | Current status / reusable work | Dependencies, access and uncertainty | Next action |
|---|---|---|---|---|---|
| R01 Additional FEMA NRI indicators, including wildfire | A | Medium | Roadmap; staged subset includes WFIR_RISKS; C05 normalizer can be reused | Same official provenance/dictionary gate; new toggle/composite/peer behavior must be specified. Not an active wildfire feed | Decide individual structural hazard toggle versus composite, validate release field and add source/quality UI |
| R02 EIA utility peak-demand data for percent-of-peak comparison | A; N reviews | Hard | Open v1 question; EIA ingest reusable, relevant field not accepted | Need matching entity, sector, year and coincident/noncoincident peak definition; nameplate fleet MW is not measured peak reduction | Inspect official workbook/dictionary and identify compatible denominator; omit ratio until validated |
| R03 FEMA NFHL detailed flood polygons | A | Hard | Roadmap; official discovery link in §10, no download verified | Effective-date/coverage gaps, large geometry/tile delivery, spatial intersections and distinct risk interpretation; NRI ingest is not sufficient | Inventory official coverage/product terms and select bounded sample; design separate geometry layer before statewide ingest |
| R04 Precise utility/PUCT or archived HIFLD service-territory polygons | A | Hard | Roadmap; county-union display reusable, precise publisher artifact unverified | Access/archive availability, license, vintage, overlaps and identity matching; exact geometry still may not supply customers by utility | Verify publisher/archive lineage and permission, reconcile EIA IDs and overlap; retain county-membership label until accepted |
| R05 Historical storm replay: outage trajectories, event labels and dated profiles | N model; A UI | Hard | Replay/event code exists; map timeline and accepted event-series export absent | Reuses C12/C14/C15 but needs aligned UTC samples, storm attribution/source, payload sizing and chronology. No new live data implied | Freeze per-event series contract and sourced event labels, validate one storm then build timeline |
| R06 NWS forecasts / weather grids for 72-hour outlook | V adapter; N model; A UI | Hard | Roadmap; alert documentation reusable, forecast ingestion/calibration unverified | Forecast-cycle/lead-time alignment, county aggregation, training labels, uncertainty and backtest; alerts are not forecasts | Define predicted quantity and validation plan before choosing forecast fields/product and ingestion cadence |
| R07 Transmission/substation geospatial inventories | A; V acquisition support | Hard | Roadmap; map renderer reusable, no accepted inventory | Publisher access/licensing, completeness/vintage, topology/IDs and geometry scale; public asset points do not establish electrical connectivity or loading | Select authoritative inventory and audit attributes/rights; scope a context overlay without stress claims |
| R08 Licensed live outage counts / footprints | V adapter; A integration | Hard; commercial access unresolved | Roadmap; no vendor selected or contract/rights verified | Provider coverage, redistribution rights/costs, refresh SLAs, utility identity, error states; historical EAGLE-I is not a replacement | Specify coverage/refresh/rights requirements, evaluate provider with approved access, design fixtures before integration |
| R09 Utility-provided feeder/substation loads, topology and constraints; fleet telemetry/location/dispatch | Utility/Base partner; N model, V secure adapter, A presentation (proposed) | Hard; partner data dependency | Roadmap; no access or source contract established | Sensitive/nonpublic data, enrollment and interconnection status, dispatch/SoC/losses and engineering validation. Required for targeted/nodal-relief claims | Agree study scope, authorized data access and engineering owner; produce validated circuit study before any relief claim |

Precise territory archives, forecast products and infrastructure inventories are source families still needing discovery, not promises that a current endpoint has been tested. Historical load profiles and outage series used in roadmap replay remain the core source versions; do not duplicate acquisition under a second name. Shared cloud storage is an infrastructure dependency (§5), not an evidence source; provider/access selection must be tracked alongside, without adding fabricated source rows.

### Recommended first sequence and maintenance

1. Confirm schemas and source manifests, then C01–C03 to establish facts, IDs and visible geography. Reconcile existing C07/C08 code early because it unblocks downstream joins.
2. Start the **high-value, harder** C12/C15 Nolan handoff and C05 FEMA access/dictionary resolution immediately; do not postpone outage validity merely because easy rows can be completed first.
3. Acquire C04 and resolve C10 allocation. Deliver the narrowed outage/weather slice from section 8 if allocation or live work remains unavailable; withhold unsupported ranks/fleet metrics.
4. V can develop C09/C16 handoffs independently of static assembly. They must pass empty/stale/failure gates before “Right now” is presented as live.
5. Add C06/C11/C13 and C14 validated coverage to complete the structural/fleet experience; defer roadmap sources until their product claim and dependency are agreed.

**Easy is not synonymous with important.** Source priority follows the intended claim, dependency order and validation risk. Maintain each row with `last_reviewed`, source/artifact version, evidence path or commit, current access state, owner and next action (these may become structured register fields later). A successful download changes acquisition status only; “accepted” requires normalization, geographic joins, UI behavior and refresh/failure verification. Re-review this snapshot when branches or staged files change.

## 12. Definition of done

A versioned, reproducible release connects official-source evidence and Nolan's validated outputs to Alejandro's map, with explicit multi-utility geography, household proxy labels, defensible ranking coverage and qualified fleet calculations. Victor's current conditions have independent freshness/failure behavior. Every number can be traced to a manifest and method. Neither the household experience nor county government sales is introduced into this scope. A partial release states its omissions; a full release passes section 8. This PRD authorizes a concrete implementation plan, not a claim that the planned integration is already delivered.
