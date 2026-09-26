/** All numbers, geometries, timestamps, and eligibility results below are SYNTHETIC.
 * Source URLs identify real providers; this is not captured upstream data.
 * This module is opt-in and is not connected to the production dashboard.
 */
import type {
  AreaGeometry, CountyOutageEvent, Evidence, MapLayer, RiskReport,
  RiskReportError, RiskReportRequest, Section, SourceDefinition, SourceExampleMap,
  SourceId, SpatialScope,
} from "../types/risk-data";

export const sourceCatalog = {
  census_geocoder: { name: "Census Geocoder", url: "https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html", access: "public_api" },
  eaglei: { name: "ORNL EAGLE-I", url: "https://doi.org/10.6084/m9.figshare.24237376", access: "download" },
  ercot_profiles: { name: "ERCOT actual load profiles", url: "https://www.ercot.com/mktinfo/loadprofile/alp", access: "download" },
  ercot_rtm: { name: "ERCOT NP6-785-ER", url: "https://www.ercot.com/mp/data-products/data-product-details?id=NP6-785-ER", access: "download" },
  base_availability: { name: "Base availability", url: "https://www.basepowercompany.com/pricing", access: "manual" },
  openei_utilities: { name: "OpenEI ZIP-to-utility", url: "https://data.openei.org/submissions/8563", access: "download" },
  nws_alerts: { name: "NWS alerts", url: "https://www.weather.gov/documentation/services-web-alerts", access: "public_api" },
  fema_nri: { name: "FEMA National Risk Index", url: "https://www.fema.gov/about/openfema/data-sets/national-risk-index-data", access: "download" },
  eia861: { name: "EIA-861 reliability", url: "https://www.eia.gov/electricity/data/eia861/", access: "download" },
  acs5: { name: "ACS 5-year B25032", url: "https://api.census.gov/data/2024/acs/acs5/groups/B25032.html", access: "public_api" },
  ercot_live: { name: "ERCOT public API", url: "https://developer.ercot.com/applications/pubapi/user-guide/registration-and-authentication/", access: "authenticated_api" },
  pnnl_events: { name: "PNNL event-correlated outages", url: "https://data.openei.org/submissions/6458", access: "download" },
  noaa_storm_events: { name: "NOAA Storm Events", url: "https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/", access: "download" },
  smart_meter_texas: { name: "Smart Meter Texas", url: "https://www.smartmetertexas.com/", access: "user_upload" },
  fema_nfhl: { name: "FEMA flood hazard layer", url: "https://msc.fema.gov/portal/advanceSearch", access: "download" },
  noaa_surge: { name: "NOAA storm surge scenarios", url: "https://www.nhc.noaa.gov/nationalsurge/", access: "download" },
  usfs_wildfire: { name: "USFS wildfire risk", url: "https://wildfirerisk.org/download/", access: "download" },
  iem_warnings: { name: "IEM NWS warning archive", url: "https://mesonet.agron.iastate.edu/request/gis/watchwarn.phtml", access: "download" },
  spc_outlook: { name: "SPC severe-weather outlooks", url: "https://www.spc.noaa.gov/gis/", access: "download" },
  wpc_forecast: { name: "WPC forecast GIS", url: "https://www.wpc.ncep.noaa.gov/html/about_gis.shtml", access: "download" },
} satisfies Record<SourceId, SourceDefinition>;

const now = "2026-09-26T12:00:00Z";
const historyWindow = { start: "2024-01-01T00:00:00Z", end: "2025-01-01T00:00:00Z" };
const eventWindow = { start: "2024-07-08T12:00:00Z", end: "2024-07-08T13:00:00Z" };
const forecastWindow = { start: now, end: "2026-09-27T12:00:00Z" };

function evidence(sourceId: SourceId, spatialScope: SpatialScope, method: string | null = null): Evidence[] {
  return [{ sourceId, datasetVersion: "synthetic-fixture-v1", sourceRecordId: `demo-${sourceId}`,
    retrievedAt: now, spatialScope, resolutionMeters: null, method,
    qualityFlags: ["synthetic_example"] }];
}

function available<T>(data: T, expiresAt: string | null = null): Section<T> {
  return { status: "available", data, asOf: now, expiresAt, issues: [] };
}

