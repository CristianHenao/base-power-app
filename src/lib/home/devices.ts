/** Shared types + helpers for Claude-powered home device scanning. */

export type HomeDeviceKind = "appliance" | "panel" | "battery" | "medical" | "unknown";

/** Where the load typically lives in the home. */
export type HomeDeviceCategory =
  | "kitchen"
  | "living_room"
  | "bedroom"
  | "bathroom"
  | "garage"
  | "laundry"
  | "office"
  | "outdoor"
  | "panel"
  | "medical"
  | "other";

export const HOME_DEVICE_CATEGORY_META: Record<
  HomeDeviceCategory,
  { label: string; sortOrder: number }
> = {
  medical: { label: "Medical & medication", sortOrder: 0 },
  panel: { label: "Panel", sortOrder: 1 },
  kitchen: { label: "Kitchen", sortOrder: 2 },
  living_room: { label: "Living room", sortOrder: 3 },
  bedroom: { label: "Bedroom", sortOrder: 4 },
  bathroom: { label: "Bathroom", sortOrder: 5 },
  laundry: { label: "Laundry", sortOrder: 6 },
  garage: { label: "Garage", sortOrder: 7 },
  office: { label: "Office", sortOrder: 8 },
  outdoor: { label: "Outdoor", sortOrder: 9 },
  other: { label: "Other", sortOrder: 10 },
};

export const HOME_DEVICE_CATEGORIES = Object.keys(
  HOME_DEVICE_CATEGORY_META,
) as HomeDeviceCategory[];

export type DeviceScanResult = {
  name: string;
  kind: HomeDeviceKind;
  category: HomeDeviceCategory;
  brand: string | null;
  model: string | null;
  /** Continuous draw estimate in watts; null when unknown / not applicable */
  watts: number | null;
  confidence: number;
  notes: string | null;
  /** True for CPAP, oxygen, dialysis, powered medical equipment, etc. */
  isMedical: boolean;
  /** True when the load must stay powered to keep medication cold */
  needsRefrigeration: boolean;
  /** Normalized bbox relative to image: [x, y, width, height] in 0–1 */
  bbox: [number, number, number, number] | null;
};

export type HomeDevice = {
  id: string;
  name: string;
  kind: HomeDeviceKind;
  category: HomeDeviceCategory;
  brand: string | null;
  model: string | null;
  /** Continuous draw estimate; 0 for panel / storage when unknown */
  watts: number;
  confidence: number;
  notes: string | null;
  isMedical: boolean;
  needsRefrigeration: boolean;
  /** Cropped device outline PNG — data URL or /home/scans/*.png */
  thumbnailUrl: string | null;
  scannedAt: string;
  source: "scan" | "manual";
};

/** Typical continuous-draw estimates (labeled as estimates in UI). */
const WATT_LOOKUP: Array<{ match: RegExp; watts: number }> = [
  { match: /insulin|medication\s*fridge|pharmacy\s*fridge|mini\s*fridge/i, watts: 60 },
  { match: /cpap|bipap|ventilator/i, watts: 90 },
  { match: /oxygen\s*concentrator/i, watts: 350 },
  { match: /nebulizer/i, watts: 50 },
  { match: /dialysis/i, watts: 1500 },
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

function parseCategory(raw: unknown): HomeDeviceCategory {
  if (typeof raw !== "string") return "other";
  return (HOME_DEVICE_CATEGORIES as string[]).includes(raw)
    ? (raw as HomeDeviceCategory)
    : "other";
}

export function createScannedDevice(
  result: DeviceScanResult,
  index = 0,
  thumbnailUrl: string | null = null,
): HomeDevice {
  const isMedical = result.isMedical || result.kind === "medical";
  const category =
    result.category === "other" && isMedical ? "medical" : result.category;

  return {
    id: `device-${Date.now()}-${index}`,
    name: result.name,
    kind: isMedical && result.kind === "appliance" ? "medical" : result.kind,
    category,
    brand: result.brand,
    model: result.model,
    watts: estimateWattsForDevice(result.name, result.kind, result.watts),
    confidence: result.confidence,
    notes: result.notes,
    isMedical,
    needsRefrigeration: result.needsRefrigeration,
    thumbnailUrl,
    scannedAt: new Date().toISOString(),
    source: "scan",
  };
}

export function groupDevicesByCategory(
  devices: HomeDevice[],
): Array<{ category: HomeDeviceCategory; label: string; devices: HomeDevice[] }> {
  const buckets = new Map<HomeDeviceCategory, HomeDevice[]>();
  for (const device of devices) {
    const list = buckets.get(device.category) ?? [];
    list.push(device);
    buckets.set(device.category, list);
  }

  return [...buckets.entries()]
    .map(([category, items]) => ({
      category,
      label: HOME_DEVICE_CATEGORY_META[category].label,
      devices: items,
    }))
    .sort(
      (a, b) =>
        HOME_DEVICE_CATEGORY_META[a.category].sortOrder -
        HOME_DEVICE_CATEGORY_META[b.category].sortOrder,
    );
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
    kindRaw === "medical" ||
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

  const isMedical = Boolean(obj.isMedical) || kind === "medical";
  const needsRefrigeration = Boolean(obj.needsRefrigeration);

  let category = parseCategory(obj.category);
  if (kind === "panel") category = "panel";
  if (isMedical && (category === "other" || !obj.category)) category = "medical";

  let bbox: DeviceScanResult["bbox"] = null;
  if (Array.isArray(obj.bbox) && obj.bbox.length === 4) {
    const nums = obj.bbox.map((n) =>
      typeof n === "number" && Number.isFinite(n) ? n : null,
    );
    if (nums.every((n) => n != null)) {
      bbox = nums as [number, number, number, number];
    }
  }

  return {
    name,
    kind,
    category,
    brand,
    model,
    watts,
    confidence,
    notes,
    isMedical,
    needsRefrigeration,
    bbox,
  };
}
