"use client";

import { Lightbulb } from "lucide-react";
import {
  useEffect,
  useRef,
  type UIEvent,
} from "react";
import { FrostPanel } from "@/components/risk/frost-panel";
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
  showBasePower?: boolean;
  className?: string;
};

function clampIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, index));
}

function shortWhen(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function statusLabel(event: HomeOutageEvent) {
  if (event.status === "forecast") return "Forecast";
  if (event.status === "active") return "Active";
  return "Restored";
}

export function OutageEventCards({
  events,
  activeIndex,
  onChange,
  showBasePower = false,
  className,
}: OutageEventCardsProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const safeIndex = clampIndex(activeIndex, events.length);
  const suppressScrollEmit = useRef(false);

  useEffect(() => {
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
  }, [safeIndex, events.length]);

  if (!events.length) return null;

  function onScroll(event: UIEvent<HTMLDivElement>) {
    if (suppressScrollEmit.current) return;
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
        className="relative flex snap-x snap-mandatory gap-3 overflow-x-auto px-[10%] pb-1 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {events.map((event, index) => {
          const active = index === safeIndex;
          const meta = WEATHER_HAZARD_META[event.causeKind];

          return (
            <button
              key={event.id}
              id={event.id}
              ref={(node) => {
                cardRefs.current[index] = node;
              }}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onChange(index)}
              className={cn(
                "w-[80%] max-w-sm shrink-0 snap-center text-left transition-[transform,opacity] duration-200",
                active ? "scale-100 opacity-100" : "scale-[0.96] opacity-80",
              )}
            >
              <FrostPanel className="w-full overflow-hidden">
                <div className="space-y-2.5 px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center rounded-md bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-medium leading-none text-foreground/70 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
                      {meta.label}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {shortWhen(event.startedAt)} · {statusLabel(event)}
                    </span>
                  </div>

                  {event.impactedHome ? (
                    <>
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
                          <p className="text-sm font-medium leading-snug">
                            {event.title}
                          </p>
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
                            showBasePower
                              ? "bg-amber-400/25"
                              : "bg-black/[0.03]",
                          )}
                        >
                          <p
                            className={cn(
                              "text-sm font-semibold tabular-nums",
                              showBasePower
                                ? "text-amber-800"
                                : "text-muted-foreground/50",
                            )}
                          >
                            {showBasePower ? "100% uptime" : "—"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            With battery
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div>
                      <p className="text-sm font-semibold">{event.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Nearby feeders were hit, but your home stayed on the
                        grid.
                      </p>
                    </div>
                  )}
                </div>
              </FrostPanel>
            </button>
          );
        })}
      </div>
    </div>
  );
}
