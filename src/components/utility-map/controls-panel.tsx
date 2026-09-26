"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { ReactNode } from "react";
import { EvidencePopover } from "@/components/utility-map/evidence-popover";
import { HazardPicker } from "@/components/utility-map/hazard-chip";
import { StormSpotlight } from "@/components/utility-map/storm-spotlight";
import type { HazardId, SpotlightStorm } from "@/lib/utility-map/hazard-style";
import { FloodZoneLegend, SequentialLegend } from "@/components/utility-map/legend";
import { ModeSwitch } from "@/components/utility-map/mode-switch";
import { FLEET_COLORS } from "@/lib/utility-map/fleet";
import { MODES, lensCoverage, type ModeId } from "@/lib/utility-map/controls";
import { LEVEL_COLORS, LEVEL_LABELS, type Level } from "@/lib/utility-map/scoring";
import type {
  LayerGroup,
  LayerId,
  MapLayerMeta,
  Preset,
  SourceRef,
} from "@/lib/utility-map/types";
import { cn } from "@/lib/utils";

const GROUPS: { id: LayerGroup; label: string }[] = [
  { id: "grid", label: "Grid" },
  { id: "hazard", label: "Hazards" },
  { id: "exposure", label: "Exposure" },
];

const LIVE_MODES: ModeId[] = ["risk", "hazards", "grid", "fleet"];

type ControlsPanelProps = {
  mode: ModeId;
  fleetShare: number;
  floodCounties: string[];
  availableHazards: HazardId[];
  hazardPicks: HazardId[];
  onToggleHazard: (hazard: HazardId) => void;
  hazardLegend: ReactNode;
  storms: SpotlightStorm[];
  spotlight: SpotlightStorm | null;
  onSpotlight: (name: string | null) => void;
  countyName: (fips: string) => string;
  view3d: boolean;
  onView3d: (on: boolean) => void;
  layers: MapLayerMeta[];
  presets: Preset[];
  sources: SourceRef[];
  activeLayers: LayerId[];
  activePresetId: string | null;
  showWarnings: boolean;
  onMode: (mode: ModeId) => void;
  onPreset: (preset: Preset) => void;
  onToggleLayer: (id: LayerId, on: boolean) => void;
  onToggleWarnings: (on: boolean) => void;
  className?: string;
};

export function ControlsPanel({
  mode,
  fleetShare,
  floodCounties,
  availableHazards,
  hazardPicks,
  onToggleHazard,
  hazardLegend,
  storms,
  spotlight,
  onSpotlight,
  countyName,
  view3d,
  onView3d,
  layers,
  presets,
  sources,
  activeLayers,
  activePresetId,
  showWarnings,
  onMode,
  onPreset,
  onToggleLayer,
  onToggleWarnings,
  className,
}: ControlsPanelProps) {
  const activePreset = presets.find((p) => p.id === activePresetId);
  const coverage = activePreset ? lensCoverage(activePreset, layers) : null;
  const modeInfo = MODES.find((m) => m.id === mode);

  return (
    <section aria-label="Map controls" className={cn("bp-panel space-y-5 p-5", className)}>
      <div className="space-y-2">
        <p className="bp-eyebrow">Grid stress</p>
        <h1 className="text-[20px] leading-[27px]">Where Texas grids are stressed</h1>
      </div>

      <div className="space-y-2">
        <ModeSwitch mode={mode} onChange={onMode} />
        {mode === "risk" ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] leading-[18px] text-muted-foreground">{modeInfo?.hint}.</p>
            <button type="button" aria-pressed={view3d} onClick={() => onView3d(!view3d)} className="bp-pill !px-2.5 !py-0.5 !text-[12px]">
              3D
            </button>
          </div>
        ) : LIVE_MODES.includes(mode) ? (
          <p className="text-[12px] leading-[18px] text-muted-foreground">{modeInfo?.hint}.</p>
        ) : (
          <p className="bp-info px-3 py-2 text-[12px] leading-[18px]">
            {modeInfo?.label} mode is coming in this release. The map shows Risk until then.
          </p>
        )}
      </div>

      {mode === "hazards" ? (
        <>
          <HazardPicker available={availableHazards} picked={hazardPicks} onToggle={onToggleHazard} />
          <StormSpotlight storms={storms} selected={spotlight} countyName={countyName} onSelect={onSpotlight} />
        </>
      ) : null}

      <div className="space-y-2">
        <p className="text-[12px] leading-[18px] font-semibold text-muted-foreground">Lens</p>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={preset.id === activePresetId}
              onClick={() => onPreset(preset)}
              className="bp-pill"
            >
              {preset.label}
            </button>
          ))}
          {activePresetId == null ? (
            <span className="bp-pill border-dashed text-muted-foreground">Custom</span>
          ) : null}
        </div>
        {coverage && coverage.missing.length > 0 ? (
          <p className="text-[12px] leading-[18px] text-muted-foreground">
            {coverage.available} of {coverage.requested} layers in this lens have data so far
            {activePreset?.layers.includes("weather") ? "; the FEMA weather score stands in" : ""}.
          </p>
        ) : null}
      </div>

      {GROUPS.map((group) => {
        const members = layers.filter((l) => l.group === group.id);
        if (members.length === 0) return null;
        return (
          <fieldset key={group.id} className="space-y-1">
            <legend className="mb-2 text-[12px] leading-[18px] font-semibold text-muted-foreground">
              {group.label}
            </legend>
            {members.map((layer) => (
              <LayerRow
                key={layer.id}
                layer={layer}
                sources={sources}
                checked={activeLayers.includes(layer.id)}
                onToggle={(on) => onToggleLayer(layer.id, on)}
              />
            ))}
          </fieldset>
        );
      })}

      <label
        htmlFor="layer-warnings"
        className="bp-row flex cursor-pointer items-start gap-3 rounded-lg border border-dashed px-2 py-2"
      >
        <Checkbox
          id="layer-warnings"
          className="mt-0.5"
          checked={showWarnings}
          onCheckedChange={(checked) => onToggleWarnings(checked === true)}
        />
        <span className="space-y-0.5">
          <span className="block text-[14px] leading-[21px] font-semibold">Live NWS warnings</span>
          <span className="block text-[12px] leading-[18px] text-muted-foreground">
            Shown on the map, never part of the score
          </span>
        </span>
      </label>

      {hazardLegend ? (
        hazardLegend
      ) : mode === "fleet" ? (
        <SequentialLegend
          title={`Share of summer peak a ${Math.round(fleetShare * 100)}% Base fleet could supply for 2 h`}
          colors={FLEET_COLORS}
          labels={["< 0.5%", "0.5–1%", "1–2%", "2–5%", "5%+"]}
          note="Grey: peak demand not known. Change the fleet size in a utility's panel."
        />
      ) : (
        <>
          <ScoreLegend />
          {activeLayers.includes("price_spikes") ? (
            <p className="text-[11px] leading-tight text-muted-foreground">
              Price spikes apply only inside ERCOT, so counties and utilities outside it are compared with each other.
            </p>
          ) : null}
        </>
      )}
      {floodCounties.length > 0 ? <FloodZoneLegend /> : null}
    </section>
  );
}

