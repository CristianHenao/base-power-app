import type {
  BaseOffer,
  CountyRecord,
  LayerId,
  UtilityMapData,
  UtilityRecord,
} from "@/lib/utility-map/types";

/**
 * Scores per P-04: each toggled layer is a 0-1 rank against Texas, a county's
 * score is the mean of its toggled ranks, and a utility's score is the
 * customer-weighted mean of its counties. Levels are quintiles of the peer set.
 */

export type Level = 1 | 2 | 3 | 4 | 5;

export const LEVEL_LABELS: Record<Level, string> = {
  1: "Low",
  2: "Moderate",
  3: "Elevated",
  4: "High",
  5: "Very high",
};

/** Sequential orange ramp from the Base style guide; lightness falls 1 to 5. */
export const LEVEL_COLORS: Record<Level, string> = {
  1: "#fbe3d8",
  2: "#f5b08a",
  3: "#ed6c30",
  4: "#b24a18",
  5: "#742c0b",
};

export const NO_DATA_COLOR = "#d8d7d5";

export type Scored = { score: number | null; level: Level | null };

export type ScoreModel = {
  county: Map<string, Scored>;
  utility: Map<string, Scored & { rank: number | null }>;
  scoredUtilityCount: number;
};

export function countyScore(
  county: CountyRecord,
  layers: readonly LayerId[],
): number | null {
  const ranks = layers
    .map((id) => county.ranks[id])
    .filter((r): r is number => r != null);
  if (ranks.length === 0) return null;
  return ranks.reduce((sum, r) => sum + r, 0) / ranks.length;
}

/** Quintile thresholds, so each level holds about a fifth of the peers. */
function quintileLevels(scores: Map<string, number | null>): Map<string, Level | null> {
  const present = [...scores.values()]
    .filter((s): s is number => s != null)
    .sort((a, b) => a - b);
  const cuts = [0.2, 0.4, 0.6, 0.8].map(
    (q) => present[Math.min(present.length - 1, Math.floor(q * present.length))],
  );
  const levels = new Map<string, Level | null>();
  for (const [key, s] of scores) {
    if (s == null || present.length === 0) {
      levels.set(key, null);
      continue;
    }
    levels.set(key, (1 + cuts.filter((c) => s >= c).length) as Level);
  }
  return levels;
}

export function weightedMean(
  items: { value: number | null; weight: number }[],
): number | null {
  let total = 0;
  let weights = 0;
  for (const { value, weight } of items) {
    if (value == null) continue;
    total += value * weight;
    weights += weight;
  }
  return weights > 0 ? total / weights : null;
}

export function buildScoreModel(
  data: UtilityMapData,
  layers: readonly LayerId[],
): ScoreModel {
  const countyScores = new Map<string, number | null>();
  for (const c of data.counties) countyScores.set(c.fips, countyScore(c, layers));
  const countyLevels = quintileLevels(countyScores);

  const byFips = new Map(data.counties.map((c) => [c.fips, c]));
  const utilityScores = new Map<string, number | null>();
  for (const u of data.utilities) {
    utilityScores.set(
      u.id,
      weightedMean(
        u.counties.map((fips) => ({
          value: countyScores.get(fips) ?? null,
          weight: byFips.get(fips)?.customers ?? 0,
        })),
      ),
    );
  }
  const utilityLevels = quintileLevels(utilityScores);

  const ranked = data.utilities
    .filter((u) => utilityScores.get(u.id) != null)
    .sort((a, b) => (utilityScores.get(b.id) ?? 0) - (utilityScores.get(a.id) ?? 0));

  return {
    county: new Map(
      data.counties.map((c) => [
        c.fips,
        { score: countyScores.get(c.fips) ?? null, level: countyLevels.get(c.fips) ?? null },
      ]),
    ),
    utility: new Map(
      data.utilities.map((u) => {
        const index = ranked.findIndex((r) => r.id === u.id);
        return [
          u.id,
          {
            score: utilityScores.get(u.id) ?? null,
            level: utilityLevels.get(u.id) ?? null,
            rank: index >= 0 ? index + 1 : null,
          },
        ];
      }),
    ),
    scoredUtilityCount: ranked.length,
  };
}

export type RankGroupId = "expansion" | "grow" | "monitor";

export const RANK_GROUPS: { id: RankGroupId; label: string; hint: string }[] = [
  {
    id: "expansion",
    label: "Expansion targets",
    hint: "High stress, and Base sells energy only here today",
  },
  {
    id: "grow",
    label: "Grow",
    hint: "High stress, and Base already offers backup here",
  },
  { id: "monitor", label: "Monitor", hint: "Lower stress for the layers on" },
];

const SELLS_BACKUP: BaseOffer[] = ["energy_plus_backup", "backup_program"];

export function rankGroup(utility: UtilityRecord, level: Level | null): RankGroupId {
  if (level == null || level <= 2) return "monitor";
  return SELLS_BACKUP.includes(utility.base_offer) ? "grow" : "expansion";
}

export const BASE_OFFER_LABELS: Record<BaseOffer, string> = {
  energy_plus_backup: "Energy + Backup",
  backup_program: "Backup program",
  energy_only: "Energy only",
  none: "Not served",
};

/** Customer-weighted layer value and rank for a utility's breakdown bars. */
export function utilityLayerSummary(
  utility: UtilityRecord,
  counties: Map<string, CountyRecord>,
  layer: LayerId,
): { value: number | null; rank: number | null } {
  const mine = utility.counties
    .map((fips) => counties.get(fips))
    .filter((c): c is CountyRecord => c != null);
  if (layer === "homes") {
    return {
      value: mine.reduce((sum, c) => sum + (c.values.homes ?? 0), 0),
      rank: weightedMean(mine.map((c) => ({ value: c.ranks.homes, weight: c.customers }))),
    };
  }
  return {
    value: weightedMean(mine.map((c) => ({ value: c.values[layer], weight: c.customers }))),
    rank: weightedMean(mine.map((c) => ({ value: c.ranks[layer], weight: c.customers }))),
  };
}

export type FleetEstimate = {
  homes: number;
  storageMwh: number;
  peakMw: number;
  outageHoursCovered: number;
};

/** "What if Base were here": linear in fleet share, as agreed in P-04. */
export function fleetEstimate(
  utility: UtilityRecord,
  counties: Map<string, CountyRecord>,
  share: number,
  battery: { kwh_per_core: number; kw_per_core: number },
): FleetEstimate {
  const homes = Math.round(utility.eligible_homes * share);
  const outageHours = utilityLayerSummary(utility, counties, "outages").value ?? 0;
  return {
    homes,
    storageMwh: (homes * battery.kwh_per_core) / 1000,
    peakMw: (homes * battery.kw_per_core) / 1000,
    outageHoursCovered: homes * outageHours * utility.core_coverage_hours,
  };
}
