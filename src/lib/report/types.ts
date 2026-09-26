/**
 * The /v1/report contract as the Porchlight API returns it (api/app/schemas.py).
 * tests/test_contract_drift.py fails CI if a field here and the Pydantic schema disagree.
 */

export type Heat = "electric" | "gas";
export type SourceStatus = "ok" | "degraded" | "unavailable" | "not_connected";
export type CoreKey = "cores_1" | "cores_2";

export interface ReportRequest {
  address?: string | null;
  county_fips?: string | null;
  zip?: string | null;
  heat?: Heat | null;
}

export interface Utility {
  name: string | null;
  eia_utility_id: number | null;
  detected_from: "zip" | "county";
  confirmed: boolean;
}

export interface Location {
  county_fips: string;
  county: string;
  tract_geoid: string | null;
  weather_zone: string;
  load_zone: string | null;
  utility: Utility;
}

export interface Home {
  profile_type: "RESHIWR" | "RESLOWR";
  label: string;
}

export interface BaseOffer {
  product: "energy_plus_backup" | "energy_only" | "backup_program" | "none";
  url: string | null;
}

export interface Outlook {
  level: number;
  label: "Low" | "Moderate" | "Elevated" | "High" | "Very high";
  long_outages_per_year: number;
  interval_90: [number, number];
  once_every_years: number;
  years_of_data: number;
  since: number;
  customers_floored: boolean;
}

/** [rotate, stay]: lower and upper per-home bounds in hours. Draw each band from min to max. */
export interface Band {
  p50: [number | null, number | null];
  p90: [number | null, number | null];
}

export interface Covered {
  homes: number | null;
  hours: number | null;
}

export interface Event {
  id: string;
  label: string;
  storm: string | null;
  start: string;
  peak_out: number;
  /** Null where the county's customer count is floored at its peak outage. */
  peak_out_pct: number | null;
  duration_h: Band;
  /** Null outside the demo homes: no per-storm replay. */
  covered: Record<CoreKey, Covered> | null;
  covered_order: "rotate" | "stay" | null;
  backup_h: Record<CoreKey, number | null> | null;
}

export interface HoursByMonth {
  cores_1: number[];
  cores_2: number[];
}

export interface BackupAssumptions {
  kwh_per_core: number;
  kw_per_core: number;
  start_soc: number;
  mode: "normal";
  profile_year: number;
}

/** An outage nobody forecast: normal use from Base's 20% reserve. */
export interface Surprise {
  start_soc: number;
  hours_by_month: HoursByMonth;
}

export interface Backup {
  hours_by_month: HoursByMonth;
  assumptions: BackupAssumptions;
  surprise: Surprise;
}

export interface Sizing {
  /** Null outside the demo homes; `reason` says why. */
  cores: number | null;
  reason: string;
  share: number | null;
}

export interface GapSeason {
  season: "winter" | "spring" | "summer" | "fall";
  outages_per_year: number;
  outages_lo: number;
  outages_hi: number;
  p50_hours: number | null;
  p90_hours: number | null;
  /** P(an outage lasts longer than hours_grid[i]) */
  survival: number[];
}

export interface TypicalHomeGap {
  dark_hours: Record<"none" | "one_core" | "two_cores" | "one_core_reserve" | "two_cores_reserve", number>;
  gap_chance: Record<"one_core" | "two_cores", number>;
  interval_scale: [number, number];
}

/** Expected hours a year this home is dark, and per-season survival curves for a household answer. */
export interface HouseholdGap {
  typical_home: TypicalHomeGap;
  hours_grid: number[];
  seasons: GapSeason[];
}

export interface Alert {
  event: string | null;
  severity: string | null;
  headline: string | null;
  ends: string | null;
}

/** ERCOT conditions from the snapshot worker; the price is for the report's load zone. */
export interface GridNow {
  status: string;
  note: string | null;
  eea_level: number;
  reserves_mw: number;
  demand_mw: number | null;
  capacity_mw: number | null;
  load_zone: string | null;
  price_mwh: number | null;
  as_of: string;
  stale: boolean;
}

export interface Live {
  alerts: Alert[];
  grid: GridNow | null;
}

export interface Narrative {
  status: "pending" | "ok" | "retried" | "template";
  headline?: string | null;
  summary?: string | null;
  fact_ids?: string[];
  url: string | null;
}

export interface Source {
  id: string;
  status: SourceStatus;
  as_of?: string | null;
  fallback?: string | null;
}

export interface Report {
  report_id: string;
  location: Location;
  home: Home;
  base_offer: BaseOffer;
  outlook: Outlook;
  events: Event[];
  backup: Backup;
  sizing: Sizing;
  household_gap: HouseholdGap | null;
  live: Live;
  narrative: Narrative;
  sources: Source[];
}
