import type { HomeDevice, PanelBreaker } from "./devices.ts";

const STOP = new Set([
  "the",
  "a",
  "an",
  "of",
  "and",
  "unit",
  "machine",
  "over",
  "range",
  "outdoor",
  "indoor",
]);

/** Handwritten panel labels and device names for the same load. */
const CANON: Record<string, string> = {
  fridge: "refrigerator",
  refrigerator: "refrigerator",
  ref: "refrigerator",
  micro: "microwave",
  microwave: "microwave",
  ac: "cooling",
  condenser: "cooling",
  hvac: "cooling",
  conditioner: "cooling",
  cpap: "cpap",
  bipap: "cpap",
  purifier: "purifier",
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\ba\s*[./]\s*c\b/g, "ac")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  const words = normalize(value)
    .split(" ")
    .filter((word) => word.length > 0 && !STOP.has(word));
  const out = new Set<string>();
  for (const word of words) out.add(CANON[word] ?? word);
  return out;
}

function isSubset(inner: Set<string>, outer: Set<string>): boolean {
  if (inner.size === 0) return false;
  for (const token of inner) {
    if (!outer.has(token)) return false;
  }
  return true;
}

function isSpecific(set: Set<string>): boolean {
  for (const token of set) {
    if (token.length >= 4) return true;
  }
  return false;
}

function labelsMatch(deviceName: string, label: string): boolean {
  const deviceTokens = tokens(deviceName);
  const labelTokens = tokens(label);
  if (!isSpecific(deviceTokens) || !isSpecific(labelTokens)) return false;
  return (
    isSubset(labelTokens, deviceTokens) || isSubset(deviceTokens, labelTokens)
  );
}

function usableBreaker(breaker: PanelBreaker): boolean {
  if (breaker.isMain || breaker.isSpare) return false;
  const label = breaker.label.trim();
  if (!label) return false;
  if (/^(unlabeled|spare|empty|blank)$/i.test(label)) return false;
  return breaker.position.trim().length > 0;
}

/**
 * Breaker whose directory label names this device.
 * Null when the panel scan has no matching circuit.
 */
export function breakerForDevice(
  device: HomeDevice,
  home: HomeDevice[],
): PanelBreaker | null {
  let best: PanelBreaker | null = null;
  let bestScore = 0;

  for (const panel of home) {
    if (panel.kind !== "panel") continue;
    for (const breaker of panel.breakers) {
      if (!usableBreaker(breaker)) continue;
      if (!labelsMatch(device.name, breaker.label)) continue;
      const score = tokens(breaker.label).size;
      if (score > bestScore) {
        best = breaker;
        bestScore = score;
      }
    }
  }

  return best;
}