// Closed, counterclockwise exterior ring; intentionally a simple demonstration box.
const demoPolygon: AreaGeometry = {
  type: "Polygon",
  coordinates: [[[-95.40, 29.73], [-95.32, 29.73], [-95.32, 29.79], [-95.40, 29.79], [-95.40, 29.73]]],
};

const profileIntervals = [
  { start: "2024-07-08T12:00:00Z", end: "2024-07-08T12:15:00Z", kwh: 0.45, quality: "modeled" as const },
  { start: "2024-07-08T12:15:00Z", end: "2024-07-08T12:30:00Z", kwh: 0.50, quality: "modeled" as const },
];

export const sourceExamples: SourceExampleMap = {
  census_geocoder: {
    address: { line1: "100 Example Lane", city: "Houston", state: "TX", postalCode: "77002", country: "US", longitude: -95.36, latitude: 29.76 },
    point: { type: "Point", coordinates: [-95.36, 29.76] }, accuracy: "address_match",
    countyFips: "48201", tractGeoid: "48201000100", timeZone: "America/Chicago",
    evidence: evidence("census_geocoder", "address", "Example coordinate and geographic identifiers; not an actual geocode. Time zone is separately derived."),
  },
  eaglei: {
    countyFips: "48201", observedAt: "2024-07-08T12:00:00Z", customersOut: 1200,
    observationStatus: "reported", evidence: evidence("eaglei", "county"),
  },
  ercot_profiles: {
    basis: "scaled_profile", profileType: "RESLOWR", weatherZone: "COAST", timeZone: "America/Chicago",
    window: { start: profileIntervals[0].start, end: profileIntervals[1].end },
    targetAnnualKwh: 12000, scaleFactor: 1.2, intervals: profileIntervals,
    evidence: evidence("ercot_profiles", "weather_zone", "Synthetic annual reference total 10,000 kWh; 12,000 / 10,000 = 1.2. Returned intervals are a slice after scaling."),
  },
  ercot_rtm: {
    settlementPoint: "LZ_HOUSTON", settlementPointType: "load_zone", currency: "USD", unit: "USD/MWh", timeZone: "America/Chicago",
    intervals: profileIntervals.map(({ start, end }, index) => ({ start, end, price: index === 0 ? 75 : -10 })),
    evidence: evidence("ercot_rtm", "load_zone"),
  },
  base_availability: {
    utilityId: "demo-utility-a", products: ["energy_and_backup"], eligibility: "utility_candidate", verifiedAt: now,
    evidence: evidence("base_availability", "utility", "Illustrative offering only; requires real utility and address verification."),
  },
  openei_utilities: {
    candidates: [
      { utilityId: "demo-utility-a", name: "Example Delivery Utility A", ownership: "iou", matchBasis: "zip" },
      { utilityId: "demo-utility-b", name: "Example Cooperative B", ownership: "non_iou", matchBasis: "zip" },
    ], confirmedUtilityId: null, confirmation: "required", evidence: evidence("openei_utilities", "zip"),
  },
  nws_alerts: {
    id: "demo-alert-wind", kind: "alert", hazard: "wind", title: "Example severe thunderstorm warning",
    issuedAt: "2026-09-26T11:55:00Z", window: { start: "2026-09-26T11:55:00Z", end: "2026-09-26T12:30:00Z" },
    severity: "severe", category: null, probability: null, footprint: demoPolygon, affectedZoneIds: [],
    homeRelation: "inside", layerId: "demo-layer-alert", evidence: evidence("nws_alerts", "hazard_footprint"),
  },
  fema_nri: {
    id: "demo-nri-winter", hazard: "winter_weather", metric: { kind: "nri_relative_score", score: 62, scale: "0_to_100", rating: "Relatively Moderate" },
    homeRelation: "unknown", layerId: null, featureId: null, evidence: evidence("fema_nri", "county"),
  },
  eia861: {
    utilityId: "demo-utility-a", state: "TX", year: 2024, standard: "IEEE",
    saidiMinutesWithMajorEvents: 420, saidiMinutesWithoutMajorEvents: 110,
    evidence: evidence("eia861", "utility"),
  },
  acs5: {
    tractGeoid: "48201000100", survey: "2024 ACS 5-year",
    ownerOccupiedDetached: { estimate: 850, marginOfError: 90 },
    ownerOccupiedAttached: { estimate: 120, marginOfError: 35 }, evidence: evidence("acs5", "tract"),
  },
  ercot_live: {
    observedAt: "2026-09-26T11:55:00Z", status: "normal", loadMw: 62000,
    availableCapacityMw: 71000, operatingReservesMw: 4500, evidence: evidence("ercot_live", "grid"),
  },
  pnnl_events: {
    id: "demo-correlated-2023", name: "Example correlated disturbance", countyFips: ["48201"],
    window: { start: "2023-06-01T12:00:00Z", end: "2023-06-01T13:00:00Z" },
    doe417EventId: "demo-doe417-id", linkedOutageIds: [],
    evidence: evidence("pnnl_events", "county", "Keep separate from raw EAGLE-I to avoid double-counting; no 2024 PNNL match is claimed."),
  },
  noaa_storm_events: {
    id: "demo-observed-wind", name: "Example wind event", hazards: ["wind"], window: eventWindow,
    kind: "observed_event", homeRelation: "county_context", footprint: null, layerId: null,
    evidence: evidence("noaa_storm_events", "county", "Retain county/zone and point records; do not invent an observed polygon."),
  },
  smart_meter_texas: {
    basis: "meter_upload", profileType: null, weatherZone: null, timeZone: "America/Chicago",
    window: { start: profileIntervals[0].start, end: profileIntervals[1].end },
    targetAnnualKwh: null, scaleFactor: null,
    intervals: profileIntervals.map((interval, index) => ({ ...interval, kwh: index === 0 ? 0.32 : null, quality: index === 0 ? "measured" : "missing" })),
    evidence: evidence("smart_meter_texas", "address", "Client-side normalized upload; contains no ESIID, meter number, or original file."),
  },
  fema_nfhl: {
    id: "demo-flood-exposure", hazard: "flood",
    metric: { kind: "flood_zone", zone: "AE", annualChance: 0.01, specialFloodHazardArea: true },
    homeRelation: "inside", layerId: "demo-layer-flood", featureId: "demo-flood-polygon", evidence: evidence("fema_nfhl", "hazard_footprint"),
  },
  noaa_surge: {
    id: "demo-surge-exposure", hazard: "storm_surge",
    metric: { kind: "surge_scenario", hurricaneCategory: 3, inundationDepthMeters: 0.6, scenarioDescription: "Synthetic category-3 scenario; not an annual probability or current forecast." },
    homeRelation: "inside", layerId: "demo-layer-surge", featureId: null,
    evidence: evidence("noaa_surge", "raster_cell", "Point sample of a scenario raster; actual provider resolution must be preserved."),
  },
  usfs_wildfire: {
    id: "demo-wildfire-exposure", hazard: "wildfire",
    metric: { kind: "wildfire", metricName: "Annual burn probability", value: 0.002, unit: "probability_per_year" },
    homeRelation: "inside", layerId: null, featureId: null, evidence: evidence("usfs_wildfire", "raster_cell"),
  },
  iem_warnings: {
    id: "demo-historical-warning", name: "Example archived wind warning", hazards: ["wind"], window: eventWindow,
    kind: "warning", homeRelation: "inside_warning", footprint: demoPolygon, layerId: "demo-layer-history",
    evidence: evidence("iem_warnings", "hazard_footprint"),
  },
  spc_outlook: {
    id: "demo-spc-wind", kind: "outlook", hazard: "wind", title: "Example wind outlook", issuedAt: now,
    window: forecastWindow, severity: "unknown", category: null, probability: { value: 0.15, definition: "Example probability of damaging thunderstorm wind within 25 miles of a point during this outlook period; verify the selected product definition." },
    footprint: demoPolygon, affectedZoneIds: [], homeRelation: "inside", layerId: "demo-layer-spc", evidence: evidence("spc_outlook", "hazard_footprint"),
  },
  wpc_forecast: {
    id: "demo-wpc-rain", kind: "forecast", hazard: "flood", title: "Example excessive rainfall outlook",
    issuedAt: now, window: forecastWindow, severity: "unknown", category: { code: "SLGT", label: "Slight" }, probability: null,
    footprint: demoPolygon, affectedZoneIds: [], homeRelation: "inside", layerId: "demo-layer-wpc", evidence: evidence("wpc_forecast", "hazard_footprint"),
  },
};

