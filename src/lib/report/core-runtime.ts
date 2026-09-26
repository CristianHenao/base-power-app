/**
 * How long Base Cores run a chosen set of appliances. Runs in the browser on purpose:
 * device lists can include medical equipment, and household details never leave the device.
 *
 * Same energy math as api/app/sim/backup.py for a steady load. Constants must match it;
 * tests/test_core_runtime_parity.py fails CI if they drift.
 */

export const KWH_PER_CORE = 39.2;
export const KW_PER_CORE = 20;
/** Base keeps about 20% in reserve during grid work; an outage nobody forecast can start there. */
export const RESERVE_SOC = 0.2;

/** Device kinds that supply or route power rather than draw it. */
const NOT_A_LOAD = new Set(["panel", "battery", "generator"]);

export interface ApplianceLoad {
  watts: number;
  kind?: string;
}

export interface CoreRuntime {
  /** Hours on a full battery (storm forecast) and from the 20% reserve (no warning). */
  fullHours: number | null;
  reserveHours: number | null;
  /** The combined draw is above what this many Cores can start and carry. */
  overLimit: boolean;
}

export interface ApplianceRuntime {
  loadKw: number;
  loadsCounted: number;
  cores: Record<1 | 2, CoreRuntime>;
}

function runtime(loadKw: number, cores: number): CoreRuntime {
  const overLimit = loadKw > KW_PER_CORE * cores;
  if (loadKw <= 0 || overLimit) return { fullHours: null, reserveHours: null, overLimit };
  const kwh = KWH_PER_CORE * cores;
  return { fullHours: kwh / loadKw, reserveHours: (kwh * RESERVE_SOC) / loadKw, overLimit };
}

/**
 * Nameplate watts are usually a peak; fridges and AC cycle, so real runtime is longer.
 * Treat the result as a floor, and label it an estimate.
 */
export function applianceRuntime(devices: ApplianceLoad[]): ApplianceRuntime {
  const loads = devices.filter((d) => !NOT_A_LOAD.has(d.kind ?? "") && Number.isFinite(d.watts) && d.watts > 0);
  const loadKw = loads.reduce((sum, d) => sum + d.watts, 0) / 1000;
  return { loadKw, loadsCounted: loads.length, cores: { 1: runtime(loadKw, 1), 2: runtime(loadKw, 2) } };
}

/** One plain sentence for the UI. */
export function describeRuntime(result: ApplianceRuntime): string {
  if (result.loadsCounted === 0) return "Add appliances to see how long a Core runs them.";
  const one = result.cores[1];
  const kw = result.loadKw.toFixed(1);
  if (one.overLimit) {
    return result.cores[2].overLimit
      ? `These appliances draw about ${kw} kW together, more than two Cores can carry at once. Estimate.`
      : `These appliances draw about ${kw} kW together, more than one Core can carry; two Cores can. Estimate.`;
  }
  return `Running only these (about ${kw} kW), one Core lasts about ${Math.round(one.fullHours ?? 0)} hours from full, `
    + `or about ${Math.round(one.reserveHours ?? 0)} hours if an outage hits without warning. Estimate.`;
}
