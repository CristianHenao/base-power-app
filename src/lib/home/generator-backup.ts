import type { HomeDevice } from "@/lib/home/devices";

/** Base Core energy (docs/battery-tech-specs.md). */
export const CORE_KWH = 39.2;

/**
 * Max charge rate into Core via the generator port (NEMA L14-30R).
 * 4 kW at 240 V; 2 kW at 120 V. We use the 240 V ceiling.
 */
export const CORE_GENERATOR_CHARGE_KW = 4;

/**
 * Midpoint of Base’s “typical” 12–18 h on one Core (≈1.5 kW average home).
 * Always labeled as an estimate in the UI.
 */
export const CORE_HOURS_ALONE_TYPICAL = 15;

/**
 * Base help-center figure: generator topping up, 1.5 kW load → 78 h on one Core.
 * Assumes the gen can feed the full 4 kW port.
 */
export const CORE_HOURS_WITH_FULL_GENERATOR = 78;

export type GeneratorCoreExtension = {
  /** Rated generator output used for the estimate (W). */
  ratedWatts: number;
  /** Charge into Core, capped at the port (kW). */
  chargeKw: number;
  /** Fraction of the 4 kW port this gen can feed (0–1). */
  chargeFraction: number;
  /** Estimated hours on one Core alone (typical home). */
  hoursAlone: number;
  /** Estimated hours with this generator topping up. */
  hoursWithGenerator: number;
  /** Extra hours vs Core alone. */
  extensionHours: number;
  /** Extra duration as a percent of Core-alone hours. */
  extensionPercent: number;
  /** True when charge can offset a typical ~1.5 kW load. */
  canOffsetTypicalLoad: boolean;
};

/**
 * Estimate how a portable/standby generator extends Base Core backup.
 * Scales Base’s published 15 h → 78 h pair by how much of the 4 kW port
 * the generator can feed. Always an estimate.
 */
export function estimateGeneratorCoreExtension(
  ratedWatts: number,
): GeneratorCoreExtension | null {
  if (!Number.isFinite(ratedWatts) || ratedWatts <= 0) return null;

  const chargeKw = Math.min(ratedWatts / 1000, CORE_GENERATOR_CHARGE_KW);
  const chargeFraction = chargeKw / CORE_GENERATOR_CHARGE_KW;
  const hoursAlone = CORE_HOURS_ALONE_TYPICAL;
  const hoursWithGenerator =
    hoursAlone +
    (CORE_HOURS_WITH_FULL_GENERATOR - hoursAlone) * chargeFraction;
  const extensionHours = hoursWithGenerator - hoursAlone;
  const extensionPercent = (extensionHours / hoursAlone) * 100;

  return {
    ratedWatts: Math.round(ratedWatts),
    chargeKw: Math.round(chargeKw * 10) / 10,
    chargeFraction,
    hoursAlone,
    hoursWithGenerator: Math.round(hoursWithGenerator),
    extensionHours: Math.round(extensionHours),
    extensionPercent: Math.round(extensionPercent),
    canOffsetTypicalLoad: chargeKw >= 1.5,
  };
}

export function generatorExtensionForDevice(
  device: HomeDevice,
): GeneratorCoreExtension | null {
  if (device.kind !== "generator") return null;
  return estimateGeneratorCoreExtension(device.watts);
}

/** Short list-row line, e.g. "Extends Core ~+63 h (~420%) est." */
export function formatGeneratorExtensionShort(
  ext: GeneratorCoreExtension,
): string {
  return `Extends Core ~+${ext.extensionHours} h (~${ext.extensionPercent}%) est.`;
}

/** Detail callout body — numbers must stay estimates. */
export function formatGeneratorExtensionDetail(
  ext: GeneratorCoreExtension,
): string {
  return `Base Core’s generator port takes up to ${CORE_GENERATOR_CHARGE_KW} kW. At a typical home load, this generator is estimated to extend backup from about ${ext.hoursAlone} h to about ${ext.hoursWithGenerator} h (+${ext.extensionHours} h / +${ext.extensionPercent}%). Estimate.`;
}
