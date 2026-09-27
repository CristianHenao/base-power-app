"use client";

import { BatteryCharging } from "lucide-react";
import {
  useEffect,
  useRef,
  type UIEvent,
} from "react";
import { FrostPanel } from "@/components/risk/frost-panel";
import { drawWatts, type HomeDevice } from "@/lib/home/devices";
import { outageLoadDevices } from "@/lib/home/outage-simulation";
import { KWH_PER_CORE } from "@/lib/report/core-runtime";
import {
  formatDurationHours,
  type HomeOutageEvent,
} from "@/lib/risk/synthetic-outages";
import { WEATHER_HAZARD_META } from "@/lib/risk/synthetic-weather";
import { cn } from "@/lib/utils";

type OutageEventCardsProps = {
  events: HomeOutageEvent[];
  activeIndex: number;
  onChange: (index: number) => void;
  /** Lights up the “With battery” indicator (Base Power toggle) */
  showBasePower?: boolean;
  /** Full-width appliance breakdown for the active card */
  capacityFocused?: boolean;
  /** Scanned My Home devices. Loads only; panels and generators are not draws. */
  devices?: HomeDevice[];
  /** Zoom to home and show Base Power capacity for this outage */
  onViewBatteryCapacity?: (index: number) => void;
  /** Leave focused capacity view and restore the card carousel */
  onExitBatteryCapacity?: () => void;
  className?: string;
};

function clampIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, index));
}

function applianceShareOfCore(watts: number, durationHours: number) {
  const kwhUsed = (watts / 1000) * durationHours;
  const pct = (kwhUsed / KWH_PER_CORE) * 100;
  return { kwhUsed, pct };
}

