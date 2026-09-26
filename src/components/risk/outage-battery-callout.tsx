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
  /** When true, emphasize battery-backed outcome */
  showBasePower?: boolean;
  className?: string;
};

export function OutageBatteryCallout({
  event,
  showBasePower = false,
  className,
}: OutageBatteryCalloutProps) {
  if (!event.impactedHome) {
    return (
      <FrostPanel className={cn("pointer-events-auto w-full max-w-xs", className)}>
        <div className="px-3.5 py-3">
          <p className="text-sm font-semibold">Neighborhood event</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nearby feeders were hit, but your home stayed on the grid.
          </p>
        </div>
      </FrostPanel>
    );
  }

  return (
    <FrostPanel className={cn("pointer-events-auto w-full max-w-xs", className)}>
      <div className="space-y-2.5 px-3.5 py-3">
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg transition-shadow",
              showBasePower
                ? "bg-amber-400 text-amber-950 shadow-[0_0_20px_rgba(251,191,36,0.45)]"
                : "bg-black/5 text-foreground/70",
            )}
          >
            <Lightbulb className="size-3.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug">{event.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {showBasePower ? (
                <>
                  Block dark{" "}
                  <strong className="font-semibold text-foreground">
                    {formatDurationHours(event.durationHours)}
                  </strong>
                  — backup kept you lit.
                </>
              ) : (
                <>
                  County homes lost power for{" "}
                  <strong className="font-semibold text-foreground">
                    {formatDurationHours(event.durationHours)}
                  </strong>
                  .
                </>
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-lg bg-red-500/15 px-2.5 py-1.5">
            <p className="text-sm font-semibold tabular-nums text-red-700">
              {formatDurationHours(event.durationHours)}
            </p>
            <p className="text-[10px] text-red-700/70">
              Grid outage
            </p>
          </div>
          <div
            className={cn(
              "rounded-lg px-2.5 py-1.5 transition-colors",
              showBasePower ? "bg-amber-400/25" : "bg-black/[0.03]",
            )}
          >
            <p
              className={cn(
                "text-sm font-semibold tabular-nums",
                showBasePower ? "text-amber-800" : "text-muted-foreground/50",
              )}
            >
              {showBasePower ? "100% uptime" : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              With battery
            </p>
          </div>
        </div>
      </div>
    </FrostPanel>
  );
}
