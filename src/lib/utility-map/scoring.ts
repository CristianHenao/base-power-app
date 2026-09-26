import type {
  BaseOffer,
  CountyRecord,
  LayerId,
  Quality,
  UtilityMapData,
  UtilityRecord,
} from "./types.ts";

/**
 * Scores per P-04: each toggled layer is a 0-1 rank against Texas, a county's
 * score is the mean of its toggled ranks, and a utility's score is the
 * mean of its counties weighted by its own estimated customers in each county
 * (county_weights), never the county's full count. Levels are quintiles.
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

  const utilityScores = new Map<string, number | null>();
  for (const u of data.utilities) {
    utilityScores.set(
      u.id,
      weightedMean(
        u.county_weights.map((w) => ({
          value: countyScores.get(w.fips) ?? null,
          weight: w.customers_est,
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

export type RankGroupId = "expansion" | "grow" | "unverified" | "monitor";

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
  {
    id: "unverified",
    label: "Offer not verified",
    hint: "High stress; check Base's offer for this area before the meeting",
  },
  { id: "monitor", label: "Monitor", hint: "Lower stress for the layers on" },
];

const SELLS_BACKUP: BaseOffer[] = ["energy_plus_backup", "backup_program"];

export function rankGroup(utility: UtilityRecord, level: Level | null): RankGroupId {
  if (level == null || level <= 2) return "monitor";
  if (utility.base_offer == null) return "unverified";
  return SELLS_BACKUP.includes(utility.base_offer) ? "grow" : "expansion";
}

export const BASE_OFFER_LABELS: Record<BaseOffer, string> = {
  energy_plus_backup: "Energy + Backup",
  backup_program: "Backup program",
  energy_only: "Energy only",
};

export function offerLabel(utility: UtilityRecord): string {
  return utility.base_offer ? BASE_OFFER_LABELS[utility.base_offer] : "Offer not verified";
}

/** Counts that add up across counties (a utility gets its share); the rest are averaged. */
export const ADDITIVE_LAYERS: LayerId[] = ["homes", "peak_demand", "generation"];

/** A utility's layer value and rank from its own estimated share of each county. */
export function utilityLayerSummary(
  utility: UtilityRecord,
  counties: Map<string, CountyRecord>,
  layer: LayerId,
): { value: number | null; rank: number | null } {
  const mine = utility.county_weights
    .map((w) => ({ w, c: counties.get(w.fips) }))
    .filter((x): x is { w: (typeof x)["w"]; c: CountyRecord } => x.c != null);
  const rank = weightedMean(mine.map(({ w, c }) => ({ value: c.ranks[layer], weight: w.customers_est })));
  if (ADDITIVE_LAYERS.includes(layer)) {
    const known = mine.filter(({ c }) => c.values[layer] != null);
    return {
      value: known.length ? known.reduce((sum, { w, c }) => sum + (c.values[layer] ?? 0) * w.share, 0) : null,
      rank,
    };
  }
  return {
    value: weightedMean(mine.map(({ w, c }) => ({ value: c.values[layer], weight: w.customers_est }))),
    rank,
  };
}

/** Whether a utility has data for a layer: ok if any of its counties do. */
export function utilityLayerQuality(
  utility: UtilityRecord,
  counties: Map<string, CountyRecord>,
  layer: LayerId,
): Quality {
  const flags = utility.county_weights
    .map((w) => counties.get(w.fips)?.quality[layer])
    .filter((q): q is Quality => q != null);
  if (flags.includes("ok")) return "ok";
  return flags.length > 0 && flags.every((q) => q === "not_applicable") ? "not_applicable" : "missing";
}
