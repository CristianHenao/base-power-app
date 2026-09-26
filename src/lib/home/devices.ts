/** Shared types + helpers for Claude-powered home device scanning. */

export type HomeDeviceKind =
  | "appliance"
  | "panel"
  | "battery"
  | "generator"
  | "medical"
  | "unknown";

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
  | "generator"
  | "medical"
  | "other";

export const HOME_DEVICE_CATEGORY_META: Record<
  HomeDeviceCategory,
  { label: string; sortOrder: number }
> = {
  medical: { label: "Medical & medication", sortOrder: 0 },
  panel: { label: "Panel", sortOrder: 1 },
  generator: { label: "Generator", sortOrder: 2 },
  kitchen: { label: "Kitchen", sortOrder: 3 },
  living_room: { label: "Living room", sortOrder: 4 },
  bedroom: { label: "Bedroom", sortOrder: 5 },
  bathroom: { label: "Bathroom", sortOrder: 6 },
  laundry: { label: "Laundry", sortOrder: 7 },
  garage: { label: "Garage", sortOrder: 8 },
  office: { label: "Office", sortOrder: 9 },
  outdoor: { label: "Outdoor", sortOrder: 10 },
  other: { label: "Other", sortOrder: 11 },
};

export const HOME_DEVICE_CATEGORIES = Object.keys(
  HOME_DEVICE_CATEGORY_META,
) as HomeDeviceCategory[];

/** One row in the device detail grid (label above value). */
export type DeviceSpecField = {
  key: string;
  label: string;
  value: string;
};

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

/** Structured OCR result from a device nameplate / rating label. */
export type DeviceNameplateResult = {
  brand: string | null;
  model: string | null;
  description: string | null;
  inputVoltage: string | null;
  inputFrequency: string | null;
  inputPhase: string | null;
  inputWatts: number | null;
  outputWatts: number | null;
  microwaveFrequency: string | null;
  manufactureDate: string | null;
  origin: string | null;
  manufacturer: string | null;
  fccId: string | null;
  circuitRequirement: string | null;
  fields: DeviceSpecField[];
  confidence: number;
  notes: string | null;
};

/** One breaker / circuit from a panel directory scan. */
export type PanelBreaker = {
  id: string;
  /** Slot number(s), e.g. "1", "3/5", "MAIN" */
  position: string;
  amps: number | null;
  /** Handwritten or printed directory label — what this circuit feeds */
  label: string;
  side: "left" | "right" | "center" | "unknown";
  isMain: boolean;
  isSpare: boolean;
  confidence: number;
};

/** Claude OCR of an open breaker panel (positions + handwritten labels). */
export type PanelDirectoryResult = {
  brand: string | null;
  mainAmps: number | null;
  spaces: number | null;
  breakers: PanelBreaker[];
  confidence: number;
  notes: string | null;
};

export type HomeDevice = {
  id: string;
  name: string;
  kind: HomeDeviceKind;
  category: HomeDeviceCategory;
  brand: string | null;
  model: string | null;
  /** Continuous / nameplate draw for backup estimates */
  watts: number;
  /** True when watts came from a nameplate scan (not an estimate) */
  wattsExact: boolean;
  confidence: number;
  notes: string | null;
  isMedical: boolean;
  needsRefrigeration: boolean;
  /** Cropped device outline PNG — data URL (transient) or Supabase Storage public URL */
  thumbnailUrl: string | null;
  /** Extra nameplate fields shown in the detail grid */
  specs: DeviceSpecField[];
  nameplateScannedAt: string | null;
  /** Breaker directory from a panel interior scan */
  breakers: PanelBreaker[];
  panelScannedAt: string | null;
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
  { match: /generator|standby\s*gen|inverter\s*generator/i, watts: 3500 },
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
  if (kind === "generator") return 3500;
  return 100;
}

