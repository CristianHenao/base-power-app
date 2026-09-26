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
    <section
      aria-label="Map layers"
      className={cn(
        "space-y-4 rounded-2xl border border-border/60 bg-background/90 p-4 shadow-lg backdrop-blur-md",
        className,
      )}
    >
      <div className="space-y-1">
        <h1 className="text-base font-semibold tracking-tight">Utility grid stress</h1>
        <p className="text-xs text-muted-foreground">
          Toggle evidence layers. Each layer is ranked against Texas; the score is their
          average.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Presets</p>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => {
            const active = preset.id === activePresetId;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => onPreset(preset)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {preset.label}
              </button>
            );
          })}
          {activePresetId == null ? (
            <span className="rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground">
              Custom
            </span>
          ) : null}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs font-medium text-muted-foreground">
          Scored layers
        </legend>
        {layers.map((layer) => {
          const id = `layer-${layer.id}`;
          return (
            <label
              key={layer.id}
              htmlFor={id}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1 hover:bg-muted/60"
            >
              <Checkbox
                id={id}
                className="mt-0.5"
                checked={activeLayers.includes(layer.id)}
                onCheckedChange={(checked) => onToggleLayer(layer.id, checked === true)}
              />
              <span className="space-y-0.5">
                <span className="block text-sm leading-none">{layer.label}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">
                  {layer.unit}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <label
        htmlFor="layer-warnings"
        className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-dashed px-2 py-2 hover:bg-muted/60"
      >
        <Checkbox
          id="layer-warnings"
          className="mt-0.5"
          checked={showWarnings}
          onCheckedChange={(checked) => onToggleWarnings(checked === true)}
        />
        <span className="space-y-0.5">
          <span className="block text-sm leading-none">Live NWS warnings</span>
          <span className="block text-[11px] leading-snug text-muted-foreground">
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
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Stress level</p>
      <ol className="grid grid-cols-5 gap-0.5">
        {levels.map((level) => (
          <li key={level} className="space-y-1">
            <span
              className="block h-2.5 rounded-sm ring-1 ring-black/10"
              style={{ backgroundColor: LEVEL_COLORS[level] }}
              aria-hidden
            />
            <span className="block text-[10px] leading-tight text-muted-foreground">
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
      <span className={cn("rounded-full border px-2 py-0.5 text-xs text-muted-foreground", className)}>
        No data
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
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
