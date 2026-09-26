"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
  LEVEL_COLORS,
  LEVEL_LABELS,
  type Level,
} from "@/lib/utility-map/scoring";
import type { LayerId, MapLayerMeta, Preset } from "@/lib/utility-map/types";
import { cn } from "@/lib/utils";

type ControlsPanelProps = {
  layers: MapLayerMeta[];
  presets: Preset[];
  activeLayers: LayerId[];
  activePresetId: string | null;
  showWarnings: boolean;
  onPreset: (preset: Preset) => void;
  onToggleLayer: (id: LayerId, on: boolean) => void;
  onToggleWarnings: (on: boolean) => void;
  className?: string;
};

export function ControlsPanel({
  layers,
  presets,
  activeLayers,
  activePresetId,
  showWarnings,
  onPreset,
  onToggleLayer,
  onToggleWarnings,
  className,
}: ControlsPanelProps) {
  return (
    <section aria-label="Map layers" className={cn("bp-panel space-y-5 p-5", className)}>
      <div className="space-y-2">
        <p className="bp-eyebrow">Grid stress</p>
        <h1 className="text-[20px] leading-[27px]">Where Texas grids are stressed</h1>
        <p className="text-[14px] leading-[21px] text-muted-foreground">
          Turn evidence layers on or off. Each is ranked against Texas, and the score is
          their average.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-[12px] leading-[18px] font-semibold text-muted-foreground">
          Presets
        </p>
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
      </div>

      <fieldset className="space-y-1">
        <legend className="mb-2 text-[12px] leading-[18px] font-semibold text-muted-foreground">
          Scored layers
        </legend>
        {layers.map((layer) => {
          const id = `layer-${layer.id}`;
          return (
            <label
              key={layer.id}
              htmlFor={id}
              className="bp-row flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5"
            >
              <Checkbox
                id={id}
                className="mt-0.5"
                checked={activeLayers.includes(layer.id)}
                onCheckedChange={(checked) => onToggleLayer(layer.id, checked === true)}
              />
              <span className="space-y-0.5">
                <span className="block text-[14px] leading-[21px] font-semibold">
                  {layer.label}
                </span>
                <span className="block text-[12px] leading-[18px] text-muted-foreground">
                  {layer.unit}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

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
          <span className="block text-[14px] leading-[21px] font-semibold">
            Live NWS warnings
          </span>
          <span className="block text-[12px] leading-[18px] text-muted-foreground">
            Shown on the map, never part of the score
          </span>
        </span>
      </label>

      <ScoreLegend />
    </section>
  );
}

export function ScoreLegend() {
  const levels = [1, 2, 3, 4, 5] as Level[];
  return (
    <div className="space-y-2">
      <p className="text-[12px] leading-[18px] font-semibold text-muted-foreground">
        Stress level
      </p>
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