function parseCategory(raw: unknown): HomeDeviceCategory {
  if (typeof raw !== "string") return "other";
  return (HOME_DEVICE_CATEGORIES as string[]).includes(raw)
    ? (raw as HomeDeviceCategory)
    : "other";
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export function createScannedDevice(
  result: DeviceScanResult,
  index = 0,
  thumbnailUrl: string | null = null,
): HomeDevice {
  const isMedical = result.isMedical || result.kind === "medical";
  const isGenerator =
    result.kind === "generator" ||
    /\bgenerator\b/i.test(result.name) ||
    result.category === "generator";

  let category = result.category;
  if (isGenerator) category = "generator";
  else if (result.category === "other" && isMedical) category = "medical";

  let kind = result.kind;
  if (isGenerator) kind = "generator";
  else if (isMedical && kind === "appliance") kind = "medical";

  return {
    id: `device-${Date.now()}-${index}`,
    name: result.name,
    kind,
    category,
    brand: result.brand,
    model: result.model,
    watts: estimateWattsForDevice(result.name, kind, result.watts),
    wattsExact: false,
    confidence: result.confidence,
    notes: result.notes,
    isMedical: isGenerator ? false : isMedical,
    needsRefrigeration: isGenerator ? false : result.needsRefrigeration,
    thumbnailUrl,
    specs: [],
    nameplateScannedAt: null,
    breakers: [],
    panelScannedAt: null,
    scannedAt: new Date().toISOString(),
    source: "scan",
  };
}

/** Merge nameplate OCR into an existing device (prefer plate values). */
export function applyNameplateToDevice(
  device: HomeDevice,
  plate: DeviceNameplateResult,
): HomeDevice {
  const ratedFromPlate =
    device.kind === "generator"
      ? typeof plate.outputWatts === "number" && plate.outputWatts > 0
        ? Math.round(plate.outputWatts)
        : typeof plate.inputWatts === "number" && plate.inputWatts > 0
          ? Math.round(plate.inputWatts)
          : null
      : typeof plate.inputWatts === "number" && plate.inputWatts > 0
        ? Math.round(plate.inputWatts)
        : null;

  const nextSpecs = mergeSpecFields(device.specs, plate.fields);

  return {
    ...device,
    brand: plate.brand ?? device.brand,
    model: plate.model ?? device.model,
    name:
      plate.description && !device.name.toLowerCase().includes("microwave")
        ? device.name
        : device.name,
    watts: ratedFromPlate ?? device.watts,
    wattsExact: ratedFromPlate != null ? true : device.wattsExact,
    notes: plate.notes ?? device.notes,
    specs: nextSpecs,
    nameplateScannedAt: new Date().toISOString(),
    confidence: Math.max(device.confidence, plate.confidence),
  };
}

/** Replace panel breaker directory from an interior / label scan. */
export function applyPanelDirectoryToDevice(
  device: HomeDevice,
  directory: PanelDirectoryResult,
): HomeDevice {
  const extras: DeviceSpecField[] = [];
  if (directory.mainAmps != null) {
    extras.push({
      key: "main_amps",
      label: "Main breaker",
      value: `${directory.mainAmps} A`,
    });
  }
  if (directory.spaces != null) {
    extras.push({
      key: "spaces",
      label: "Spaces",
      value: String(directory.spaces),
    });
  }

  return {
    ...device,
    kind: "panel",
    category: "panel",
    brand: directory.brand ?? device.brand,
    notes: directory.notes ?? device.notes,
    specs: mergeSpecFields(device.specs, extras),
    breakers: directory.breakers,
    panelScannedAt: new Date().toISOString(),
    confidence: Math.max(device.confidence, directory.confidence),
  };
}

function mergeSpecFields(
  existing: DeviceSpecField[],
  incoming: DeviceSpecField[],
): DeviceSpecField[] {
  const byKey = new Map<string, DeviceSpecField>();
  for (const field of existing) byKey.set(field.key, field);
  for (const field of incoming) {
    if (!field.value.trim()) continue;
    byKey.set(field.key, field);
  }
  return [...byKey.values()];
}

/** Rows for the detail sheet grid — core identity + nameplate specs. */
export function deviceDetailRows(device: HomeDevice): DeviceSpecField[] {
  const powerLabel =
    device.kind === "generator"
      ? device.wattsExact
        ? "Rated output"
        : "Rated output (estimate)"
      : device.wattsExact
        ? "Input power"
        : "Power (estimate)";

  const core: DeviceSpecField[] = [
    {
      key: "category",
      label: "Category",
      value: HOME_DEVICE_CATEGORY_META[device.category].label,
    },
    {
      key: "brand",
      label: "Brand",
      value: device.brand ?? "—",
    },
    {
      key: "model",
      label: "Model",
      value: device.model ?? "—",
    },
    {
      key: "watts",
      label: powerLabel,
      value: device.watts > 0 ? `${device.watts} W` : "—",
    },
  ];

  if (device.kind === "generator") {
    core.push({
      key: "core_port",
      label: "Core generator port",
      value: "NEMA L14-30R · up to 4 kW charge",
    });
  }

  if (device.kind === "panel" && device.breakers.length > 0) {
    const labeled = device.breakers.filter((b) => !b.isSpare && b.label).length;
    core.push({
      key: "circuits",
      label: "Circuits mapped",
      value: `${labeled} of ${device.breakers.length}`,
    });
  }

  if (device.isMedical) {
    core.push({ key: "medical", label: "Medical load", value: "Yes" });
  }
  if (device.needsRefrigeration) {
    core.push({
      key: "refrigeration",
      label: "Needs refrigeration",
      value: "Yes",
    });
  }

  const coreKeys = new Set(core.map((row) => row.key));
  const extras = device.specs.filter(
    (row) => row.value && row.value !== "—" && !coreKeys.has(row.key),
  );

  return [...core, ...extras];
}

export function groupDevicesByCategory(
  devices: HomeDevice[],
): Array<{
  category: HomeDeviceCategory;
  label: string;
  devices: HomeDevice[];
}> {
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
  let kind: HomeDeviceKind =
    kindRaw === "appliance" ||
    kindRaw === "panel" ||
    kindRaw === "battery" ||
    kindRaw === "generator" ||
    kindRaw === "medical" ||
    kindRaw === "unknown"
      ? kindRaw
      : "unknown";

  if (kind !== "generator" && /\bgenerator\b/i.test(name)) {
    kind = "generator";
  }

  const brand = asNullableString(obj.brand);
  const model = asNullableString(obj.model);
  const watts = asNullableNumber(obj.watts);

  let confidence = 0.5;
  if (typeof obj.confidence === "number" && Number.isFinite(obj.confidence)) {
    confidence = Math.min(1, Math.max(0, obj.confidence));
  }

  const notes = asNullableString(obj.notes);
  const isMedical =
    kind !== "generator" && (Boolean(obj.isMedical) || kind === "medical");
  const needsRefrigeration =
    kind !== "generator" && Boolean(obj.needsRefrigeration);

  let category = parseCategory(obj.category);
  if (kind === "panel") category = "panel";
  if (kind === "generator") category = "generator";
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

function fieldFrom(
  key: string,
  label: string,
  value: string | null,
): DeviceSpecField | null {
  if (!value) return null;
  return { key, label, value };
}

export function parseDeviceNameplateResult(
  raw: unknown,
): DeviceNameplateResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const brand = asNullableString(obj.brand);
  const model = asNullableString(obj.model);
  const description = asNullableString(obj.description);
  const inputVoltage = asNullableString(obj.inputVoltage);
  const inputFrequency = asNullableString(obj.inputFrequency);
  const inputPhase = asNullableString(obj.inputPhase);
  const inputWatts = asNullableNumber(obj.inputWatts);
  const outputWatts = asNullableNumber(obj.outputWatts);
  const microwaveFrequency = asNullableString(obj.microwaveFrequency);
  const manufactureDate = asNullableString(obj.manufactureDate);
  const origin = asNullableString(obj.origin);
  const manufacturer = asNullableString(obj.manufacturer);
  const fccId = asNullableString(obj.fccId);
  const circuitRequirement = asNullableString(obj.circuitRequirement);
  const notes = asNullableString(obj.notes);

  let confidence = 0.5;
  if (typeof obj.confidence === "number" && Number.isFinite(obj.confidence)) {
    confidence = Math.min(1, Math.max(0, obj.confidence));
  }

  const builtIn: DeviceSpecField[] = [
    fieldFrom("brand", "Brand", brand),
    fieldFrom("model", "Model", model),
    fieldFrom("description", "Description", description),
    fieldFrom("inputVoltage", "Input voltage", inputVoltage),
    fieldFrom("inputFrequency", "Input frequency", inputFrequency),
    fieldFrom("inputPhase", "Phase", inputPhase),
    fieldFrom(
      "inputWatts",
      "Input power",
      inputWatts != null ? `${Math.round(inputWatts)} W` : null,
    ),
    fieldFrom(
      "outputWatts",
      "Output power",
      outputWatts != null ? `${Math.round(outputWatts)} W` : null,
    ),
    fieldFrom("microwaveFrequency", "Frequency", microwaveFrequency),
    fieldFrom("manufactureDate", "Manufacture date", manufactureDate),
    fieldFrom("origin", "Origin", origin),
    fieldFrom("manufacturer", "Manufacturer", manufacturer),
    fieldFrom("fccId", "FCC ID", fccId),
    fieldFrom("circuitRequirement", "Circuit", circuitRequirement),
  ].filter((field): field is DeviceSpecField => Boolean(field));

  const extraFields: DeviceSpecField[] = [];
  if (Array.isArray(obj.fields)) {
    for (const item of obj.fields) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const label = asNullableString(row.label);
      const value = asNullableString(row.value);
      const key =
        asNullableString(row.key) ??
        (label ? label.toLowerCase().replace(/\s+/g, "_") : null);
      if (!key || !label || !value) continue;
      extraFields.push({ key, label, value });
    }
  }

  const fields = mergeSpecFields(builtIn, extraFields);
  if (!brand && !model && fields.length === 0) return null;

  return {
    brand,
    model,
    description,
    inputVoltage,
    inputFrequency,
    inputPhase,
    inputWatts,
    outputWatts,
    microwaveFrequency,
    manufactureDate,
    origin,
    manufacturer,
    fccId,
    circuitRequirement,
    fields,
    confidence,
    notes,
  };
}

