/** Proposed frontend contract v0.1. Normalized app models, not provider schemas. */
import type { Address } from "./domain";

export type IsoDateTime = string; // ISO 8601 UTC, e.g. 2026-09-26T12:00:00Z
export type Position = [longitude: number, latitude: number];
export type AreaGeometry =
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };
export type SpatialScope = "address" | "raster_cell" | "hazard_footprint" | "forecast_zone" | "weather_zone" | "zip" | "tract" | "county" | "utility" | "load_zone" | "grid";
export type Hazard = "flood" | "storm_surge" | "hurricane" | "wind" | "tornado" | "hail" | "winter_weather" | "ice" | "heat" | "wildfire";

export type SourceId =
  | "census_geocoder" | "eaglei" | "ercot_profiles" | "ercot_rtm"
  | "base_availability" | "openei_utilities" | "nws_alerts" | "fema_nri"
  | "eia861" | "acs5" | "ercot_live" | "pnnl_events" | "noaa_storm_events"
  | "smart_meter_texas" | "fema_nfhl" | "noaa_surge" | "usfs_wildfire"
  | "iem_warnings" | "spc_outlook" | "wpc_forecast";

export interface SourceDefinition {
  name: string;
  url: string;
  access: "download" | "public_api" | "authenticated_api" | "manual" | "user_upload";
}

export interface Evidence {
  sourceId: SourceId;
  /** Release, file, benchmark/vintage, or adapter version; never silently use 'latest'. */
  datasetVersion: string;
  sourceRecordId: string | null;
  retrievedAt: IsoDateTime;
  spatialScope: SpatialScope;
  resolutionMeters: number | null;
  /** Adapter/transformation lineage; include threshold rules for derived events. */
  method: string | null;
  qualityFlags: string[];
}

export interface TimeWindow {
  start: IsoDateTime;
  end: IsoDateTime; // Exclusive; start must precede end.
}

export interface Issue {
  code: "upstream_error" | "coverage_gap" | "approximate_location" | "partial_coverage" | "expired" | "not_supported";
  message: string;
  sourceId: SourceId | null;
}

/** Missing is distinct from a successful empty list; stale retains last good data. */
export type Section<T> =
  | { status: "available" | "stale"; data: T; asOf: IsoDateTime; expiresAt: IsoDateTime | null; issues: Issue[] }
  | { status: "unavailable"; data: null; asOf: IsoDateTime | null; expiresAt: null; issues: Issue[] };

export interface HomeLocation {
  address: Address;
  point: { type: "Point"; coordinates: Position };
  accuracy: "address_match" | "zip_centroid";
  countyFips: string | null; // Five digits, including state prefix.
  tractGeoid: string | null; // Eleven digits; null for centroid fallback.
  timeZone: string; // IANA zone, not fixed UTC offset.
  evidence: Evidence[];
}

export interface UtilityMatch {
  candidates: { utilityId: string; name: string; ownership: "iou" | "non_iou"; matchBasis: "zip" | "address" }[];
  confirmedUtilityId: string | null;
  confirmation: "required" | "user_confirmed";
  evidence: Evidence[];
}

export interface ProductAvailability {
  utilityId: string;
  products: ("energy" | "energy_and_backup" | "backup_only")[];
  eligibility: "utility_candidate" | "address_confirmed" | "unavailable";
  verifiedAt: IsoDateTime;
  evidence: Evidence[];
}

export type ExposureMetric =
  | { kind: "flood_zone"; zone: string; annualChance: number | null; specialFloodHazardArea: boolean | null }
  | { kind: "surge_scenario"; hurricaneCategory: 1 | 2 | 3 | 4 | 5; inundationDepthMeters: number | null; scenarioDescription: string }
  | { kind: "wildfire"; metricName: string; value: number; unit: "probability_per_year" | "index" | "percentile" }
  | { kind: "nri_relative_score"; score: number; scale: "0_to_100"; rating: string };

export interface HazardExposure {
  id: string;
  hazard: Hazard;
  metric: ExposureMetric;
  /** 'unknown' includes insufficient location precision or missing mapped coverage. */
  homeRelation: "inside" | "outside" | "unknown";
  layerId: string | null;
  featureId: string | null;
  evidence: Evidence[];
}

export interface WeatherEvent {
  id: string;
  name: string;
  hazards: Hazard[];
  window: TimeWindow;
  kind: "warning" | "observed_event";
  homeRelation: "inside_warning" | "county_context" | "unknown";
  footprint: AreaGeometry | null;
  layerId: string | null;
  evidence: Evidence[];
}

export interface OutageObservation {
  countyFips: string;
  observedAt: IsoDateTime;
  customersOut: number | null;
  observationStatus: "reported" | "missing_unknown";
  evidence: Evidence[];
}

export interface CountyOutageEvent {
  id: string;
  countyFips: string;
  window: TimeWindow;
  peakCustomersOut: number;
  customerHoursInterrupted: number | null;
  observedIntervals: number;
  expectedIntervals: number;
  /** A temporal/spatial association does not establish weather causation. */
  weatherLinks: { weatherEventId: string; relationship: "space_time_overlap" | "source_correlated"; method: string }[];
  evidence: Evidence[];
}

export interface UtilityReliability {
  utilityId: string;
  state: string;
  year: number;
  standard: "IEEE" | "other" | "unknown";
  saidiMinutesWithMajorEvents: number | null;
  saidiMinutesWithoutMajorEvents: number | null;
  evidence: Evidence[];
}

