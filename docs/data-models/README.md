# Risk-data frontend handoff — proposal v0.1

This is a reviewable starting contract for the Base/Porchlight map and report. It covers the original 14 sources plus NFHL, surge, wildfire, IEM, SPC, and WPC. **All example addresses, identifiers, measurements, geometry, dates, and product eligibility are synthetic.** Source links are real. No example establishes risk or eligibility for an actual home.

These are **normalized application payloads**, not verbatim provider responses or verified provider schemas. Backend adapters will translate and validate real provider records into these shapes. No ingestion jobs, API routes, live feeds, database migrations, or UI changes are included.

## Files to hand off

| File | Use |
| --- | --- |
| [TypeScript interfaces](../../src/lib/types/risk-data.ts) | Shared request, response, record, geometry, and loading-result contracts. |
| [Typed fixtures](../../src/lib/fixtures/risk-data.ts) | Import `exampleReport`, `partialReport`, or `approximateLocationReport` into a development view. Includes one example for each source. |
| [Report request](examples/report-request.json) | Example request body. |
| [Report response](examples/risk-report.json) | Complete successful report, including inline demo polygons. |
| [Source examples](examples/source-examples.json) | Provider catalog plus 20 normalized adapter records. |
| [Edge cases](examples/edge-cases.json) | Component examples for empty, stale, unavailable, approximate, null geometry, and missing readings. This is not a complete report response. |

Regenerate JSON after changing the typed fixtures:

```sh
node docs/data-models/export-fixtures.mjs
```

Suggested frontend development import:

```ts
import type { RiskReport } from "@/lib/types/risk-data";
import { exampleReport, partialReport } from "@/lib/fixtures/risk-data";

const report: RiskReport = exampleReport;
// Switch to partialReport to exercise stale alerts and unavailable grid data.
```

Display a visible “Demo data” label whenever `dataMode === "synthetic"`. Fixtures have a fixed reference clock of `2026-09-26T12:00:00Z`; the partial-report clock is 40 minutes later. Use that clock in previews; on a live client evaluate expiry against current time. Tile URLs under `example.invalid` are deliberately nonfunctional; inline polygons render immediately, while the raster example only demonstrates the interface.

## Frontend view mapping

The current dashboard and menu are in `src/components/risk/`. They currently center a Mapbox map using onboarding coordinates; the new contract is additive.

| Existing view | Proposed response data | Components to build |
| --- | --- | --- |
| Weather analysis | `weather.exposures`, `weather.history`, `weather.current`, `mapLayers` | Hazard cards, historical timeline, active-threat list, layer toggles and legends. |
| Grid analysis | `grid.countyOutages`, `grid.reliability`, `grid.live`, `grid.prices` | County outage chart, utility context, grid snapshot, wholesale price chart. |
| Usage levels | `usage` | kWh interval chart, modeled/measured badge, missing-interval treatment. |
| My home | `location`, `home.utilities`, `home.availability`, `home.housingContext` | Address precision, utility confirmation, candidate products. ACS is optional area context, never a claim about this household. |

The existing `Address` type is reused. `HomeLocation.point` is authoritative for new map views. When mapping back to onboarding, keep its coordinates consistent with optional `Address.longitude`/`latitude`. Current Mapbox geocoding returns only longitude, latitude, and label; it does not yet implement Census identifiers, quality, or provenance. Adapt it explicitly rather than casting its response to `HomeLocation`. Time zone lookup is a separate enrichment and is not supplied by the Census geocoder.

## Proposed API boundary

`POST /api/risk/report` is a **proposed route, not implemented**. It takes `RiskReportRequest` and returns `RiskReport`. An individual provider outage should normally yield HTTP 200 with affected sections marked unavailable/stale, retaining useful sections. Suggested top-level failures use `RiskReportError`: 400 invalid input, 422 unlocatable address, 503 no report can be produced. The user can correct an unlocatable address; no retries with identical input are expected for that error.

The request carries a history window and an optional confirmed utility ID. In production, IDs must be validated against the utility catalog and location. Large history and interval datasets should move to separate paginated endpoints with explicit cursor/window metadata; v0.1 fixtures contain only the exact small window indicated. A production viewport-layer endpoint should accept bounds and enabled layer IDs. Do not fetch national polygons or multi-year interval series on each browser request.

Frontend loading is local request state (`loading`/`error`/`ready`), distinct from provider availability inside the returned report. Persisting a report should include its contract version and input hash; provider retrieval and transformations happen behind the API. Keep provider credentials and private meter files out of browser response payloads.

## Source-to-model mapping

Names in the right column are proposed normalized fields, not promises about upstream column names.

