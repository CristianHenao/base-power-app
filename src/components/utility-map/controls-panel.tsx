"use client";

import { useRef, type KeyboardEvent } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { EvidencePopover } from "@/components/utility-map/evidence-popover";
import { HazardPicker } from "@/components/utility-map/hazard-chip";
import { StormList } from "@/components/utility-map/storm-spotlight";
import { FLEET_SHARES, QUESTIONS, selectableFactors, type FleetShare, type Question, type ViewState } from "@/lib/utility-map/view";
import type { HazardId, SpotlightStorm } from "@/lib/utility-map/hazard-style";
import { LEVEL_COLORS, LEVEL_LABELS, type Level } from "@/lib/utility-map/scoring";
import type { LayerGroup, LayerId, MapLayerMeta, Preset, SourceRef, UtilityMapData } from "@/lib/utility-map/types";
import { cn } from "@/lib/utils";

const GROUPS: { id: LayerGroup; label: string }[] = [
  { id: "hazard", label: "Hazards" },
  { id: "grid", label: "Grid stress" },
  { id: "exposure", label: "Market size" },
];

export type ControlsActions = {
  onQuestion: (question: Question) => void;
  onScenario: (preset: Preset) => void;
  onFactor: (id: LayerId, on: boolean) => void;
  onHazard: (hazard: HazardId) => void;
  onStorm: (name: string) => void;
  onPatterns: () => void;
  onGrid: (layer: "demand" | "plants", on: boolean) => void;
  onShare: (share: FleetShare) => void;
  onView3d: (on: boolean) => void;
  onToggleWarnings: (on: boolean) => void;
};

type ControlsPanelProps = ControlsActions & {
  view: ViewState;
  data: UtilityMapData;
  availableHazards: HazardId[];
  storms: SpotlightStorm[];
  countyName: (fips: string) => string;
  view3d: boolean;
  showWarnings: boolean;
  warningsStatus: string;
  className?: string;
};

export function ControlsPanel(props: ControlsPanelProps) {
  const { view, className } = props;
  return (
    <section aria-label="Map controls" className={cn("bp-panel space-y-5 p-5", className)}>
      <div className="space-y-3">
        <h1 className="text-[20px] leading-[27px]">What do you want to understand?</h1>
        <QuestionPicker question={view.question} onChange={props.onQuestion} />
      </div>

      {view.question === "opportunities" ? <OpportunityControls {...props} /> : null}
      {view.question === "hazards" ? <HazardControls {...props} /> : null}
      {view.question === "grid" ? <GridControls {...props} /> : null}
      {view.question === "fleet" ? <FleetControls {...props} /> : null}

      <label
        htmlFor="layer-warnings"
        className="bp-row flex cursor-pointer items-start gap-3 rounded-lg border border-dashed px-2 py-2"
      >
        <Checkbox
          id="layer-warnings"
          className="mt-0.5"
          checked={props.showWarnings}
          onCheckedChange={(checked) => props.onToggleWarnings(checked === true)}
        />
        <span className="space-y-0.5">
          <span className="block text-[14px] leading-[21px] font-semibold">Live NWS warnings</span>
          <span className="block text-[12px] leading-[18px] text-muted-foreground">
            {props.warningsStatus}. Shown on the map, never part of the analysis.
          </span>
        </span>
      </label>
    </section>
  );
}

/** Four questions as a 2×2 radio group; arrow keys move between them. */
function QuestionPicker({ question, onChange }: { question: Question; onChange: (q: Question) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = QUESTIONS.findIndex((q) => q.id === question);
    const next = (index + step + QUESTIONS.length) % QUESTIONS.length;
    onChange(QUESTIONS[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Question" onKeyDown={onKeyDown} className="grid grid-cols-2 gap-2">
      {QUESTIONS.map((q, i) => {
        const on = q.id === question;
        return (
          <button
            key={q.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(q.id)}
            className={cn(
              "rounded-xl border px-3 py-2 text-left transition-colors",
              on
                ? "border-[var(--bp-grey-100)] bg-[var(--bp-green-20)]"
                : "border-[var(--bp-grey-20)] bg-white hover:border-[var(--bp-grey-60)]",
            )}
          >
            <span className="block text-[14px] leading-[19px] font-semibold">{q.label}</span>
            <span className="block text-[12px] leading-[16px] text-muted-foreground">{q.question}</span>
          </button>
        );
      })}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] leading-[18px] font-semibold text-muted-foreground">{children}</p>;
}

function OpportunityControls({ view, data, onScenario, onFactor, view3d, onView3d }: ControlsPanelProps) {
  const factors = selectableFactors(data.layers);
  const applied = view.factors.map((id) => data.layers.find((l) => l.id === id)).filter((l): l is MapLayerMeta => !!l);
  return (
    <>
      <div className="space-y-2">
        <SectionLabel>Scenario</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {data.presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={preset.id === view.scenario}
              onClick={() => onScenario(preset)}
              className="bp-pill"
            >
              {preset.label}
            </button>
          ))}
          {view.scenario == null ? <span className="bp-pill border-dashed text-muted-foreground">Custom</span> : null}
        </div>
      </div>

      <div className="space-y-1">
        <SectionLabel>Scored on {applied.length} factors, equally weighted</SectionLabel>
        <ul className="space-y-0.5">
          {applied.map((layer) => (
            <li key={layer.id} className="flex items-center justify-between gap-2 text-[14px] leading-[21px]">
              <span className="font-semibold">{layer.label}</span>
              <EvidencePopover meta={layer} sources={data.sources} />
            </li>
          ))}
        </ul>
        <p className="text-[12px] leading-[18px] text-muted-foreground">
          Each factor is a county&apos;s rank against Texas (0 to 100%). The score is their average: a screening aid,
          not an outage forecast.
        </p>
      </div>

      <details className="group space-y-2">
        <summary className="bp-link cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Customize factors</span>
          <span className="hidden group-open:inline">Hide factors</span>
        </summary>
        {GROUPS.map((group) => {
          const members = data.layers.filter((l) => l.group === group.id && factors.includes(l.id));
          if (members.length === 0) return null;
          return (
            <fieldset key={group.id} className="space-y-1 pt-2">
              <legend className="mb-1 text-[12px] leading-[18px] font-semibold text-muted-foreground">{group.label}</legend>
              {members.map((layer) => (
                <LayerRow
                  key={layer.id}
                  layer={layer}
                  sources={data.sources}
                  checked={view.factors.includes(layer.id)}
                  onToggle={(on) => onFactor(layer.id, on)}
                />
              ))}
            </fieldset>
          );
        })}
      </details>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] leading-[18px] text-muted-foreground">
          3D raises each county by its screening level. A presentation aid, not extra evidence.
        </p>
        <button type="button" aria-pressed={view3d} onClick={() => onView3d(!view3d)} className="bp-pill !px-2.5 !py-0.5 !text-[12px]">
          3D
        </button>
      </div>
    </>
  );
}

