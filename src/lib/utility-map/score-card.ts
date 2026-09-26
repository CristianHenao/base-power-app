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
