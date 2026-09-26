/**
 * The household answer: expected hours a year this home is dark, from its own appliances.
 * Same math as pipeline/household_gap.py, run in the browser so the appliance list stays on
 * the device. tests/test_household_gap_parity.py checks the two agree.
 */
import type { GapSeason, HouseholdGap } from "./types";

/** P(D > hours), interpolating in log hours; 1 below the grid, 0 above it. */
export function survivalAt(grid: number[], survival: number[], hours: number): number {
  if (hours <= grid[0]) return 1;
  if (hours >= grid[grid.length - 1]) return 0;
  const x = Math.log(hours);
  for (let i = 1; i < grid.length; i++) {
    if (grid[i] >= hours) {
      const x0 = Math.log(grid[i - 1]);
      const x1 = Math.log(grid[i]);
      return survival[i - 1] + ((survival[i] - survival[i - 1]) * (x - x0)) / (x1 - x0);
    }
  }
  return 0;
}

/** E[max(D - T, 0)]: area under the survival curve beyond T, by trapezoids on the grid. */
export function expectedExcess(grid: number[], survival: number[], hours: number): number {
  const trapezoid = (xs: number[], ys: number[]) =>
    xs.slice(1).reduce((sum, x, i) => sum + ((ys[i] + ys[i + 1]) / 2) * (x - xs[i]), 0);
  if (hours < grid[0]) return grid[0] - hours + trapezoid(grid, survival);
  const xs = [hours];
  const ys = [survivalAt(grid, survival, hours)];
  grid.forEach((g, i) => {
    if (g > hours) {
      xs.push(g);
      ys.push(survival[i]);
    }
  });
  return trapezoid(xs, ys);
}

export interface GapResult {
  /** Expected hours a year dark. */
  darkHours: number;
  /** Chance of at least one outage longer than the backup in a year. */
  chance: number;
}

/** Backup hours per season (null means the load is over the power limit: no backup). */
export function gapFor(gap: Pick<HouseholdGap, "hours_grid" | "seasons">,
  backupBySeason: Record<GapSeason["season"], number | null>): GapResult {
  let darkHours = 0;
  let rate = 0;
  for (const season of gap.seasons) {
    const backup = backupBySeason[season.season] ?? 0;
    darkHours += season.outages_per_year * expectedExcess(gap.hours_grid, season.survival, backup);
    rate += season.outages_per_year * survivalAt(gap.hours_grid, season.survival, backup);
  }
  return { darkHours, chance: 1 - Math.exp(-rate) };
}

/** A representative month for each season, for seasonal loads like AC and heat. */
export const SEASON_MONTH: Record<GapSeason["season"], number> = { winter: 1, spring: 4, summer: 7, fall: 10 };