export const outageExample: CountyOutageEvent = {
  id: "demo-county-outage", countyFips: "48201", window: eventWindow,
  peakCustomersOut: 1200, customerHoursInterrupted: 750, observedIntervals: 4, expectedIntervals: 4,
  weatherLinks: [
    { weatherEventId: "demo-historical-warning", relationship: "space_time_overlap", method: "County intersects warning; event windows overlap. Association only." },
    { weatherEventId: "demo-observed-wind", relationship: "space_time_overlap", method: "Same county and overlapping time window. Association only." },
  ],
  evidence: evidence("eaglei", "county", "Demo rule: consecutive 15-minute observations above zero form an event, ending at the next observed zero. Samples 1200,1000,600,200 yield 750 customer-hours; gaps split/censor events, never become zero."),
};

function polygonLayer(id: string, recordId: string, title: string, purpose: MapLayer["purpose"], hazard: MapLayer["hazard"], sourceId: SourceId, featureId = `${id}-feature`): MapLayer {
  return {
    id, title, purpose, hazard, bounds: [-95.40, 29.73, -95.32, 29.79],
    window: purpose === "long_term" ? null : purpose === "historical" ? eventWindow : forecastWindow,
    attribution: `${sourceCatalog[sourceId].name} — synthetic demonstration geometry`,
    legend: [{ key: "example", label: "Example footprint", color: "#d97706" }],
    payload: { kind: "geojson", data: { type: "FeatureCollection", features: [{ type: "Feature", id: featureId, geometry: demoPolygon, properties: { recordId, label: title, legendKey: "example" } }] } },
    evidence: evidence(sourceId, "hazard_footprint"),
  };
}

