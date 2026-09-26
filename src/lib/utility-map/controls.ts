import type { LayerId, MapLayerMeta, Preset } from "./types.ts";

/** Pure rules behind the controls panel: modes, layer toggles and lenses. */

export type ModeId = "risk" | "hazards" | "grid" | "fleet";

export const MODES: { id: ModeId; label: string; hint: string }[] = [
  { id: "risk", label: "Risk", hint: "Where hazards and grid stress overlap" },
  { id: "hazards", label: "Hazards", hint: "Where events actually happened" },
  { id: "grid", label: "Grid", hint: "Demand and local generation" },
  { id: "fleet", label: "Base fleet", hint: "What a Base fleet would add" },
];

export function parseMode(search: URLSearchParams): ModeId {
  const value = search.get("mode");
  return MODES.some((m) => m.id === value) ? (value as ModeId) : "risk";
}

export function toggleLayer(
  active: LayerId[],
  id: LayerId,
  on: boolean,
  layers: Pick<MapLayerMeta, "id" | "available">[],
): LayerId[] {
  if (on && !layers.find((l) => l.id === id)?.available) return active;
  const next = new Set(active);
  if (on) next.add(id);
  else next.delete(id);
  return layers.map((l) => l.id).filter((l) => next.has(l));
}

export function matchPreset(active: LayerId[], presets: Preset[]): string | null {
  const match = presets.find(
    (p) => p.layers.length === active.length && p.layers.every((l) => active.includes(l)),
  );
  return match?.id ?? null;
}

export function lensCoverage(
  preset: Preset,
  layers: Pick<MapLayerMeta, "id" | "available">[],
): { available: number; requested: number; missing: LayerId[] } {
  const requested = preset.requested ?? preset.layers;
  const missing = requested.filter((id) => !layers.find((l) => l.id === id)?.available);
  return { available: requested.length - missing.length, requested: requested.length, missing };
}
