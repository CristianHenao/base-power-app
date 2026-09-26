"use client";

import { Lightbulb } from "lucide-react";
import { FrostPanel } from "@/components/risk/frost-panel";
import {
  formatDurationHours,
  type HomeOutageEvent,
} from "@/lib/risk/synthetic-outages";
import { cn } from "@/lib/utils";

type OutageBatteryCalloutProps = {
  event: HomeOutageEvent;
  /** When true, show Base Power uptime and cue the side-home camera */
  showBasePower?: boolean;
  onShowBasePowerChange?: (next: boolean) => void;
  className?: string;
};

export function OutageBatteryCallout({
  event,
  showBasePower = false,
  onShowBasePowerChange,
  className,
}: OutageBatteryCalloutProps) {
  if (!event.impactedHome) {
    return (
      <FrostPanel className={cn("pointer-events-auto w-full max-w-sm", className)}>
        <div className="p-4">
          <p className="text-sm font-semibold text-white">Neighborhood event</p>
          <p className="mt-1 text-xs text-white/65">
            This weather outage affected nearby feeders, but your home stayed on
            the grid.
          </p>
        </div>
      </FrostPanel>
    );
  }

  return (
    <FrostPanel className={cn("pointer-events-auto w-full max-w-sm", className)}>
      <div className="space-y-3 px-4 py-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl transition-shadow",
              showBasePower
                ? "bg-amber-400 text-amber-950 shadow-[0_0_24px_rgba(251,191,36,0.55)]"
                : "bg-white/15 text-white/80",
            )}
          >
            <Lightbulb className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug text-white">
              {event.title}
            </p>
            <p className="mt-1 text-xs text-white/65">
              {showBasePower ? (
                <>
                  Your block went dark for{" "}
                  <strong className="font-semibold text-white">
                    {formatDurationHours(event.durationHours)}
                  </strong>
                  . With Base Power backup, your home stays lit the whole time.
                </>
              ) : (
                <>
                  Homes in your county lost power for{" "}
                  <strong className="font-semibold text-white">
                    {formatDurationHours(event.durationHours)}
                  </strong>
                  . Toggle Base Power to see backup coverage.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/10 px-3 py-2">
            <p className="text-sm font-semibold tabular-nums text-white">
              {formatDurationHours(event.durationHours)}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-white/50">
              Grid outage
            </p>
          </div>
          <div
            className={cn(
              "rounded-xl px-3 py-2 transition-colors",
              showBasePower ? "bg-amber-400/20" : "bg-white/5",
            )}
          >
            <p
              className={cn(
                "text-sm font-semibold tabular-nums",
                showBasePower ? "text-amber-200" : "text-white/35",
              )}
            >
              {showBasePower ? "100% uptime" : "—"}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-white/50">
              With battery
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={showBasePower}
          onClick={() => onShowBasePowerChange?.(!showBasePower)}
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
            showBasePower
              ? "border-amber-400/40 bg-amber-400/15"
              : "border-white/15 bg-white/5 hover:bg-white/10",
          )}
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-white">
              Show with Base Power
            </span>
            <span className="block text-[11px] text-white/55">
              {showBasePower
                ? "Home stays lit — view side for battery"
                : "Compare backup uptime on your home"}
            </span>
          </span>
          <span
            aria-hidden
            className={cn(
              "relative h-6 w-10 shrink-0 rounded-full transition-colors",
              showBasePower ? "bg-amber-400" : "bg-white/25",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
                showBasePower ? "left-4" : "left-0.5",
              )}
            />
          </span>
        </button>
      </div>
    </FrostPanel>
  );
}