| Source / example key | Model | Adapter responsibility / caution |
| --- | --- | --- |
| Census / `census_geocoder` | `HomeLocation` | Coordinates plus county/tract IDs; preserve benchmark and vintage. Census address matches are not necessarily rooftop points. |
| OpenEI / `openei_utilities` | `UtilityMatch` | Preserve all ZIP candidates; normalize utility IDs and distinguish delivery utilities from retailers. User confirmation remains required. |
| Base / `base_availability` | `ProductAvailability` | Hand-maintained offering record with checked date; utility-level candidate does not establish address eligibility. Empty products with confirmed unavailability differs from missing source data. |
| NFHL / `fema_nfhl` | `HazardExposure`, flood metric | Map zone/subtype to chance only when justified. Missing map coverage is unknown, not outside flood risk. |
| NOAA surge / `noaa_surge` | `HazardExposure`, surge metric | Sample scenario raster; retain category, scenario definition, units, and NoData. Scenario depth is not annual probability. |
| USFS / `usfs_wildfire` | `HazardExposure`, wildfire metric | Preserve the specific metric, its units, resolution and release. Burn probability and risk-to-homes index are different quantities. |
| NRI / `fema_nri` | `HazardExposure`, relative score | Preserve county/tract scope. A 62 score means neither 62% annual chance nor home outage risk. |
| IEM / `iem_warnings` | `WeatherEvent` | Historical warning geometry/time; threatened area, not observed damage. |
| NOAA Storm Events / `noaa_storm_events` | `WeatherEvent` | County/zone and point observations; no invented footprint. County and forecast-zone codes need different joins. |
| PNNL / `pnnl_events` | `CorrelatedEvent` | Label/group EAGLE-I events using published correlation; retain DOE-417 linkage and avoid double counting. Example remains in 2023. |
| EAGLE-I / `eaglei` | `OutageObservation` → `CountyOutageEvent` | Missing row means unknown; preserve coverage. Derived event segmentation and integration must have versioned methods. |
| EIA-861 / `eia861` | `UtilityReliability` | Keep utility, state, year, reporting standard and major-event-day treatment. Validate actual workbook headers. |
| NWS / `nws_alerts` | `CurrentThreat` | Preserve issue/valid times; resolve forecast-zone geometry when inline geometry is null. Handle updates/cancellations by provider identity. |
| SPC / `spc_outlook` | `CurrentThreat` | Include hazard, outlook window, probability definition and spatial neighborhood. Not home outage probability. |
| WPC / `wpc_forecast` | `CurrentThreat` | Start with excessive-rainfall threat polygons; product-specific snow/ice thresholds or accumulation units require a future metric extension. Do not mislabel rainfall chance as flood chance. |
| ERCOT live / `ercot_live` | `GridSnapshot` | Normalize each selected report's definitions and observation time; available capacity minus load is not automatically operating reserves. |
| ERCOT prices / `ercot_rtm` | `RtmPrices` | Settlement point/type, interval, USD/MWh. Preserve negative values. These are wholesale prices, not a customer's retail tariff. |
| ERCOT profiles / `ercot_profiles` | `HomeUsage` | Weather zone/profile, scaling reference and interval kWh. Weather zones differ from settlement load zones. |
| SMT / `smart_meter_texas` | `HomeUsage` | User-consented measured intervals replace modeled ones; missing usage is null. Original file and meter identifiers are excluded. |
| ACS / `acs5` | `HousingContext` | B25032_003E/003M detached and 004E/004M attached counts/MOEs; convert negative Census sentinel values to null with quality flags. |

The profile example's two intervals are a display slice after scaling a hypothetical full-year total, not a basis for annual extrapolation. The price example includes a negative value. Event associations show geographic/time overlap rather than claiming causal attribution or that the address lost power.

## Shared semantics

- **Space:** WGS84 GeoJSON coordinates always `[longitude, latitude]`. FIPS/GEOIDs are strings with leading zeros. Polygon rings are closed; preserve holes and MultiPolygons. `homeRelation` communicates a spatial relation, not property damage or outage occurrence.
- **Time:** timestamps are UTC ISO strings and windows are `[start, end)`. Keep the IANA zone for display. Adapters must resolve ERCOT/SMT repeated daylight-saving intervals with source indicators before conversion; do not deduplicate by local clock text or guess an ambiguous time.
- **Units:** usage is kWh per interval; price is USD/MWh; grid quantities are MW; SAIDI is minutes/customer/year; interrupted customer-hours are customers × hours. Fractions in probability fields are 0–1. NRI scores remain on their own 0–100 scale.
- **Outage math:** the fixture's 1,200 / 1,000 / 600 / 200 customers across four quarter-hours integrate to 750 customer-hours. This is not 750 hours of household interruption. A one-hour county event is not every customer's outage duration. Missing observations require a documented gap/censoring policy, never automatic zero fill. v0.1 does not promise a validated outage frequency estimate or coverage-adjusted rate.
- **Utility context:** reliability and availability can be shown as candidate-utility information before confirmation, clearly labeled. Do not display them as confirmed home service. The same canonical utility ID must connect these records.
- **Provenance:** retain source/release, record ID, retrieval time, spatial scope/resolution, method, and quality flags. `retrievedAt` is not the observation or model-production time. Add issue/observation dates where the product has them. Synthetic fallback location intentionally has empty provenance because no ZIP-centroid provider has been chosen; production must supply that provider and cannot claim a Census address match.
- **No composite score:** exposures retain native meaning. Do not populate the existing CRM `riskScore` from these fields without a separately specified, validated model.