function HazardControls({ view, availableHazards, storms, countyName, onHazard, onStorm, onPatterns }: ControlsPanelProps) {
  const sub = view.hazardSub;
  const tabs = [
    { id: "patterns", label: "Historical patterns", hint: "Where each hazard runs high, 2000 on" },
    { id: "storm", label: "Past storms", hint: "One storm's outages, 2018 on" },
  ] as const;
  const selected = storms.find((s) => s.name === view.storm) ?? null;
  return (
    <>
      <div role="radiogroup" aria-label="Hazard view" className="grid grid-cols-2 gap-1 rounded-full bg-[var(--bp-grey-5)] p-1">
        {tabs.map((tab) => {
          const on = sub === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="radio"
              aria-checked={on}
              title={tab.hint}
              disabled={tab.id === "storm" && storms.length === 0}
              onClick={() => (tab.id === "patterns" ? onPatterns() : onStorm(view.storm ?? storms[0]?.name))}
              className={cn(
                "rounded-full px-2 py-1.5 text-[13px] leading-[18px] font-semibold transition-colors disabled:opacity-50",
                on ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.15)]" : "text-muted-foreground hover:text-[var(--bp-grey-100)]",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {sub === "patterns" ? (
        <HazardPicker available={availableHazards} picked={view.hazards} onToggle={onHazard} />
      ) : (
        <StormList storms={storms} selected={selected} countyName={countyName} onSelect={onStorm} />
      )}
    </>
  );
}

function GridControls({ view, onGrid }: ControlsPanelProps) {
  const rows = [
    { id: "demand", label: "Demand shading", hint: "Each utility's 2024 summer peak, split across its counties" },
    { id: "plants", label: "Power plants", hint: "Circles sized by net summer MW (EIA-860 2024)" },
  ] as const;
  return (
    <fieldset className="space-y-1">
      <legend className="mb-2 text-[12px] leading-[18px] font-semibold text-muted-foreground">On the map</legend>
      {rows.map((row) => (
        <label key={row.id} htmlFor={`grid-${row.id}`} className="bp-row flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5">
          <Checkbox
            id={`grid-${row.id}`}
            className="mt-0.5"
            checked={view[row.id]}
            onCheckedChange={(value) => onGrid(row.id, value === true)}
          />
          <span className="space-y-0.5">
            <span className="block text-[14px] leading-[21px] font-semibold">{row.label}</span>
            <span className="block text-[12px] leading-[18px] text-muted-foreground">{row.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function FleetControls({ view, data, onShare }: ControlsPanelProps) {
  const b = data.battery;
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <SectionLabel>Adoption: share of eligible homes with one Core</SectionLabel>
        <div className="flex gap-2" role="group" aria-label="Fleet size">
          {FLEET_SHARES.map((value) => (
            <button key={value} type="button" aria-pressed={view.share === value} onClick={() => onShare(value)} className="bp-pill">
              {Math.round(value * 100)}%
            </button>
          ))}
        </div>
      </div>
      <p className="text-[12px] leading-[18px] text-muted-foreground">
        Assumptions: {b.kwh_per_core} kWh and {b.kw_per_core} kW per Core, {Math.round(b.reserve_fraction * 100)}% kept
        for backup, dispatched over {b.dispatch_window_h} hours. Eligible homes are owner-occupied single-family homes.
        Idealized ceilings, not a forecast.
      </p>
    </div>
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
    <div className="bp-row flex items-start gap-3 rounded-lg px-2 py-1.5">
      <Checkbox id={id} className="mt-0.5" checked={checked} onCheckedChange={(value) => onToggle(value === true)} />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer space-y-0.5">
        <span className="block text-[14px] leading-[21px] font-semibold">{layer.label}</span>
        <span className="block text-[12px] leading-[18px] text-muted-foreground">{layer.unit}</span>
      </label>
      <EvidencePopover meta={layer} sources={sources} />
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
      <span className="size-2.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: LEVEL_COLORS[level] }} aria-hidden />
      {level} · {LEVEL_LABELS[level]}
    </span>
  );
}
