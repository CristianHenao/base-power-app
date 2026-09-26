import { RISK_BANDS, RISK_LAYERS } from "./describe-view.ts";
import { utilityLayerSummary } from "./scoring.ts";
import type { CountyRecord, LayerId, UtilityMapData } from "./types.ts";

/** Rows for the full Grid Risk Index table: every county or every utility, sortable and searchable. */

export type RiskRow = {
  id: string;
  name: string;
  /** The utility to open when the row is picked (a county opens inside its main utility). */
  utility: string | null;
  rank: number | null;
  index: number | null;
  level: number | null;
  band: string | null;
  hazard: number | null;
  stress: number | null;
  sources: number;
  sourcesTotal: number;
  /** Each index layer as a Texas percentile, 0-100 (utilities: customer-weighted over their counties). */
  factors: Partial<Record<LayerId, number | null>>;
};

export type RiskSortKey = "rank" | "name" | "index" | "hazard" | "stress" | "sources" | LayerId;

const pct = (rank: number | null | undefined) => (rank == null ? null : Math.round(rank * 100));

export function riskRows(
  data: UtilityMapData,
  kind: "county" | "utility",
  countiesByFips: Map<string, CountyRecord>,
): RiskRow[] {
  const band = (index: number | null | undefined) =>
    index == null ? null : RISK_BANDS[Math.min(4, Math.floor((index - 1) / 20))];
  if (kind === "county") {
    return data.counties.map((c) => ({
      id: c.fips,
      name: `${c.name} County`,
      utility: c.primary_utility ?? c.utilities[0] ?? null,
      rank: c.risk?.rank ?? null,
      index: c.risk?.index ?? null,
      level: c.risk?.level ?? null,
      band: band(c.risk?.index),
      hazard: c.risk?.hazard ?? null,
      stress: c.risk?.stress ?? null,
      sources: c.risk?.sources ?? 0,
      sourcesTotal: c.risk?.sources_total ?? RISK_LAYERS.length,
      factors: Object.fromEntries(RISK_LAYERS.map((id) => [id, pct(c.ranks[id])])),
    }));
  }
  return data.utilities.map((u) => ({
    id: u.id,
    name: u.name,
    utility: u.id,
    rank: u.risk?.rank ?? null,
    index: u.risk?.index ?? null,
    level: u.risk?.level ?? null,
    band: band(u.risk?.index),
    hazard: u.risk?.hazard ?? null,
    stress: u.risk?.stress ?? null,
    sources: u.risk?.sources ?? 0,
    sourcesTotal: u.risk?.sources_total ?? RISK_LAYERS.length,
    factors: Object.fromEntries(RISK_LAYERS.map((id) => [id, pct(utilityLayerSummary(u, countiesByFips, id).rank)])),
  }));
}

function valueOf(row: RiskRow, key: RiskSortKey): number | string | null {
  if (key === "name") return row.name;
  if (key === "rank" || key === "index" || key === "hazard" || key === "stress" || key === "sources") return row[key];
  return row.factors[key] ?? null;
}

/** Sort by one column; places without a value always go last. */
export function sortRiskRows(rows: RiskRow[], key: RiskSortKey, dir: "asc" | "desc"): RiskRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = valueOf(a, key);
    const y = valueOf(b, key);
    if (x == null && y == null) return a.name.localeCompare(b.name);
    if (x == null) return 1;
    if (y == null) return -1;
    const order = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
    return sign * order || a.name.localeCompare(b.name);
  });
}

export function filterRiskRows(rows: RiskRow[], query: string): RiskRow[] {
  const q = query.trim().toLowerCase();
  return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
}
