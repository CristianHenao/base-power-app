"use client";

import { Box } from "lucide-react";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { HazardPicker } from "@/components/utility-map/hazard-chip";
import { StormList } from "@/components/utility-map/storm-spotlight";
import { FLEET_SHARES, QUESTIONS, type FleetShare, type Question, type ViewState } from "@/lib/utility-map/view";
import type { HazardId, SpotlightStorm } from "@/lib/utility-map/hazard-style";
import { LEVEL_COLORS, LEVEL_LABELS, type Level } from "@/lib/utility-map/scoring";
import type { UtilityMapData } from "@/lib/utility-map/types";
import { cn } from "@/lib/utils";

export type ControlsActions = {
  onQuestion: (question: Question) => void;
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
  stormsStatus: "loading" | "ok" | "failed";
  countyName: (fips: string) => string;
  view3d: boolean;
  showWarnings: boolean;
  warningsStatus: string;
  className?: string;
  /** Pinned to the bottom of the panel, e.g. Methods and sources. */
  footer?: ReactNode;
};

export function ControlsPanel(props: ControlsPanelProps) {
  const { view, className } = props;
  return (
    <section aria-label="Map controls" className={cn("bp-panel flex flex-col space-y-5 p-5", className)}>
      <div className="space-y-3">
        <h1 className="text-[20px] leading-[27px]">What do you want to understand?</h1>
        <QuestionPicker question={view.question} onChange={props.onQuestion} />
      </div>

      {view.question === "risk" ? <RiskControls {...props} /> : null}
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
      {props.footer ? <div className="mt-auto border-t pt-4">{props.footer}</div> : null}
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

function RiskControls({ data, view3d, onView3d }: ControlsPanelProps) {
  return (
    <>
      <div className="space-y-2">
        <button
          type="button"
          aria-pressed={view3d}
          onClick={() => onView3d(!view3d)}
          className={cn(
            "group relative flex w-full items-center gap-4 overflow-hidden rounded-[20px] px-5 py-4 text-left text-white transition-all duration-300",
            "bg-[linear-gradient(120deg,#e8a33c_0%,#d9622b_45%,#7a2e0e_100%)] shadow-[0_8px_20px_rgba(160,60,15,0.35)]",
            "hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(160,60,15,0.45)] active:translate-y-0",
            view3d && "ring-4 ring-[#f3c27a]/70 shadow-[0_0_0_6px_rgba(232,163,60,0.25),0_14px_30px_rgba(160,60,15,0.5)]",
          )}
        >
          {/* A soft light sweeping across the button. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-20deg] bg-white/25 blur-md transition-transform duration-700 group-hover:translate-x-[420%]"
          />
          <span
            className={cn(
              "flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm transition-transform duration-500",
              view3d ? "rotate-[-12deg] scale-110" : "group-hover:rotate-[-8deg]",
            )}
          >
            <Box className="size-8" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[20px] leading-[26px] font-semibold">{view3d ? "Viewing risk in 3D" : "See risk in 3D"}</span>
            <span className="block text-[13px] leading-[18px] text-white/85">
              {view3d ? "Tap to flatten the map" : "Counties rise by their risk band"}
            </span>
          </span>
          <span
            aria-hidden
            className={cn(
              "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300",
              view3d ? "bg-white" : "bg-white/30",
            )}
          >
            <span
              className={cn(
                "absolute top-1 size-5 rounded-full shadow transition-all duration-300",
                view3d ? "left-6 bg-[#7a2e0e]" : "left-1 bg-white",
              )}
            />
          </span>
        </button>
        <p className="text-[12px] leading-[18px] text-muted-foreground">
          3D raises each county by its risk band. A presentation aid, not extra evidence.
        </p>
      </div>
      <div className="space-y-2 text-[13px] leading-[19px]">
        <p>
          One standardized score, 1–100, for every Texas county and utility. Higher means more at risk, against the
          rest of Texas.
        </p>
        <ul className="space-y-1 text-muted-foreground">
          <li>
            <span className="font-semibold text-foreground">Hazard exposure (half):</span> flood, tornadoes, hail and
            wind, hurricanes, winter freeze, extreme heat.
          </li>
          <li>
            <span className="font-semibold text-foreground">Grid stress (half):</span> long outages, price spikes,
            summer peak demand.
          </li>
        </ul>
        <p className="text-[12px] leading-[18px] text-muted-foreground">
          Built from {data.sources.length} public sources. Historical relative risk, not a forecast. Select a utility
          or county for its score card.
        </p>
      </div>
    </>
  );
}

function HazardControls({
  view,
  availableHazards,
  storms,
  stormsStatus,
  countyName,
  onHazard,
  onStorm,
  onPatterns,
}: ControlsPanelProps) {
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
              disabled={tab.id === "storm" && storms.length === 0 && view.hazardSub !== "storm"}
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
        <StormList storms={storms} status={stormsStatus} selected={selected} countyName={countyName} onSelect={onStorm} />
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
