/**
 * The household answer: expected dark hours a year for this home's own appliances, with
 * 1 or 2 Cores, from full or from Base's 20% reserve. Priority items (medical devices,
 * the fridge) are also answered on their own, as if everything else were switched off.
 * Runs in the browser; nothing about the appliances is sent anywhere.
 */
import { householdRuntime, type LoadItem } from "./core-runtime";
import { gapFor, type GapResult, SEASON_MONTH } from "./household-gap";
import type { GapSeason, HouseholdGap } from "./types";

type Seasons = GapSeason["season"];
const SEASONS: Seasons[] = ["winter", "spring", "summer", "fall"];

export interface CoresAnswer {
  full: GapResult;
  reserve: GapResult;
  /** A season where the appliances need more power than these Cores deliver. */
  overLimit: boolean;
}

export interface HouseholdAnswer {
  none: GapResult;
  cores: Record<1 | 2, CoresAnswer>;
  /** The same for priority items alone; null when none are marked. */
  priority: Record<1 | 2, CoresAnswer> | null;
}

function answerFor(gap: HouseholdGap, items: LoadItem[]): Record<1 | 2, CoresAnswer> {
  const runtimes = Object.fromEntries(SEASONS.map((s) => [s, householdRuntime(items, SEASON_MONTH[s])])) as
    Record<Seasons, ReturnType<typeof householdRuntime>>;
  const answer = (cores: 1 | 2): CoresAnswer => {
    const pick = (key: "fullHours" | "reserveHours") =>
      Object.fromEntries(SEASONS.map((s) => [s, runtimes[s].cores[cores][key]])) as Record<Seasons, number | null>;
    return {
      full: gapFor(gap, pick("fullHours")),
      reserve: gapFor(gap, pick("reserveHours")),
      overLimit: SEASONS.some((s) => runtimes[s].cores[cores].overLimit),
    };
  };
  return { 1: answer(1), 2: answer(2) };
}

export function householdAnswer(gap: HouseholdGap, items: LoadItem[]): HouseholdAnswer {
  const zero = Object.fromEntries(SEASONS.map((s) => [s, 0])) as Record<Seasons, number>;
  const priorityItems = items.filter((item) => item.priority);
  return {
    none: gapFor(gap, zero),
    cores: answerFor(gap, items),
    priority: priorityItems.length > 0 ? answerFor(gap, priorityItems) : null,
  };
}