export const exampleLayers: MapLayer[] = [
  polygonLayer("demo-layer-flood", "demo-flood-exposure", "Example flood zone", "long_term", "flood", "fema_nfhl", "demo-flood-polygon"),
  polygonLayer("demo-layer-history", "demo-historical-warning", "Example historical warning", "historical", "wind", "iem_warnings"),
  { ...polygonLayer("demo-layer-alert", "demo-alert-wind", "Example active warning", "current", "wind", "nws_alerts"), window: sourceExamples.nws_alerts.window },
  polygonLayer("demo-layer-spc", "demo-spc-wind", "Example wind outlook", "current", "wind", "spc_outlook"),
  polygonLayer("demo-layer-wpc", "demo-wpc-rain", "Example rainfall outlook", "current", "flood", "wpc_forecast"),
  {
    id: "demo-layer-surge", title: "Example category-3 surge scenario", purpose: "long_term", hazard: "storm_surge",
    bounds: [-96, 28, -94, 30], window: null, attribution: "NOAA NHC — synthetic tile reference",
    legend: [{ key: "shallow", label: "0–1 m inundation", color: "#38bdf8" }],
    payload: { kind: "raster_tiles", tiles: ["https://tiles.example.invalid/surge/category-3/{z}/{x}/{y}.png"], tileSize: 256, minZoom: 0, maxZoom: 14, unit: "meters", noDataValue: -9999 },
    evidence: evidence("noaa_surge", "raster_cell"),
  },
];

export const reportRequest: RiskReportRequest = {
  address: sourceExamples.census_geocoder.address, confirmedUtilityId: null, historyWindow,
};

export const exampleReport: RiskReport = {
  schemaVersion: "0.1.0", reportId: "demo-report", dataMode: "synthetic", generatedAt: now, historyWindow,
  location: available(sourceExamples.census_geocoder),
  home: { utilities: available(sourceExamples.openei_utilities), availability: available([sourceExamples.base_availability]), housingContext: available(sourceExamples.acs5) },
  weather: {
    exposures: available([sourceExamples.fema_nfhl, sourceExamples.noaa_surge, sourceExamples.usfs_wildfire, sourceExamples.fema_nri]),
    history: available([sourceExamples.iem_warnings, sourceExamples.noaa_storm_events]),
    current: available([sourceExamples.nws_alerts, sourceExamples.spc_outlook, sourceExamples.wpc_forecast], "2026-09-26T12:05:00Z"),
  },
  grid: {
    countyOutages: available([outageExample]), reliability: available([sourceExamples.eia861]),
    live: available(sourceExamples.ercot_live, "2026-09-26T12:05:00Z"), prices: available(sourceExamples.ercot_rtm),
  },
  usage: available(sourceExamples.ercot_profiles), mapLayers: available(exampleLayers),
};

