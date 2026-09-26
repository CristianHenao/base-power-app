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

/** How each index layer reads inside a sentence, and whether it takes a plural verb. */
const PHRASE: Partial<Record<LayerId, { name: string; plural: boolean }>> = {
  flood: { name: "flooding", plural: false },
  tornado: { name: "tornadoes", plural: true },
  severe_storm: { name: "hail and wind", plural: false },
  hurricane: { name: "hurricanes", plural: true },
  winter: { name: "winter freeze", plural: false },
  heat: { name: "extreme heat", plural: false },
  outages: { name: "long outages", plural: true },
  price_spikes: { name: "price spikes", plural: true },
  peak_demand: { name: "peak demand", plural: false },
};
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const countFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export type SummaryInput = {
  name: string;
  kind: Kind;
  risk: { hazard: number | null; stress: number | null };
  ranks: Partial<Record<LayerId, number | null>>;
  /** The layer's value as displayed elsewhere on the card, e.g. "41 h / yr". */
  format: (id: LayerId) => string;
  storm: WorstStorm | null;
  /** Long-outage hours per customer per year (EAGLE-I). */
  outagesHours: number | null;
};

/**
 * A few plain sentences built only from the pipeline's numbers (no generated prose): where the
 * risk comes from, what drives it up and down, the worst storm on record, and long outages.
 */
export function riskSummary(input: SummaryInput): string[] {
  const { name, kind, risk, format } = input;
  const out: string[] = [];
  const hazard = risk.hazard ?? 0;
  const stress = risk.stress ?? 0;
  if (hazard < 40 && stress < 40) {
    out.push(`Neither weather nor the grid stands out in ${name} compared with the rest of Texas.`);
  } else if (stress - hazard >= 15) {
    out.push(`${name}'s risk comes more from its grid than from the weather.`);
  } else if (hazard - stress >= 15) {
    out.push(`${name}'s risk comes more from the weather than from its grid.`);
  } else {
    out.push(`${name}'s risk comes from both the weather and its grid.`);
  }

  const { raising, lowering } = scoreFactors(input.ranks);
  const top = raising.slice(0, 2);
  if (top.length > 0) {
    const parts = top.map((f) => `${PHRASE[f.id]!.name} (${format(f.id)})`);
    const plural = top.length > 1 || PHRASE[top[0].id]!.plural;
    const highest = top.every((f) => f.percentile >= 80);
    const verb = highest
      ? `${plural ? "rank" : "ranks"} among the highest in Texas`
      : `${plural ? "are" : "is"} above most of Texas`;
    out.push(`Its ${parts.join(" and ")} ${verb}.`);
  }
  const low = lowering[0];
  if (low) {
    const phrase = PHRASE[low.id]!;
    out.push(`${capitalize(phrase.name)} (${format(low.id)}) ${phrase.plural ? "are" : "is"} lower than most of Texas.`);
  }

  const where = kind === "county" ? "" : " in its counties";
  if (input.storm) {
    const pct = input.storm.peakPct != null ? ` (${countFormat.format(input.storm.peakPct)}%)` : "";
    out.push(`${input.storm.name} left ${countFormat.format(input.storm.peakOut)} customers${where} without power at peak${pct}.`);
  }
  if (input.outagesHours != null) {
    const who = kind === "county" ? "Homes in this county" : "Customers in its counties";
    const hours = input.outagesHours < 10 ? input.outagesHours.toFixed(1) : countFormat.format(input.outagesHours);
    out.push(`${who} average ${hours} hours of long outages a year.`);
  }
  return out;
}

export type ChapterId = "risk" | "why" | "history" | "grid" | "now" | "base";

/** Where the score card opens for each question in the left panel. */
export function chapterFor(question: "risk" | "hazards" | "grid" | "fleet"): ChapterId {
  return ({ risk: "risk", hazards: "why", grid: "grid", fleet: "base" } as const)[question];
}

function ordinal(n: number): string {
  if (n === 1) return "the largest";
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `the ${n}${suffix} largest`;
}

export type GridStoryInput = {
  kind: Kind;
  name: string;
  customers: number | null;
  /** Utility: its 2024 summer peak. County: its estimated share of its utilities' peaks. */
  peakMw: number | null;
  estimated: boolean;
  /** 1 = largest peak among `peakOf` peers. */
  peakRank: number | null;
  peakOf: number;
  /** Net summer MW of power plants in the county (utility: in its counties, any owner). */
  plantsMw: number | null;
};

/** "How big is this grid?" in two sentences, from the pipeline's numbers only. */
export function gridStory(input: GridStoryInput): string[] {
  const { kind, name, customers, peakMw, peakRank, peakOf, plantsMw } = input;
  const who = customers != null ? `${countFormat.format(customers)} customers` : "an unknown number of customers";
  const rank = peakRank != null ? `, ${ordinal(peakRank)} of ${peakOf} Texas ${peersOf(kind)} with a known peak` : "";
  const out: string[] = [];
  if (kind === "utility") {
    out.push(
      peakMw != null
        ? `${name} serves ${who} with a ${countFormat.format(peakMw)} MW summer peak (2024${input.estimated ? ", estimated" : ""})${rank}.`
        : `${name} serves ${who}; its summer peak isn't published.`,
    );
  } else {
    out.push(
      peakMw != null
        ? `${name} has ${who} and an estimated ${countFormat.format(peakMw)} MW of summer peak demand${rank}.`
        : `${name} has ${who}; its share of summer peak demand isn't known (its utilities don't publish one).`,
    );
  }
  if (plantsMw != null) {
    const where = kind === "county" ? "in the county" : "in its counties";
    out.push(
      plantsMw >= 1
        ? `Power plants ${where} can supply ${countFormat.format(plantsMw)} MW (all owners, net summer capacity).`
        : `No power plants ${where}; it draws on the wider grid.`,
    );
  }
  return out;
}
