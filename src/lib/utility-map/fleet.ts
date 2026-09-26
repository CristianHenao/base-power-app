import type { CountyRecord, UtilityMapData, UtilityRecord } from "./types.ts";

/**
 * "What if Base were here" for one utility (docs/utility-map-prd-v3.md §8).
 * One Core per home, homes counted per county with the utility's estimated share.
 * Every output is an idealized ceiling: full charge, a backup reserve held back, and
 * a fixed dispatch window. Missing inputs give null, never zero.
 */

export type FleetScenario = {
  cores: number;
  storageMwh: number;
  nameplateMw: number;
  /** MW the fleet could hold for the dispatch window, limited by energy above the reserve. */
  dispatchMw2h: number;
  /** dispatchMw2h as a share of the utility's summer peak. */
  peakShare: number | null;
  /** Customer-hours of long-outage darkness the fleet's backup would cover per year. */
  backupCustomerHours: number | null;
  /** Energy per price-spike event: dispatchMw2h over the window. */
  spikeMwh: number;
};

export function fleetScenario(
  utility: UtilityRecord,
  counties: Map<string, CountyRecord>,
  share: number,
  battery: UtilityMapData["battery"],
): FleetScenario {
  let homes = 0;
  let backup = 0;
  let backupKnown = false;
  for (const weight of utility.county_weights) {
    const county = counties.get(weight.fips);
    const countyHomes = county?.values.homes;
    if (!county || countyHomes == null) continue;
    const coresHere = share * countyHomes * weight.share; // fractions kept until the total
    homes += countyHomes * weight.share;
    const outages = county.values.outages;
    const coverage = county.outage_coverage_12h;
    if (outages != null && coverage != null) {
      backup += coresHere * outages * coverage;
      backupKnown = true;
    }
  }

  const cores = Math.round(share * homes);
  const usableKwh = battery.kwh_per_core * (1 - battery.reserve_fraction);
  const perCoreKw = Math.min(battery.kw_per_core, usableKwh / battery.dispatch_window_h);
  const dispatchMw2h = (cores * perCoreKw) / 1000;
  const peak = utility.grid_stats?.summer_peak_mw ?? null;

  return {
    cores,
    storageMwh: (cores * battery.kwh_per_core) / 1000,
    nameplateMw: (cores * battery.kw_per_core) / 1000,
    dispatchMw2h,
    peakShare: peak ? dispatchMw2h / peak : null,
    backupCustomerHours: backupKnown ? backup : null,
    spikeMwh: dispatchMw2h * battery.dispatch_window_h,
  };
}

/** Share-of-peak bins for the Base fleet map: <0.5%, 0.5-1%, 1-2%, 2-5%, 5%+. Fixed, not quintiles. */
export const FLEET_BINS = [0.005, 0.01, 0.02, 0.05];

/** Style guide greens, light to dark. */
export const FLEET_COLORS = ["#d6f0b4", "#b2dd79", "#77a45a", "#1e4d2b", "#102a17"] as const;

export function fleetLevel(peakShare: number | null): 1 | 2 | 3 | 4 | 5 | null {
  if (peakShare == null) return null;
  return (1 + FLEET_BINS.filter((bin) => peakShare >= bin).length) as 1 | 2 | 3 | 4 | 5;
}
