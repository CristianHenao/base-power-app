import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HOME_DEVICE_CATEGORIES,
  type HomeDevice,
  type HomeDeviceCategory,
  type HomeDeviceKind,
  type PanelBreaker,
  type DeviceSpecField,
} from "@/lib/home/devices";
import type {
  Database,
  HomeDeviceInsert,
  HomeDeviceRow,
  Json,
} from "@/lib/supabase/database.types";
import { HOME_DEVICES_BUCKET, homeDeviceStoragePath } from "@/lib/home/device-storage";

type Client = SupabaseClient<Database>;

const KINDS = new Set<HomeDeviceKind>([
  "appliance",
  "panel",
  "battery",
  "generator",
  "medical",
  "unknown",
]);

function asKind(raw: string): HomeDeviceKind {
  return KINDS.has(raw as HomeDeviceKind)
    ? (raw as HomeDeviceKind)
    : "unknown";
}

function asCategory(raw: string): HomeDeviceCategory {
  return (HOME_DEVICE_CATEGORIES as string[]).includes(raw)
    ? (raw as HomeDeviceCategory)
    : "other";
}

function asSpecFields(raw: Json): DeviceSpecField[] {
  if (!Array.isArray(raw)) return [];
  const fields: DeviceSpecField[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const key = typeof row.key === "string" ? row.key.trim() : "";
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const value = typeof row.value === "string" ? row.value.trim() : "";
    if (!key || !label || !value) continue;
    fields.push({ key, label, value });
  }
  return fields;
}

function asBreakers(raw: Json): PanelBreaker[] {
  if (!Array.isArray(raw)) return [];
  const breakers: PanelBreaker[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const row = item as Record<string, unknown>;
    const position =
      typeof row.position === "string" ? row.position.trim() : "";
    if (!position) return;
    const label =
      typeof row.label === "string" && row.label.trim()
        ? row.label.trim()
        : "Unlabeled";
    const side =
      row.side === "left" ||
      row.side === "right" ||
      row.side === "center"
        ? row.side
        : "unknown";
    const amps =
      typeof row.amps === "number" && Number.isFinite(row.amps)
        ? Math.round(row.amps)
        : null;
    const confidence =
      typeof row.confidence === "number" && Number.isFinite(row.confidence)
        ? Math.min(1, Math.max(0, row.confidence))
        : 0.5;
    breakers.push({
      id:
        typeof row.id === "string" && row.id
          ? row.id
          : `brk-${position}-${index}`,
      position,
      amps,
      label,
      side,
      isMain: Boolean(row.isMain),
      isSpare: Boolean(row.isSpare),
      confidence,
    });
  });
  return breakers;
}

/** Map a DB row to the in-app HomeDevice (client_key → id). */
export function homeDeviceFromRow(row: HomeDeviceRow): HomeDevice {
  return {
    id: row.client_key,
    name: row.name,
    kind: asKind(row.kind),
    category: asCategory(row.category),
    brand: row.brand,
    model: row.model,
    watts: row.watts,
    wattsExact: row.watts_exact,
    confidence: row.confidence,
    notes: row.notes,
    isMedical: row.is_medical,
    needsRefrigeration: row.needs_refrigeration,
    thumbnailUrl: row.thumbnail_url,
    specs: asSpecFields(row.specs),
    nameplateScannedAt: row.nameplate_scanned_at,
    breakers: asBreakers(row.breakers),
    panelScannedAt: row.panel_scanned_at,
    scannedAt: row.scanned_at,
    source: row.source === "manual" ? "manual" : "scan",
  };
}

export function homeDeviceToInsert(
  userId: string,
  device: HomeDevice,
): HomeDeviceInsert {
  return {
    user_id: userId,
    client_key: device.id,
    name: device.name,
    kind: device.kind,
    category: device.category,
    brand: device.brand,
    model: device.model,
    watts: Math.max(0, Math.round(device.watts)),
    watts_exact: device.wattsExact,
    confidence: Math.min(1, Math.max(0, device.confidence)),
    notes: device.notes,
    is_medical: device.isMedical,
    needs_refrigeration: device.needsRefrigeration,
    thumbnail_url: device.thumbnailUrl?.startsWith("data:")
      ? null
      : device.thumbnailUrl,
    specs: device.specs as unknown as Json,
    nameplate: null,
    nameplate_scanned_at: device.nameplateScannedAt,
    breakers: (device.breakers ?? []) as unknown as Json,
    panel_scanned_at: device.panelScannedAt,
    scanned_at: device.scannedAt,
    source: device.source,
  };
}

export async function listHomeDevices(
  client: Client,
  userId: string,
): Promise<HomeDevice[]> {
  const { data, error } = await client
    .from("home_devices")
    .select("*")
    .eq("user_id", userId)
    .order("scanned_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(homeDeviceFromRow);
}

/** Insert or update by (user_id, client_key). */
export async function upsertHomeDevice(
  client: Client,
  userId: string,
  device: HomeDevice,
): Promise<HomeDevice> {
  const payload = homeDeviceToInsert(userId, device);
  const { data, error } = await client
    .from("home_devices")
    .upsert(payload, { onConflict: "user_id,client_key" })
    .select("*")
    .single();

  if (error) throw error;
  return homeDeviceFromRow(data);
}

/** Delete by client_key; best-effort remove of Storage thumbnail. */
export async function deleteHomeDevice(
  client: Client,
  userId: string,
  clientKey: string,
): Promise<void> {
  const storagePath = homeDeviceStoragePath(userId, clientKey);
  await client.storage.from(HOME_DEVICES_BUCKET).remove([storagePath]);

  const { error } = await client
    .from("home_devices")
    .delete()
    .eq("user_id", userId)
    .eq("client_key", clientKey);

  if (error) throw error;
}
