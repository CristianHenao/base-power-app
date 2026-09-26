/** Shapes of the P-04 sales-map data contract (see the playbook). */

export type LayerId = "outages" | "weather" | "flood" | "scarcity" | "homes";

export type BaseOffer =
  | "energy_plus_backup"
  | "backup_program"
  | "energy_only"
  | "none";

export type MapLayerMeta = {
  id: LayerId;
  label: string;
  unit: string;
  source: string;
  as_of: string;
};

export type Preset = {
  id: string;
  label: string;
  layers: LayerId[];
};

export type CountyRecord = {
  fips: string;
  name: string;
  utilities: string[];
  customers: number;
  load_zone: string | null;
  centroid: [number, number];
  values: Record<LayerId, number | null>;
  ranks: Record<LayerId, number | null>;
};

export type UtilityRecord = {
  id: string;
  name: string;
  grid: "ERCOT" | "SPP" | "MISO" | "WECC";
  scored: boolean;
  base_offer: BaseOffer;
  counties: string[];
  customers: number;
  eligible_homes: number;
  label_point: [number, number];
  /** Share of long-outage hours one Core would have covered (dummy). */
  core_coverage_hours: number;
};

export type LiveAlert = { fips: string; event: string };

export type UtilityMapData = {
  mock: boolean;
  as_of: string;
  note: string;
  layers: MapLayerMeta[];
  presets: Preset[];
  battery: { kwh_per_core: number; kw_per_core: number };
  live: { as_of: string; ercot: string; alerts: LiveAlert[] };
  counties: CountyRecord[];
  utilities: UtilityRecord[];
  geometry: { counties: string; territories: string };
};
