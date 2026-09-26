"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { BivariateLegend, FloodZoneLegend, SequentialLegend, SizeLegend } from "@/components/utility-map/legend";
import { BIVARIATE_COLORS } from "@/lib/utility-map/hazard-style";
import type { ViewDescription } from "@/lib/utility-map/describe-view";
import { cn } from "@/lib/utils";

/** What the map shows right now, in one sentence, with its legend. Sits on the map, never below the menu. */
export function MapKey({
  described,
  showFlood,
  showPlants,
  defaultOpen = true,
  className,
}: {
  described: ViewDescription;
  showFlood: boolean;
  showPlants: boolean;
  defaultOpen?: boolean;
  className?: string;
}) {
  const { caption, legend } = described;
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section aria-label="Map key" aria-live="polite" className={cn("bp-panel space-y-3 p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-[12px] leading-[18px] font-semibold text-muted-foreground">Showing</p>
          <p className="text-[16px] leading-[22px] font-semibold">{caption.title}</p>
          {open ? <p className="text-[12px] leading-[18px] text-muted-foreground">{caption.qualifier}</p> : null}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? "Hide legend" : "Show legend"}
          onClick={() => setOpen(!open)}
          className="rounded-full p-1 text-muted-foreground hover:bg-[var(--bp-grey-5)]"
        >
          <ChevronDown className={cn("size-4 transition-transform", !open && "rotate-180")} aria-hidden />
        </button>
      </div>
      {open ? (
        <>
          {legend.kind === "sequential" ? (
            <SequentialLegend
              title={legend.title}
              colors={legend.colors}
              labels={legend.labels}
              note={legend.note}
              extra={legend.extra}
            />
          ) : legend.kind === "bivariate" ? (
            <BivariateLegend colors={BIVARIATE_COLORS} first={legend.first} second={legend.second} />
          ) : (
            <p className="rounded-xl border border-dashed px-3 py-2 text-[12px] leading-[18px] text-muted-foreground">
              {legend.message}
            </p>
          )}
          {showPlants ? (
            <SizeLegend
              title="Power plants (net summer MW, EIA-860 2024)"
              stops={[
                { label: "100", radius: 4 },
                { label: "1,000", radius: 8 },
                { label: "5,000", radius: 14 },
              ]}
            />
          ) : null}
          {showFlood ? <FloodZoneLegend /> : null}
        </>
      ) : null}
    </section>
  );
}