export interface CurrentThreat {
  id: string;
  kind: "alert" | "outlook" | "forecast";
  hazard: Hazard;
  title: string;
  issuedAt: IsoDateTime;
  window: TimeWindow;
  severity: "extreme" | "severe" | "moderate" | "minor" | "unknown";
  /** Source-specific outlook category; never infer NWS severity from this. */
  category: { code: string; label: string } | null;
  probability: { value: number; definition: string } | null; // Fraction 0..1.
  footprint: AreaGeometry | null;
  affectedZoneIds: string[];
  homeRelation: "inside" | "zone_match" | "unknown";
  layerId: string | null;
  evidence: Evidence[];
}

/** Correlated dataset summary; intentionally not another raw county outage series. */
export interface CorrelatedEvent {
  id: string;
  name: string;
  window: TimeWindow;
  countyFips: string[];
  doe417EventId: string | null;
  linkedOutageIds: string[];
  evidence: Evidence[];
}

export interface EnergyInterval {
  start: IsoDateTime;
  end: IsoDateTime;
  kwh: number | null;
  quality: "measured" | "modeled" | "missing";
}

export interface HomeUsage {
  basis: "scaled_profile" | "meter_upload";
  profileType: "RESHIWR" | "RESLOWR" | null;
  weatherZone: string | null;
  timeZone: string;
  window: TimeWindow;
  targetAnnualKwh: number | null;
  /** Factor applied to the full reference period, never just the returned sample. */
  scaleFactor: number | null;
  intervals: EnergyInterval[];
  evidence: Evidence[];
}

export interface RtmPrices {
  settlementPoint: string;
  settlementPointType: "load_zone" | "hub";
  currency: "USD";
  unit: "USD/MWh";
  timeZone: string;
  intervals: { start: IsoDateTime; end: IsoDateTime; price: number | null }[];
  evidence: Evidence[];
}

export interface GridSnapshot {
  observedAt: IsoDateTime;
  status: "normal" | "conservation" | "emergency" | "unknown";
  loadMw: number | null;
  availableCapacityMw: number | null;
  operatingReservesMw: number | null;
  evidence: Evidence[];
}

export interface HousingContext {
  tractGeoid: string;
  survey: string;
  ownerOccupiedDetached: { estimate: number | null; marginOfError: number | null };
  ownerOccupiedAttached: { estimate: number | null; marginOfError: number | null };
  evidence: Evidence[];
}

export interface MapFeatureCollection {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    id: string;
    geometry: AreaGeometry;
    properties: { recordId: string; label: string; legendKey: string };
  }[];
}

/** Raster URL templates refer to rendered tiles, not raw GeoTIFF downloads. */
export type LayerData =
  | { kind: "geojson"; data: MapFeatureCollection }
  | { kind: "vector_tiles"; tiles: string[]; sourceLayer: string; minZoom: number; maxZoom: number }
  | { kind: "raster_tiles"; tiles: string[]; tileSize: 256 | 512; minZoom: number; maxZoom: number; unit: string; noDataValue: number | null };

export interface MapLayer {
  id: string;
  title: string;
  purpose: "long_term" | "historical" | "current";
  hazard: Hazard;
  bounds: [west: number, south: number, east: number, north: number];
  window: TimeWindow | null;
  attribution: string;
  legend: { key: string; label: string; color: string }[];
  payload: LayerData;
  evidence: Evidence[];
}

export interface RiskReportRequest {
  address: Address;
  confirmedUtilityId: string | null;
  historyWindow: TimeWindow;
}

export interface RiskReport {
  schemaVersion: "0.1.0";
  reportId: string;
  dataMode: "synthetic" | "production";
  generatedAt: IsoDateTime;
  historyWindow: TimeWindow;
  location: Section<HomeLocation>;
  home: {
    utilities: Section<UtilityMatch>;
    availability: Section<ProductAvailability[]>;
    housingContext: Section<HousingContext>;
  };
  weather: {
    exposures: Section<HazardExposure[]>;
    history: Section<WeatherEvent[]>;
    current: Section<CurrentThreat[]>;
  };
  grid: {
    countyOutages: Section<CountyOutageEvent[]>;
    reliability: Section<UtilityReliability[]>;
    live: Section<GridSnapshot>;
    prices: Section<RtmPrices>;
  };
  usage: Section<HomeUsage>;
  /** Small fixtures inline geometry; production may request layers by viewport. */
  mapLayers: Section<MapLayer[]>;
}

export type RiskReportError = {
  schemaVersion: "0.1.0";
  requestId: string;
  error: {
    code: "invalid_request" | "address_not_found" | "report_unavailable";
    message: string;
    retryable: boolean;
  };
};

/** One normalized adapter example per source, including sources outside the MVP. */
export interface SourceExampleMap {
  census_geocoder: HomeLocation;
  eaglei: OutageObservation;
  ercot_profiles: HomeUsage;
  ercot_rtm: RtmPrices;
  base_availability: ProductAvailability;
  openei_utilities: UtilityMatch;
  nws_alerts: CurrentThreat;
  fema_nri: HazardExposure;
  eia861: UtilityReliability;
  acs5: HousingContext;
  ercot_live: GridSnapshot;
  pnnl_events: CorrelatedEvent;
  noaa_storm_events: WeatherEvent;
  smart_meter_texas: HomeUsage;
  fema_nfhl: HazardExposure;
  noaa_surge: HazardExposure;
  usfs_wildfire: HazardExposure;
  iem_warnings: WeatherEvent;
  spc_outlook: CurrentThreat;
  wpc_forecast: CurrentThreat;
}
