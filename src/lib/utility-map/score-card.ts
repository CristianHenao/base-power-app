import { RISK_LAYERS } from "./describe-view.ts";
import type { SpotlightStorm } from "./hazard-style.ts";
import type { LayerId } from "./types.ts";

/** Pure pieces of the score card: what drives a Grid Risk Index, and the worst storm on record. */

export type Driver = { id: LayerId; percentile: number };

/** The three index layers where this place ranks highest against Texas (unknown ranks left out). */
export function riskDrivers(ranks: Partial<Record<LayerId, number | null>>, count = 3): Driver[] {
  return RISK_LAYERS.filter((id) => ranks[id] != null)
    .map((id) => ({ id, percentile: Math.round((ranks[id] as number) * 100) }))
    .sort((a, b) => b.percentile - a.percentile)
    .slice(0, count);
}

export type WorstStorm = { name: string; peakOut: number; peakPct: number | null; customerHours: number };

/**
 * The labeled storm with the most customer-hours out across these counties (EAGLE-I, 2018 on).
 * Peak customers out are summed over the counties; a share is only given for a single county
 * with a known share, since shares can't be added up.
 */
export function worstStorm(storms: SpotlightStorm[], fips: string[]): WorstStorm | null {
  const wanted = new Set(fips);
  let best: WorstStorm | null = null;
  for (const storm of storms) {
    const hits = storm.counties.filter((c) => wanted.has(c.fips));
    if (hits.length === 0) continue;
    const customerHours = hits.reduce((sum, c) => sum + c.customer_hours, 0);
    if (best && customerHours <= best.customerHours) continue;
    best = {
      name: `${storm.name} ${storm.start.slice(0, 4)}`,
      peakOut: hits.reduce((sum, c) => sum + c.peak_out, 0),
      peakPct: fips.length === 1 ? hits[0].peak_out_pct : null,
      customerHours,
    };
  }
  return best;
}

type Kind = "county" | "utility";
const peersOf = (kind: Kind) => (kind === "county" ? "counties" : "utilities");

/** The headline: where this place stands among its Texas peers, in words and by rank. */
export function rankSentence(name: string, risk: { rank: number; of: number; level: number }, kind: Kind): string {
  const peers = `${risk.rank} of ${risk.of} ${peersOf(kind)}`;
  const lower = risk.of - risk.rank;
  const standing = [
    "is at lower grid risk than most of Texas",
    "is below the Texas middle for grid risk",
    "is near the Texas middle for grid risk",
    "is at higher grid risk than most of Texas",
    kind === "county" ? "is among the most at-risk counties in Texas" : "is among the most at-risk grids in Texas",
  ][risk.level - 1];
  const tail = risk.level <= 2 ? `, and only ${lower} score lower.` : ".";
  return `${name} ${standing}: #${peers}${tail}`;
}

/** What the band means, said plainly, and that the index compares places rather than measuring risk outright. */
export function bandMeaning(level: number, kind: Kind): string {
  const peers = `Texas ${peersOf(kind)}`;
  return [
    `Low (1–20): in the least at-risk fifth of ${peers}. Low is relative, not no risk: storms and outages still happen here.`,
    `Moderate (21–40): below the middle of ${peers}. Relative to Texas, not an absolute measure.`,
    `Elevated (41–60): around the middle of ${peers}. Relative to Texas, not an absolute measure.`,
    `High (61–80): riskier than most ${peers}. Relative to Texas, not an absolute measure.`,
    `Severe (81–100): in the most at-risk fifth of ${peers}. Relative to Texas, not an absolute measure.`,
  ][level - 1];
}

/** One line for a half of the index (1-100 against the same peers). */
export function halfReading(value: number | null, kind: Kind): string {
  if (value == null) return "No data";
  return `Riskier than about ${Math.round(((value - 1) / 99) * 100)}% of Texas ${peersOf(kind)}`;
}

/** What raises this place's risk (rank at or above 60%) and what keeps it down (at or below 40%), up to three each. */
export function scoreFactors(
  ranks: Partial<Record<LayerId, number | null>>,
  count = 3,
): { raising: Driver[]; lowering: Driver[] } {
  const known = RISK_LAYERS.filter((id) => ranks[id] != null).map((id) => ({
    id,
    percentile: Math.round((ranks[id] as number) * 100),
  }));
  return {
    raising: known.filter((f) => f.percentile >= 60).sort((a, b) => b.percentile - a.percentile).slice(0, count),
    lowering: known.filter((f) => f.percentile <= 40).sort((a, b) => a.percentile - b.percentile).slice(0, count),
  };
}
