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
  geometry: { counties: string; territories: string };
};