/** A successful empty response is different from an upstream failure. */
export const noAlertsExample: Section<SourceExampleMap["nws_alerts"][]> = available([], "2026-09-26T12:05:00Z");

export const zoneAlertExample: SourceExampleMap["nws_alerts"] = {
  ...sourceExamples.nws_alerts, id: "demo-zone-alert", title: "Example zone-based heat alert", hazard: "heat",
  footprint: null, affectedZoneIds: ["demo-zone-id"], homeRelation: "zone_match", layerId: null,
  evidence: evidence("nws_alerts", "forecast_zone", "Resolve real affectedZones geometry server-side; never draw a point buffer as an alert boundary."),
};

export const missingObservationExample: SourceExampleMap["eaglei"] = {
  ...sourceExamples.eaglei, observedAt: "2024-07-08T13:15:00Z", customersOut: null, observationStatus: "missing_unknown",
};

export const partialReport: RiskReport = {
  ...exampleReport, reportId: "demo-report-partial", generatedAt: "2026-09-26T12:40:00Z",
  weather: {
    ...exampleReport.weather,
    current: { status: "stale", data: [sourceExamples.nws_alerts], asOf: now, expiresAt: "2026-09-26T12:05:00Z", issues: [
      { code: "upstream_error", message: "Weather updates are temporarily unavailable. Last checked at 12:00 UTC.", sourceId: "nws_alerts" },
      { code: "expired", message: "The cached warning has expired; do not show it as active.", sourceId: "nws_alerts" },
    ] },
  },
  grid: { ...exampleReport.grid, live: { status: "unavailable", data: null, asOf: null, expiresAt: null, issues: [
    { code: "upstream_error", message: "Current grid conditions are temporarily unavailable.", sourceId: "ercot_live" },
  ] } },
  mapLayers: available(exampleLayers.filter((layer) => layer.purpose !== "current")),
};

export const approximateLocationReport: RiskReport = {
  ...exampleReport, reportId: "demo-report-zip-centroid",
  location: { status: "available", asOf: now, expiresAt: null, issues: [
    { code: "approximate_location", message: "Showing a ZIP-area location; address-level hazard matching is unavailable.", sourceId: null },
  ], data: { ...sourceExamples.census_geocoder, accuracy: "zip_centroid", countyFips: null, tractGeoid: null,
    // No fallback provider has been selected; do not attribute this to Census Geocoder.
    evidence: [] } },
  home: { ...exampleReport.home, housingContext: { status: "unavailable", data: null, asOf: null, expiresAt: null, issues: [
    { code: "approximate_location", message: "A ZIP centroid does not establish the home's tract.", sourceId: null },
  ] } },
  weather: {
    exposures: { status: "unavailable", data: null, asOf: null, expiresAt: null, issues: [{ code: "approximate_location", message: "Confirm a precise address to evaluate local exposure.", sourceId: null }] },
    history: { status: "unavailable", data: null, asOf: null, expiresAt: null, issues: [{ code: "approximate_location", message: "Historical address matches are unavailable.", sourceId: null }] },
    current: { status: "unavailable", data: null, asOf: null, expiresAt: null, issues: [{ code: "approximate_location", message: "Cannot determine which alerts include this home.", sourceId: null }] },
  },
  grid: { ...exampleReport.grid, countyOutages: { status: "unavailable", data: null, asOf: null, expiresAt: null, issues: [{ code: "approximate_location", message: "The home's county is unresolved.", sourceId: null }] } },
  mapLayers: available([]),
};

export const errorExample: RiskReportError = {
  schemaVersion: "0.1.0", requestId: "demo-request-not-found",
  error: { code: "address_not_found", message: "We could not locate this address. Check the street and ZIP code.", retryable: false },
};
