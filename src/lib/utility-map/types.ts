/** Shapes of the utility-map data contract (docs/utility-map-prd-v3.md). */

export type LayerId =
  | "peak_demand"
  | "generation"
  | "price_spikes"
  | "outages"
  | "flood"
  | "tornado"
  | "severe_storm"
  | "hurricane"
  | "winter"
  | "heat"
  | "weather"
  | "homes";

export type LayerGroup = "grid" | "hazard" | "exposure";

/** Why a value is or isn't there. Missing never means zero. */
export type Quality = "ok" | "missing" | "not_applicable";

export type BaseOffer = "energy_plus_backup" | "backup_program" | "energy_only";

export type MapLayerMeta = {
  id: LayerId;
  group: LayerGroup;
  label: string;
  unit: string | null;
  period_start: string | null;
  period_end: string | null;
  source_ids: string[];
  method: string | null;
  available: boolean;
  unavailable_reason?: string;
  coverage: Record<Quality, number>;
  /** Spearman ρ with long-outage hours across counties; weak when ρ < 0.1. */
  outage_link?: { rho: number | null; n: number; weak: boolean | null } | null;
};

export type Preset = {
  id: string;
  label: string;
  /** Layers the lens turns on, limited to available ones. */
  layers: LayerId[];
  /** The full set the lens is designed for, including layers not built yet. */
  requested?: LayerId[];
};

export type CountyRecord = {
  fips: string;
  name: string;
  /** Every utility serving the county, largest estimated share first. */
  utilities: string[];
  primary_utility: string | null;
  customers: number | null;
  load_zone: string | null;
  load_zone_method: string | null;
  grid_status: "ercot" | "non_ercot" | "mixed";
  centroid: [number, number];
  values: Record<LayerId, number | null>;
  ranks: Record<LayerId, number | null>;
  quality: Record<LayerId, Quality>;
  /** Share of long-outage dark hours a Core's ~12 h of backup would cover (EAGLE-I estimate). */
  outage_coverage_12h?: number | null;
  /** Percent of land in FEMA's 1% annual-chance floodplain (demo counties only). */
  sfha_land_pct?: number | null;
  /** Operable net summer capacity by fuel, MW (EIA-860 2024). */
  generation_mix?: Record<"solar" | "wind" | "gas" | "coal" | "nuclear" | "storage" | "other", number>;
  risk?: RiskIndex;
};

/** Grid Risk Index (pipeline/utility_map/risk_index.py): 1-100 against Texas peers, higher = more at risk. */
export type RiskIndex = {
  index: number | null;
  level: 1 | 2 | 3 | 4 | 5 | null;
  band: string | null;
  /** 1 = most at risk among `of` peers (counties or utilities). */
  rank: number | null;
  of: number;
  /** Each half on its own 1-100 scale against the same peers. */
  hazard: number | null;
  stress: number | null;
  raw: number | null;
  sources: number;
  sources_total: number;
};

/** A utility's estimated customers in one county (EIA-861 membership, modeled split). */
export type CountyWeight = { fips: string; customers_est: number; share: number };

export type UtilityRecord = {
  id: string;
  eia_utility_id?: number;
  name: string;
  grid: "ERCOT" | "SPP" | "MISO" | "WECC";
  grids: string[];
  scored: boolean;
  /** Null when Base's offer isn't verified: unknown, not "not served". */
  base_offer: BaseOffer | null;
  offer_verification: "listed" | "unverified";
  counties: string[];
  county_weights: CountyWeight[];
  customers: number | null;
  eligible_homes: number | null;
  label_point: [number, number];
  core_coverage_hours: number | null;
  /** EIA-861 sales and peak demand; peak_source says whether the peak is reported or estimated. */
  grid_stats?: {
    summer_peak_mw: number | null;
    winter_peak_mw: number | null;
    sales_mwh: number | null;
    residential_mwh: number | null;
    peak_source: "eia861" | "ercot_zone_estimate" | null;
  } | null;
  risk?: RiskIndex;
};

export type LiveAlert = { fips: string; event: string };

export type SourceRef = { id: string; name: string; url: string };

export type UtilityMapData = {
  schema_version: string;
  release_id: string | null;
  mock: boolean;
  data_mode: "real" | "partial" | "mock";
  as_of: string;
  note: string;
  layers: MapLayerMeta[];
  presets: Preset[];
  scoring?: { risk_index?: string };
  battery: {
    kwh_per_core: number;
    kw_per_core: number;
    reserve_fraction: number;
    backup_hours_assumed: number;
    dispatch_window_h: number;
  };
  sources: SourceRef[];
  live: {
    status: "ok" | "stale" | "unavailable";
    as_of: string | null;
    ercot: string | null;
    alerts: LiveAlert[];
  };
  counties: CountyRecord[];
  utilities: UtilityRecord[];
  /** Release files; flood maps FIPS → FEMA flood-zone GeoJSON for the demo counties. */
  geometry: {
    counties: string;
    territories: string;
    flood?: Record<string, string>;
    hazards?: Partial<Record<"tornado" | "hurricane" | "severe_storm" | "storms", string>>;
    grid?: { generators?: string };
  };
};