export function OutageEventCards({
  events,
  activeIndex,
  onChange,
  showBasePower = false,
  capacityFocused = false,
  devices = [],
  onViewBatteryCapacity,
  onExitBatteryCapacity,
  className,
}: OutageEventCardsProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const safeIndex = clampIndex(activeIndex, events.length);
  const suppressScrollEmit = useRef(false);
  const focused = capacityFocused;
  const loads = outageLoadDevices(devices);

  useEffect(() => {
    if (focused) return;
    const card = cardRefs.current[safeIndex];
    if (!card) return;
    suppressScrollEmit.current = true;
    card.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
    const timer = window.setTimeout(() => {
      suppressScrollEmit.current = false;
    }, 320);
    return () => window.clearTimeout(timer);
  }, [safeIndex, events.length, focused]);

  if (!events.length) return null;

  function onScroll(event: UIEvent<HTMLDivElement>) {
    if (focused || suppressScrollEmit.current) return;
    const scroller = event.currentTarget;
    const center = scroller.scrollLeft + scroller.clientWidth / 2;
    let nearest = 0;
    let nearestDist = Number.POSITIVE_INFINITY;

    cardRefs.current.forEach((card, index) => {
      if (!card) return;
      const mid = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(mid - center);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = index;
      }
    });

    if (nearest !== safeIndex) onChange(nearest);
  }

  const visibleEvents = focused
    ? events
        .map((event, index) => ({ event, index }))
        .filter(({ index }) => index === safeIndex)
    : events.map((event, index) => ({ event, index }));

  return (
    <div
      className={cn(
        "pointer-events-auto relative w-full pb-[max(0.5rem,var(--sab))]",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-12 bottom-0"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.16) 55%, transparent 100%)",
        }}
      />

      <div
        ref={scrollerRef}
        role="listbox"
        aria-label="Weather outage events"
        aria-activedescendant={events[safeIndex]?.id}
        onScroll={onScroll}
        className={cn(
          "relative flex pb-1 pt-2 transition-[padding] duration-300",
          focused
            ? "gap-0 overflow-hidden px-4 sm:px-6"
            : "snap-x snap-mandatory gap-3 overflow-x-auto px-[10%] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {visibleEvents.map(({ event, index }) => {
          const active = index === safeIndex;
          const meta = WEATHER_HAZARD_META[event.causeKind];
          const showingCapacity = active && focused;
          const batteryOn = showBasePower;
          const hasDuration =
            Number.isFinite(event.durationHours) && event.durationHours > 0;
          const showOutageStats = event.impactedHome || hasDuration;

          return (
            <div
              key={event.id}
              id={event.id}
              ref={(node) => {
                cardRefs.current[index] = node;
              }}
              role="option"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => {
                if (!focused) onChange(index);
              }}
              onKeyDown={(e) => {
                if (focused) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onChange(index);
                }
              }}
              className={cn(
                "shrink-0 text-left transition-[width,max-width,transform,opacity] duration-300 ease-out",
                focused
                  ? "w-full max-w-none cursor-default scale-100 opacity-100"
                  : cn(
                      "w-[80%] max-w-sm snap-center cursor-pointer",
                      active
                        ? "scale-100 opacity-100"
                        : "scale-[0.96] opacity-80",
                    ),
              )}
            >
              <FrostPanel className="w-full overflow-hidden">
                <div className="space-y-2.5 px-3.5 py-3">
                  <span className="inline-flex items-center rounded-md bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-medium leading-none text-foreground/70 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
                    {meta.label}
                  </span>

                  {showOutageStats ? (
                    showingCapacity ? (
                      <div className="space-y-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-snug">
                            {event.title}
                          </p>
                          <p className="mt-0.5 text-sm leading-snug text-foreground">
                            Home loads on backup
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Scanned in My Home · 1 Core · {KWH_PER_CORE} kWh
                            (estimate)
                          </p>
                        </div>

                        {loads.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Scan devices in My Home to see what they use on a
                            Core.
                          </p>
                        ) : (
                          <ul className="max-h-[min(50vh,22rem)] space-y-1.5 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {loads.map((device) => {
                              const draw = drawWatts(device);
                              const { kwhUsed, pct } = applianceShareOfCore(
                                draw.watts,
                                event.durationHours,
                              );
                              return (
                                <li
                                  key={device.id}
                                  className="flex items-center justify-between gap-2 rounded-lg bg-black/[0.04] px-2.5 py-1.5"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-medium text-foreground">
                                      {device.name}
                                    </p>
                                    <p className="text-[10px] tabular-nums text-muted-foreground">
                                      {draw.watts > 0
                                        ? `${draw.watts} W${draw.exact ? "" : " est."}`
                                        : "Watts unknown"}
                                    </p>
                                  </div>
                                  {draw.watts > 0 ? (
                                    <div className="shrink-0 text-right">
                                      <p className="text-xs font-semibold tabular-nums text-amber-800">
                                        {pct < 0.1
                                          ? "<0.1"
                                          : pct.toFixed(pct < 10 ? 1 : 0)}
                                        %
                                      </p>
                                      <p className="text-[10px] tabular-nums text-muted-foreground">
                                        {kwhUsed < 0.01
                                          ? "<0.01"
                                          : kwhUsed.toFixed(2)}{" "}
                                        kWh
                                      </p>
                                    </div>
                                  ) : (
                                    <p className="shrink-0 text-xs text-muted-foreground">
                                      —
                                    </p>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-snug">
                            {event.title}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {event.impactedHome ? (
                              <>
                                County homes lost power for{" "}
                                <strong className="font-semibold text-foreground">
                                  {formatDurationHours(event.durationHours)}
                                </strong>
                                .
                              </>
                            ) : (
                              <>
                                Homes in your county were out for{" "}
                                <strong className="font-semibold text-foreground">
                                  {formatDurationHours(event.durationHours)}
                                </strong>
                                .
                              </>
                            )}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="rounded-lg bg-red-500/15 px-2.5 py-1.5">
                            <p className="text-sm font-semibold tabular-nums text-red-700">
                              {formatDurationHours(event.durationHours)}
                            </p>
                            <p className="text-[10px] text-red-700/70">
                              Total outage
                            </p>
                          </div>
                          <div
                            className={cn(
                              "rounded-lg px-2.5 py-1.5 transition-colors",
                              batteryOn
                                ? "bg-amber-400/25"
                                : "bg-black/[0.03]",
                            )}
                          >
                            <p
                              className={cn(
                                "text-sm font-semibold tabular-nums",
                                batteryOn
                                  ? "text-amber-800"
                                  : "text-muted-foreground/50",
                              )}
                            >
                              {batteryOn ? "100% uptime" : "—"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Base Power up time
                            </p>
                          </div>
                        </div>
                      </>
                    )
                  ) : (
                    <div>
                      <p className="text-sm font-semibold">{event.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Nearby feeders were hit, but your home stayed on the
                        grid.
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (showingCapacity) {
                        onExitBatteryCapacity?.();
                        return;
                      }
                      onChange(index);
                      onViewBatteryCapacity?.(index);
                    }}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      showingCapacity
                        ? "bg-amber-500 text-amber-950 hover:bg-amber-400"
                        : "bg-foreground text-background hover:bg-foreground/90",
                    )}
                  >
                    <BatteryCharging className="size-4 shrink-0" aria-hidden />
                    {showingCapacity
                      ? "Back to outages"
                      : "View battery capacity"}
                  </button>
                </div>
              </FrostPanel>
            </div>
          );
        })}
      </div>
    </div>
  );
}
