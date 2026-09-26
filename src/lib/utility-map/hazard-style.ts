import type { CountyRecord, LayerId } from "./types.ts";

/**
 * Hazard identity colors, icons and ramps (docs/utility-map-prd-v3.md §12.3–12.5).
 * The six identity colors passed the dataviz palette check for adjacent pairs; heat and
 * hail are too close for colorblind readers side by side, so hazard colors always travel
 * with an icon and label and are never shown as six fills at once.
 */

export type HazardId = "flood" | "severe_storm" | "tornado" | "hurricane" | "heat" | "winter";

export type HazardStyle = {
  label: string;
  color: string;
  /** Five steps, light to dark, including the identity color. */
  ramp: [string, string, string, string, string];
  /** lucide icon name, or "hurricane" for the custom spiral. */
  icon: "Waves" | "CloudHail" | "Tornado" | "hurricane" | "ThermometerSun" | "Snowflake";
};

export const HAZARDS: Record<HazardId, HazardStyle> = {
  flood: { label: "Flood", color: "#2166ac", ramp: ["#deebf7", "#9ecae1", "#4292c6", "#2166ac", "#08306b"], icon: "Waves" },
  severe_storm: { label: "Hail and wind", color: "#b07a00", ramp: ["#fbf0d0", "#f1d27a", "#d6a520", "#b07a00", "#6e4c00"], icon: "CloudHail" },
  tornado: { label: "Tornadoes", color: "#9c3fb0", ramp: ["#f2e5f5", "#d8b2e0", "#b77cc8", "#9c3fb0", "#5e1f6e"], icon: "Tornado" },
  hurricane: { label: "Hurricanes", color: "#00897b", ramp: ["#d9f0ec", "#99d8cc", "#41ae9b", "#00897b", "#00564d"], icon: "hurricane" },
  heat: { label: "Extreme heat", color: "#d6452b", ramp: ["#fde0d9", "#f8a58f", "#ee6a4c", "#d6452b", "#8f2415"], icon: "ThermometerSun" },
  winter: { label: "Winter freeze", color: "#5b8fd9", ramp: ["#e3eefb", "#b9d2f3", "#8bb1e8", "#5b8fd9", "#2e5ea8"], icon: "Snowflake" },
};

export const HAZARD_IDS = Object.keys(HAZARDS) as HazardId[];

export function isHazard(id: LayerId): id is HazardId {
  return (HAZARD_IDS as string[]).includes(id);
}

/** Stevens 3×3 bivariate palette: row = first hazard's third, column = second's. */
export const BIVARIATE_COLORS = [
  "#e8e8e8", "#ace4e4", "#5ac8c8",
  "#dfb0d6", "#a5add3", "#5698b9",
  "#be64ac", "#8c62aa", "#3b4994",
] as const;

export function hazardLevel(rank: number | null): 1 | 2 | 3 | 4 | 5 | null {
  if (rank == null) return null;
  return Math.min(5, 1 + Math.floor(rank * 5)) as 1 | 2 | 3 | 4 | 5;
}

function third(rank: number): 1 | 2 | 3 {
  return rank < 1 / 3 ? 1 : rank < 2 / 3 ? 2 : 3;
}

export function bivariateClass(rankA: number | null, rankB: number | null): number | null {
  if (rankA == null || rankB == null) return null;
  return (third(rankA) - 1) * 3 + third(rankB);
}

/** How many of the active hazards put this county in Texas's top fifth. */
export function overlapCount(county: CountyRecord, active: LayerId[]): number {
  return active.filter((id) => isHazard(id) && (county.ranks[id] ?? 0) >= 0.8).length;
}

/** Tornado track width in px by EF rating (unknown counts as EF0). */
export function efWidth(ef: number): number {
  return [1, 1.5, 2.5, 3.5, 4.5][Math.max(0, Math.min(ef, 4))];
}

export type FingerprintRow = { hazard: HazardId; rank: number | null; topFifth: boolean };

/** Hazards present in `ranks`, highest rank first, unknown ranks last. */
export function fingerprintRows(ranks: Partial<Record<HazardId, number | null>>): FingerprintRow[] {
  return (Object.keys(ranks) as HazardId[])
    .filter(isHazard)
    .map((hazard) => ({ hazard, rank: ranks[hazard] ?? null, topFifth: (ranks[hazard] ?? 0) >= 0.8 }))
    .sort((a, b) => (b.rank ?? -1) - (a.rank ?? -1));
}

/** Storm spotlight: peak share of customers out, binned <5, 5-15, 15-30, 30-50, 50%+. */
/** Map level for a storm county whose share out is unknown; drawn in its own neutral color. */
export const SHARE_UNKNOWN_LEVEL = 6;
export const SHARE_UNKNOWN_COLOR = "#8c8781";

export function outageShareLevel(pct: number): 1 | 2 | 3 | 4 | 5 {
  return (1 + [5, 15, 30, 50].filter((cut) => pct >= cut).length) as 1 | 2 | 3 | 4 | 5;
}

export type SpotlightStorm = {
  name: string;
  start: string;
  end: string;
  source: string | null;
  note: string | null;
  track_storm_id: string | null;
  /** peak_out_pct is null where the county's customer count was raised to its peak outage
   * (customers_floored): the share would read 100% by construction. */
  counties: {
    fips: string;
    peak_out: number;
    peak_out_pct: number | null;
    customers_floored?: boolean;
    customer_hours: number;
  }[];
};
