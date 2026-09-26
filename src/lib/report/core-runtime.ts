/**
 * How long Base Cores run a household's chosen appliances. Runs in the browser on purpose:
 * device lists can include medical equipment, and household details never leave the device.
 *
 * Math from the playbook (D-01, appliance loads) and src/lib/backup/appliance-loads.json:
 *   load_kw   = (standby + sum of kWh a day of switched-on items in season) / 24
 *   hours     = 39.2 kWh x cores x starting charge / load_kw
 *   power_ok  = sum of running watts + the largest start surge <= 20 kW x cores
 * Constants must match api/app/sim/backup.py; tests/test_core_runtime_parity.py checks them.
 */
import table from "@/lib/backup/appliance-loads.json";

export const KWH_PER_CORE = 39.2;
export const KW_PER_CORE = 20;
/** Base keeps about 20% in reserve during grid work; an outage nobody forecast can start there. */
export const RESERVE_SOC = 0.2;

type Season = string | null;

interface ApplianceRow {
  id: string;
  name: string;
  group: string;
  /** [min, max] watts */
  running_w: number[];
  surge_w: number[] | null;
  kwh_per_day: number;
  per_unit: boolean;
  default_on: boolean;
  seasonal: Season;
  toggleable?: boolean;
}

export const APPLIANCES: ApplianceRow[] = (table as { appliances: ApplianceRow[] }).appliances;
const BY_ID = new Map(APPLIANCES.map((row) => [row.id, row]));
const STANDBY = BY_ID.get("standby");

/** "summer" loads run May-September, "winter" loads November-March (months 1-12); others all year. */
export function inSeason(season: Season, month: number): boolean {
  if (season === "summer") return month >= 5 && month <= 9;
  if (season === "winter") return month >= 11 || month <= 3;
  return true;
}

/** A switched-on item: a row from the table, or a scanned device the table does not know. */
export interface LoadItem {
  applianceId?: string;
  quantity?: number;
  /** For scanned devices with no table match: watts and hours a day in use (default 24). */
  watts?: number;
  hoursPerDay?: number;
  label?: string;
  /** Must stay on (medical devices, the fridge): the household answer also runs these alone. */
  priority?: boolean;
}

export interface CoreRuntime {
  /** Hours on a full battery (storm forecast) and from the 20% reserve (no warning); null over the limit. */
  fullHours: number | null;
  reserveHours: number | null;
  /** Running watts plus the largest start surge exceed what this many Cores deliver. */
  overLimit: boolean;
}

export interface HouseholdRuntime {
  month: number;
  loadKw: number;
  kwhPerDay: number;
  peakKw: number;
  /** Items without a table row, counted at their scanned watts. */
  estimatedItems: number;
  cores: Record<1 | 2, CoreRuntime>;
}

function coreRuntime(loadKw: number, peakKw: number, cores: number): CoreRuntime {
  const overLimit = peakKw > KW_PER_CORE * cores;
  if (loadKw <= 0 || overLimit) return { fullHours: null, reserveHours: null, overLimit };
  const kwh = KWH_PER_CORE * cores;
  return { fullHours: kwh / loadKw, reserveHours: (kwh * RESERVE_SOC) / loadKw, overLimit };
}

/** Energy and power for the switched-on items in `month`; standby is always counted. */
export function householdRuntime(items: LoadItem[], month: number): HouseholdRuntime {
  let kwhPerDay = STANDBY?.kwh_per_day ?? 1.2;
  let runningW = STANDBY?.running_w[1] ?? 50;
  let largestSurge = 0;
  let estimatedItems = 0;
  for (const item of items) {
    const quantity = Math.max(item.quantity ?? 1, 0);
    const row = item.applianceId ? BY_ID.get(item.applianceId) : undefined;
    if (row) {
      if (row.id === "standby" || !inSeason(row.seasonal, month)) continue;
      kwhPerDay += row.kwh_per_day * quantity;
      runningW += row.running_w[1] * quantity;
      largestSurge = Math.max(largestSurge, row.surge_w?.[1] ?? 0);
    } else if (item.watts && item.watts > 0) {
      estimatedItems += 1;
      kwhPerDay += (item.watts * (item.hoursPerDay ?? 24) * quantity) / 1000;
      runningW += item.watts * quantity;
    }
  }
  const loadKw = kwhPerDay / 24;
  const peakKw = (runningW + largestSurge) / 1000;
  return {
    month, loadKw, kwhPerDay, peakKw, estimatedItems,
    cores: { 1: coreRuntime(loadKw, peakKw, 1), 2: coreRuntime(loadKw, peakKw, 2) },
  };
}

