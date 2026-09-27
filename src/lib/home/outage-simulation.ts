import { drawWatts, type HomeDevice } from "@/lib/home/devices";
import { CORE_GENERATOR_CHARGE_KW } from "@/lib/home/generator-backup";
import { KWH_PER_CORE, KW_PER_CORE } from "@/lib/report/core-runtime";

/** Outage lengths the sheet offers. After 12 h, choices are whole days. */
export const OUTAGE_DURATIONS = [
  { hours: 4, label: "4 h" },
  { hours: 12, label: "12 h" },
  { hours: 24, label: "1 d" },
  { hours: 72, label: "3 d" },
  { hours: 120, label: "5 d" },
  { hours: 168, label: "7 d" },
] as const;

export type OutageDurationHours = (typeof OUTAGE_DURATIONS)[number]["hours"];

const NOT_A_LOAD = new Set(["panel", "battery", "generator"]);

export type DeviceOutageRow = {
  id: string;
  name: string;
  watts: number;
  wattsExact: boolean;
  /** Hours this device alone lasts on a full Core. Null when draw is unknown or over the Core limit. */
  hoursOnCore: number | null;
  /**
   * Hours with a generator charging the Core.
   * Infinity when the generator covers the draw. Null when there is no charge or draw is unknown.
   */
  hoursWithGenerator: number | null;
  overLimit: boolean;
};

export type CombinedOutage = {
  loadKw: number;
  loadsCounted: number;
  overLimit: boolean;
  hoursOnCore: number | null;
  hoursWithGenerator: number | null;
};

/** Appliances and other loads. Panels, batteries, and generators are not draws. */
export function outageLoadDevices(devices: HomeDevice[]): HomeDevice[] {
  return devices.filter((device) => !NOT_A_LOAD.has(device.kind));
}

/** Strongest generator on the home, by rated watts. */
export function bestOutageGenerator(devices: HomeDevice[]): HomeDevice | null {
  const generators = devices.filter((device) => device.kind === "generator");
  if (generators.length === 0) return null;
  return [...generators].sort(
    (a, b) => drawWatts(b).watts - drawWatts(a).watts,
  )[0] ?? null;
}

/** kW this generator can push into the Core port (capped at 4 kW). */
export function generatorChargeKw(generator: HomeDevice | null): number {
  if (!generator) return 0;
  const watts = drawWatts(generator).watts;
  if (watts <= 0) return 0;
  return Math.min(watts / 1000, CORE_GENERATOR_CHARGE_KW);
}

function hoursAtNetLoad(loadKw: number, chargeKw: number): number | null {
  if (!(loadKw > 0) || loadKw > KW_PER_CORE) return null;
  const netKw = loadKw - chargeKw;
  if (netKw <= 0) return Number.POSITIVE_INFINITY;
  return KWH_PER_CORE / netKw;
}

export function deviceOutageRow(
  device: HomeDevice,
  chargeKw: number,
): DeviceOutageRow {
  const draw = drawWatts(device);
  const loadKw = draw.watts > 0 ? draw.watts / 1000 : 0;
  const overLimit = loadKw > KW_PER_CORE;
  const hoursOnCore = hoursAtNetLoad(loadKw, 0);
  const hoursWithGenerator =
    chargeKw > 0 ? hoursAtNetLoad(loadKw, chargeKw) : null;

  return {
    id: device.id,
    name: device.name,
    watts: draw.watts,
    wattsExact: draw.exact,
    hoursOnCore,
    hoursWithGenerator,
    overLimit,
  };
}

/** Steady combined draw of every load with a known wattage. Estimate. */
export function combinedOutage(
  loads: HomeDevice[],
  chargeKw: number,
): CombinedOutage {
  const counted = loads
    .map((device) => drawWatts(device))
    .filter((draw) => draw.watts > 0);
  const loadKw = counted.reduce((sum, draw) => sum + draw.watts, 0) / 1000;
  const overLimit = loadKw > KW_PER_CORE;
  return {
    loadKw,
    loadsCounted: counted.length,
    overLimit,
    hoursOnCore: hoursAtNetLoad(loadKw, 0),
    hoursWithGenerator: chargeKw > 0 ? hoursAtNetLoad(loadKw, chargeKw) : null,
  };
}

export function coversOutage(
  hours: number | null,
  durationHours: number,
): boolean {
  if (hours == null) return false;
  return hours >= durationHours;
}

export function formatRuntimeHours(hours: number | null): string {
  if (hours == null) return "Unknown";
  if (!Number.isFinite(hours)) return "While the generator runs";
  if (hours >= 10) return `${Math.round(hours)} h`;
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded} h`;
}
