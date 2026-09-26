import type {
  BaseOffer,
  CountyRecord,
  LayerGroup,
  LayerId,
  MapLayerMeta,
  Quality,
  UtilityMapData,
  UtilityRecord,
} from "./types.ts";

/**
 * Finds and loads the utility-map data. The app reads the release that
 * public/utility-map/current.json points at; the old dummy mockup loads only
 * with ?data=mock, so dummy numbers never appear by accident.
 */

export const TEXAS_COUNTIES = 254;
const ROOT = "/utility-map";
const OFFERS: BaseOffer[] = ["energy_plus_backup", "backup_program", "energy_only"];
const V1_IDS: Record<string, LayerId> = {
  outages: "outages",
  weather: "weather",
  flood: "flood",
  scarcity: "price_spikes",
  homes: "homes",
};
const V1_GROUPS: Record<string, LayerGroup> = {
  outages: "grid",
  price_spikes: "grid",
  weather: "hazard",
  flood: "hazard",
  homes: "exposure",
};

type V1Layer = { id: string; label: string; unit: string; source: string; as_of: string };
type V1County = {
  fips: string;
  name: string;
  utilities: string[];
  customers: number;
  load_zone: string | null;
  centroid: [number, number];
  values: Record<string, number | null>;
  ranks: Record<string, number | null>;
};
type V1Utility = Omit<
  UtilityRecord,
  "base_offer" | "offer_verification" | "grids" | "county_weights"
> & { base_offer: string };
export type V1Data = {
  mock: boolean;
  as_of: string;
  note: string;
  layers: V1Layer[];
  presets: { id: string; label: string; layers: string[] }[];
  battery: { kwh_per_core: number; kw_per_core: number };
  live: { as_of: string | null; ercot: string | null; alerts: { fips: string; event: string }[] };
  counties: V1County[];
  utilities: V1Utility[];
  geometry: { counties: string; territories: string };
};

function remap<T>(record: Record<string, T>): Record<LayerId, T> {
  const out = {} as Record<LayerId, T>;
  for (const [key, value] of Object.entries(record)) out[V1_IDS[key] ?? (key as LayerId)] = value;
  return out;
}

/** Brings the v1 dummy mockup up to the current contract so the app has one shape. */
export function upgradeV1(v1: V1Data): UtilityMapData {
  const counties: CountyRecord[] = v1.counties.map((c) => {
    const values = remap(c.values);
    const quality = {} as Record<LayerId, Quality>;
    for (const id of Object.keys(values) as LayerId[]) {
      quality[id] =
        values[id] != null ? "ok" : id === "price_spikes" && !c.load_zone ? "not_applicable" : "missing";
    }
    return {
      ...c,
      primary_utility: c.utilities[0] ?? null,
      load_zone_method: c.load_zone ? "approximate" : null,
      grid_status: c.load_zone ? "ercot" : "non_ercot",
      values,
      ranks: remap(c.ranks),
      quality,
    };
  });

  const layers: MapLayerMeta[] = v1.layers.map((l) => {
    const id = V1_IDS[l.id] ?? (l.id as LayerId);
    const coverage: Record<Quality, number> = { ok: 0, missing: 0, not_applicable: 0 };
    for (const c of counties) coverage[c.quality[id]] += 1;
    return {
      id,
      group: V1_GROUPS[id] ?? "hazard",
      label: l.label,
      unit: l.unit,
      period_start: null,
      period_end: l.as_of,
      source_ids: [l.source],
      method: "Dummy values for the mockup.",
      available: true,
      coverage,
    };
  });

  const byFips = new Map(counties.map((c) => [c.fips, c]));
  const utilities: UtilityRecord[] = v1.utilities.map((u) => {
    const listed = OFFERS.includes(u.base_offer as BaseOffer);
    return {
      ...u,
      base_offer: listed ? (u.base_offer as BaseOffer) : null,
      offer_verification: listed ? "listed" : "unverified",
      grids: [u.grid],
      county_weights: u.counties.map((fips) => {
        const county = byFips.get(fips);
        const share = county ? 1 / Math.max(county.utilities.length, 1) : 1;
        return { fips, customers_est: Math.round((county?.customers ?? 0) * share), share };
      }),
    };
  });

  return {
    schema_version: "1.0",
    release_id: null,
    mock: true,
    data_mode: "mock",
    as_of: v1.as_of,
    note: v1.note,
    layers,
    presets: v1.presets.map((p) => ({ ...p, layers: p.layers.map((id) => V1_IDS[id] ?? (id as LayerId)) })),
    battery: {
      ...v1.battery,
      reserve_fraction: 0.2,
      backup_hours_assumed: 12,
      dispatch_window_h: 2,
    },
    sources: [],
    live: { status: v1.live.as_of ? "ok" : "unavailable", ...v1.live },
    counties,
    utilities,
    geometry: v1.geometry,
  };
}

const finiteOrNull = (value: unknown) =>
  value === null || (typeof value === "number" && Number.isFinite(value));

/** Checks the contract before anything is painted. Returns readable problems. */
export function validateContract(data: UtilityMapData, expectedCounties = TEXAS_COUNTIES): string[] {
  const errors: string[] = [];
  if (!data.schema_version) errors.push("Missing schema_version.");
  if (data.counties.length !== expectedCounties) {
    errors.push(`Expected ${expectedCounties} counties, found ${data.counties.length}.`);
  }
  const seen = new Set<string>();
  for (const county of data.counties) {
    if (seen.has(county.fips)) errors.push(`Duplicate county ${county.fips}.`);
    seen.add(county.fips);
    for (const layer of data.layers) {
      for (const field of ["values", "ranks"] as const) {
        const record = county[field] as Record<string, unknown>;
        if (!(layer.id in record)) {
          errors.push(`County ${county.fips} has no ${field}.${layer.id}.`);
        } else if (!finiteOrNull(record[layer.id])) {
          errors.push(`County ${county.fips} ${field}.${layer.id} is not a finite number.`);
        }
      }
    }
  }
  return errors;
}

export type LoadedMap = {
  data: UtilityMapData;
  counties: GeoJSON.FeatureCollection;
  territories: GeoJSON.FeatureCollection;
  base: string;
};

export type FetchJson = (url: string) => Promise<unknown>;

export async function loadUtilityMap(
  search: URLSearchParams,
  fetchJson: FetchJson,
  expectedCounties = TEXAS_COUNTIES,
): Promise<LoadedMap> {
  let base: string;
  let data: UtilityMapData;
  if (search.get("data") === "mock") {
    base = `${ROOT}/mock`;
    data = upgradeV1((await fetchJson(`${base}/utility-map.json`)) as V1Data);
  } else {
    const pointer = (await fetchJson(`${ROOT}/current.json`)) as { path: string };
    base = `${ROOT}/${pointer.path}`;
    data = (await fetchJson(`${base}/utility-map.json`)) as UtilityMapData;
  }
  const errors = validateContract(data, expectedCounties);
  if (errors.length) {
    throw new Error(`The map data didn't pass its checks: ${errors.slice(0, 3).join(" ")}`);
  }
  const [counties, territories] = await Promise.all([
    fetchJson(`${base}/${data.geometry.counties}`),
    fetchJson(`${base}/${data.geometry.territories}`),
  ]);
  return {
    data,
    counties: counties as GeoJSON.FeatureCollection,
    territories: territories as GeoJSON.FeatureCollection,
    base,
  };
}