/** Table rows whose names match a scanned device (fridge, CPAP, AC ...). */
const NAME_MATCH: Array<[RegExp, string]> = [
  [/chest\s*freezer|freezer/i, "chest_freezer"],
  [/refrigerator|fridge/i, "refrigerator"],
  [/oxygen/i, "oxygen_concentrator"],
  [/cpap|bipap/i, "cpap"],
  [/router|modem|wi-?fi/i, "wifi_router"],
  [/laptop/i, "laptop"],
  [/\btv\b|television/i, "tv"],
  [/ceiling fan/i, "ceiling_fan"],
  [/microwave/i, "microwave"],
  [/coffee/i, "coffee_maker"],
  [/kettle/i, "electric_kettle"],
  [/dishwasher/i, "dishwasher"],
  [/window\s*(ac|a\/c|air)/i, "window_ac"],
  [/central\s*(ac|a\/c|air)|condenser|air condition/i, "central_ac"],
  [/heat\s*pump/i, "heat_pump_heating"],
  [/space\s*heater/i, "space_heater"],
  [/furnace/i, "furnace_blower"],
  [/water\s*heater/i, "water_heater"],
  [/dryer/i, "dryer"],
  [/wash(er|ing)/i, "washer"],
  [/pool/i, "pool_pump"],
  [/well\s*pump/i, "well_pump"],
  [/sump/i, "sump_pump"],
  [/garage/i, "garage_door"],
  [/desktop|computer|monitor/i, "desktop"],
  [/console|playstation|xbox|nintendo/i, "game_console"],
  [/ev charger|level 2|electric vehicle/i, "ev_level2"],
  [/lamp|bulb|light/i, "led_lamp"],
  [/phone|tablet|charger/i, "phone_charging"],
];

/** Generators, panels and batteries supply or route power; they are not loads. */
const NOT_A_LOAD = new Set(["panel", "battery", "generator"]);

/** Turn scanned devices (name, kind, watts) into load items, matching the table where possible. */
export function itemsFromDevices(devices: Array<{ name: string; kind?: string; watts: number }>): LoadItem[] {
  return devices
    .filter((d) => !NOT_A_LOAD.has(d.kind ?? ""))
    .map((d) => {
      const match = NAME_MATCH.find(([pattern]) => pattern.test(d.name));
      return match ? { applianceId: match[1], label: d.name } : { watts: d.watts, label: d.name };
    });
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];

/** One plain sentence for the UI. */
export function describeRuntime(result: HouseholdRuntime): string {
  const one = result.cores[1];
  const two = result.cores[2];
  const kw = result.loadKw.toFixed(2);
  const month = MONTHS[result.month - 1];
  if (one.overLimit) {
    return two.overLimit
      ? `Started together, these draw about ${result.peakKw.toFixed(1)} kW, more than two Cores deliver. Turn some off. Estimate.`
      : `Started together, these draw about ${result.peakKw.toFixed(1)} kW, more than one Core delivers; two Cores can. Estimate.`;
  }
  return `In ${month}, running these (about ${kw} kW on average), one Core lasts about ${Math.round(one.fullHours ?? 0)} hours `
    + `from full, or about ${Math.round(one.reserveHours ?? 0)} hours if an outage hits without warning. Estimate.`;
}