function parseBreakerSide(
  raw: unknown,
): PanelBreaker["side"] {
  if (raw === "left" || raw === "right" || raw === "center") return raw;
  return "unknown";
}

function sortPanelBreakers(breakers: PanelBreaker[]): PanelBreaker[] {
  const sideOrder = { left: 0, center: 1, right: 2, unknown: 3 };
  return [...breakers].sort((a, b) => {
    const sideDiff = sideOrder[a.side] - sideOrder[b.side];
    if (sideDiff !== 0) return sideDiff;
    const aNum = Number.parseInt(a.position, 10);
    const bNum = Number.parseInt(b.position, 10);
    if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
    return a.position.localeCompare(b.position);
  });
}

export function parsePanelDirectoryResult(
  raw: unknown,
): PanelDirectoryResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const brand = asNullableString(obj.brand);
  const mainAmps = asNullableNumber(obj.mainAmps);
  const spaces = asNullableNumber(obj.spaces);
  const notes = asNullableString(obj.notes);

  let confidence = 0.5;
  if (typeof obj.confidence === "number" && Number.isFinite(obj.confidence)) {
    confidence = Math.min(1, Math.max(0, obj.confidence));
  }

  const breakers: PanelBreaker[] = [];
  if (Array.isArray(obj.breakers)) {
    obj.breakers.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const row = item as Record<string, unknown>;
      const position =
        asNullableString(row.position) ??
        asNullableString(row.slot) ??
        asNullableString(row.number);
      if (!position) return;

      const ampsRaw = asNullableNumber(row.amps);
      const amps =
        ampsRaw != null && ampsRaw > 0 ? Math.round(ampsRaw) : null;
      const label =
        asNullableString(row.label) ??
        asNullableString(row.description) ??
        (Boolean(row.isSpare) ? "Spare" : "Unlabeled");
      let breakerConfidence = confidence;
      if (
        typeof row.confidence === "number" &&
        Number.isFinite(row.confidence)
      ) {
        breakerConfidence = Math.min(1, Math.max(0, row.confidence));
      }

      breakers.push({
        id: `brk-${position.replace(/[^a-zA-Z0-9_-]/g, "_")}-${index}`,
        position,
        amps,
        label,
        side: parseBreakerSide(row.side),
        isMain: Boolean(row.isMain),
        isSpare:
          Boolean(row.isSpare) ||
          /^spare|empty|blank|unused$/i.test(label),
        confidence: breakerConfidence,
      });
    });
  }

  if (breakers.length === 0) return null;

  return {
    brand,
    mainAmps: mainAmps != null && mainAmps > 0 ? Math.round(mainAmps) : null,
    spaces: spaces != null && spaces > 0 ? Math.round(spaces) : null,
    breakers: sortPanelBreakers(breakers),
    confidence,
    notes,
  };
}
