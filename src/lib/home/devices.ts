/** Shared types + helpers for Claude-powered home device scanning. */

export type HomeDeviceKind = "appliance" | "panel" | "battery" | "unknown";

export type DeviceScanResult = {
  name: string;
  kind: HomeDeviceKind;
  brand: string | null;
  model: string | null;
  /** Continuous draw estimate in watts; null when unknown / not applicable */
  watts: number | null;
  confidence: number;
  notes: string | null;
  /** Normalized bbox relative to image: [x, y, width, height] in 0–1 */
  bbox: [number, number, number, number] | null;
};

export type HomeDevice = {
  id: string;
  name: string;
  kind: HomeDeviceKind;
  brand: string | null;
  model: string | null;
  /** Continuous draw estimate; 0 for panel / storage when unknown */
  watts: number;
  confidence: number;
  notes: string | null;
  scannedAt: string;
  source: "scan" | "manual";
};

/** Typical continuous-draw estimates (labeled as estimates in UI). */
const WATT_LOOKUP: Array<{ match: RegExp; watts: number }> = [
  { match: /refrigerator|fridge/i, watts: 150 },
  { match: /freezer/i, watts: 100 },
  { match: /wifi|wi-?fi|router|modem/i, watts: 12 },
  { match: /television|tv\b|oled|qled/i, watts: 100 },
  { match: /laptop|notebook/i, watts: 65 },
  { match: /desktop|pc\b|computer/i, watts: 150 },
  { match: /led|lamp|light|bulb/i, watts: 60 },
  { match: /ceiling\s*fan|fan\b/i, watts: 70 },
  { match: /microwave/i, watts: 1000 },
  { match: /dishwasher/i, watts: 1800 },
  { match: /washer|washing\s*machine/i, watts: 500 },
  { match: /dryer/i, watts: 3000 },
  { match: /hvac|air\s*conditioner|a\/c|ac\s*unit|heat\s*pump/i, watts: 3500 },
  { match: /furnace/i, watts: 600 },
  { match: /water\s*heater/i, watts: 4500 },
  { match: /base\s*core|home\s*battery|powerwall/i, watts: 0 },
  { match: /panel|breaker|load\s*center/i, watts: 0 },
];

export function estimateWattsForDevice(
  name: string,
  kind: HomeDeviceKind,
  wattsFromModel: number | null,
): number {
  if (typeof wattsFromModel === "number" && wattsFromModel >= 0) {
    return Math.round(wattsFromModel);
  }
  if (kind === "panel" || kind === "battery") return 0;
  for (const entry of WATT_LOOKUP) {
    if (entry.match.test(name)) return entry.watts;
  }
  return 100;
}

export function createScannedDevice(
  result: DeviceScanResult,
  index = 0,
): HomeDevice {
  return {
    id: `device-${Date.now()}-${index}`,
    name: result.name,
    kind: result.kind,
    brand: result.brand,
    model: result.model,
    watts: estimateWattsForDevice(result.name, result.kind, result.watts),
    confidence: result.confidence,
    notes: result.notes,
    scannedAt: new Date().toISOString(),
    source: "scan",
  };
}

export function parseDeviceScanResult(raw: unknown): DeviceScanResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (!name) return null;

  const kindRaw = typeof obj.kind === "string" ? obj.kind : "unknown";
  const kind: HomeDeviceKind =
    kindRaw === "appliance" ||
    kindRaw === "panel" ||
    kindRaw === "battery" ||
    kindRaw === "unknown"
      ? kindRaw
      : "unknown";

  const brand =
    typeof obj.brand === "string" && obj.brand.trim()
      ? obj.brand.trim()
      : null;
  const model =
    typeof obj.model === "string" && obj.model.trim()
      ? obj.model.trim()
      : null;

  let watts: number | null = null;
  if (typeof obj.watts === "number" && Number.isFinite(obj.watts)) {
    watts = Math.max(0, obj.watts);
  } else if (obj.watts === null) {
    watts = null;
  }

  let confidence = 0.5;
  if (typeof obj.confidence === "number" && Number.isFinite(obj.confidence)) {
    confidence = Math.min(1, Math.max(0, obj.confidence));
  }

  const notes =
    typeof obj.notes === "string" && obj.notes.trim()
      ? obj.notes.trim()
      : null;

  let bbox: DeviceScanResult["bbox"] = null;
  if (Array.isArray(obj.bbox) && obj.bbox.length === 4) {
    const nums = obj.bbox.map((n) =>
      typeof n === "number" && Number.isFinite(n) ? n : null,
    );
    if (nums.every((n) => n != null)) {
      bbox = nums as [number, number, number, number];
    }
  }

  return { name, kind, brand, model, watts, confidence, notes, bbox };
}