function LayerRow({
  layer,
  sources,
  checked,
  onToggle,
}: {
  layer: MapLayerMeta;
  sources: SourceRef[];
  checked: boolean;
  onToggle: (on: boolean) => void;
}) {
  const id = `layer-${layer.id}`;
  return (
    <div
      className={cn(
        "bp-row flex items-start gap-3 rounded-lg px-2 py-1.5",
        !layer.available && "opacity-60",
      )}
    >
      <Checkbox
        id={id}
        className="mt-0.5"
        disabled={!layer.available}
        checked={checked}
        onCheckedChange={(value) => onToggle(value === true)}
      />
      <label htmlFor={id} className={cn("min-w-0 flex-1 space-y-0.5", layer.available && "cursor-pointer")}>
        <span className="block text-[14px] leading-[21px] font-semibold">{layer.label}</span>
        <span className="block text-[12px] leading-[18px] text-muted-foreground">
          {layer.available ? layer.unit : "Coming in this release"}
        </span>
      </label>
      <EvidencePopover meta={layer} sources={sources} />
    </div>
  );
}

export function ScoreLegend() {
  const levels = [1, 2, 3, 4, 5] as Level[];
  return (
    <div className="space-y-2">
      <p className="text-[12px] leading-[18px] font-semibold text-muted-foreground">Stress level</p>
      <ol className="grid grid-cols-5 gap-1">
        {levels.map((level) => (
          <li key={level} className="space-y-1">
            <span
              className="block h-3 rounded-sm ring-1 ring-black/10"
              style={{ backgroundColor: LEVEL_COLORS[level] }}
              aria-hidden
            />
            <span className="block text-[11px] leading-tight text-muted-foreground">
              {level} {LEVEL_LABELS[level]}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function LevelChip({ level, className }: { level: Level | null; className?: string }) {
  if (level == null) {
    return (
      <span
        className={cn(
          "rounded-full border bg-white px-2.5 py-0.5 text-[12px] leading-[18px] font-semibold text-muted-foreground",
          className,
        )}
      >
        No data
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-white px-2.5 py-0.5 text-[12px] leading-[18px] font-semibold",
        className,
      )}
    >
      <span
        className="size-2.5 rounded-full ring-1 ring-black/10"
        style={{ backgroundColor: LEVEL_COLORS[level] }}
        aria-hidden
      />
      {level} · {LEVEL_LABELS[level]}
    </span>
  );
}