## Partial results and freshness

| State | Meaning | Frontend behavior |
| --- | --- | --- |
| `available` with `data: []` | Successful query with no matching records | “No matching alerts” or appropriate empty state; not “zero risk.” |
| `available` with issues | Usable but incomplete/approximate data | Render the section with the relevant qualification. |
| `stale` with data | Last successful result retained after freshness expires | Show last checked time and stale label. Never label expired warnings active. |
| `unavailable` with `data: null` | No usable result | Render a local unavailable state; other sections remain useful. |

`expiresAt` is the cache freshness deadline. Each threat's `window.end` is its validity deadline. Neither implies a warning remains active after a cancellation; adapters must remove canceled/superseded products. The frontend should reevaluate validity over time. Historical information uses `expiresAt: null` and preserves its release version; this is not a claim it never needs updating.

An approximate ZIP centroid must not trigger precise point-in-polygon assertions, tract assignment, or county outage claims. The approximate fixture suppresses those sections and allows map context only. Source-specific quality flags describe measurements, not arbitrary confidence percentages.

## Map rendering contract

`MapLayer.payload.kind` discriminates GeoJSON, vector tiles, and rendered raster tiles. `MapFeatureCollection` follows GeoJSON shape and can be passed to a Mapbox GeoJSON source. Feature IDs support selection; `recordId` links a feature to the report record, and `legendKey` links to the layer legend. Raster exposures reference a layer but have no feature ID. Legends and attribution travel with each layer.

For current layers, check their validity window and the current section's status. For historical layers, filter by the timeline; do not combine all past warnings into a single unlabeled “risk” polygon. The fixture uses the same demonstration rectangle across products to simplify UI development; it does not imply real hazard boundaries coincide.

Production rasters require a tiling service or prepared tiles (raw GeoTIFFs are not Mapbox raster tile templates). Vector tile layers require the actual `sourceLayer` name. Only inline GeoJSON is immediately renderable from this handoff. Layer-serving infrastructure, viewport pagination, styling integration, and raw-raster sampling are follow-up implementation work.

## Suggested storage identities

The report is a response assembled from these entities, not a suggestion to store everything in one wide table:

| Entity | Suggested identity / relationship |
| --- | --- |
| Source release | Source ID + release/version + immutable file/checksum metadata. |
| Geocoded location | Internal location ID + normalized address + geocoder benchmark/vintage. |
| Hazard geometry or raster | Source release + feature/asset ID; map layers reference these assets. |
| Weather event | Internal event ID with retained provider IDs; reconcile warning updates and event-source duplicates explicitly. |
| Outage observation | Source release + county FIPS + observation timestamp. |
| Derived outage event | County + window + derivation version; many-to-many links to weather events with association method. |
| Utility | Canonical internal ID with provider/EIA aliases; joins utility candidates, offerings and reliability. |
| Usage / price interval | Series ID + UTC interval start; series owns profile/meter basis or settlement point and source release. |
| Report snapshot | Report ID + schema version + generation time + input fingerprint; retain the source releases used. |

These are proposed keys, not database migrations. Source correction policies and release retention need agreement before ingestion.

## Backend decisions still to resolve

1. Select and pin source releases, geographic vintages, boundary services, and the ZIP-centroid fallback provider.
2. Establish canonical utility IDs and weather/load-zone lookup; agree on utility confirmation and Base eligibility verification.
3. Define coverage thresholds, outage event segmentation, gap censoring, deduplication, and weather association rules with the data team.
4. Agree on history pagination, interval windows, tile hosting, cache refresh policies, and report persistence/retention.
5. Validate raw adapters against representative provider files. TypeScript checks these examples at build time, not untrusted network JSON; runtime request/response validation is still required before a live API.

These decisions do not block frontend layout and state handling against the synthetic contract.
