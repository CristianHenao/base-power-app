"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  formatDurationHours,
  type HomeOutageEvent,
} from "@/lib/risk/synthetic-outages";
import { WEATHER_HAZARD_META } from "@/lib/risk/synthetic-weather";
import { cn } from "@/lib/utils";

/** Degrees between major event stops on the dial */
const STEP_DEG = 20;
/** Horizontal drag sensitivity (degrees per pixel) */
const DRAG_DEG_PER_PX = 0.22;

type OutageTimelineSliderProps = {
  events: HomeOutageEvent[];
  activeIndex: number;
  onChange: (index: number) => void;
  className?: string;
};

function clampIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, index));
}

function indexFromRotation(rotationDeg: number, length: number) {
  if (length <= 1) return 0;
  return clampIndex(Math.round(-rotationDeg / STEP_DEG), length);
}

function rotationForIndex(index: number) {
  return -index * STEP_DEG;
}

function shortMonth(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short" });
}

function shortDay(date: Date) {
  return date.toLocaleDateString(undefined, { day: "numeric" });
}

export function OutageTimelineSlider({
  events,
  activeIndex,
  onChange,
  className,
}: OutageTimelineSliderProps) {
  const safeIndex = clampIndex(activeIndex, events.length);
  const [rotation, setRotation] = useState(() => rotationForIndex(safeIndex));
  const [dragging, setDragging] = useState(false);
  const [wheelSize, setWheelSize] = useState(420);
  const shellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startRotation: number;
  } | null>(null);
  const lastEmittedIndex = useRef(safeIndex);
  const rotationRef = useRef(rotation);
  rotationRef.current = rotation;

  useEffect(() => {
    if (dragging) return;
    setRotation(rotationForIndex(safeIndex));
    lastEmittedIndex.current = safeIndex;
  }, [safeIndex, dragging]);

  // Dial diameter tracks full viewport width so the arc runs edge-to-edge.
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;

    const update = () => {
      const width = el.getBoundingClientRect().width;
      setWheelSize(Math.max(320, Math.round(width * 1.08)));
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!events.length) return null;

  const tickRadius = Math.round(wheelSize * 0.4);
  const dialHeight = Math.round(tickRadius * 0.72);
  const visualIndex = dragging
    ? indexFromRotation(rotation, events.length)
    : safeIndex;
  const active = events[safeIndex]!;
  const accent = active.impactedHome
    ? WEATHER_HAZARD_META[active.causeKind].color
    : "#f59e0b";

  function emitIndex(next: number) {
    const clamped = clampIndex(next, events.length);
    if (clamped === lastEmittedIndex.current) return;
    lastEmittedIndex.current = clamped;
    onChange(clamped);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startRotation: rotationRef.current,
    };
    setDragging(true);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const nextRotation =
      drag.startRotation + (event.clientX - drag.startX) * DRAG_DEG_PER_PX;
    const minRot = rotationForIndex(events.length - 1);
    const maxRot = rotationForIndex(0);
    const clamped = Math.max(minRot, Math.min(maxRot, nextRotation));
    setRotation(clamped);
    emitIndex(indexFromRotation(clamped, events.length));
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);

    const snapped = indexFromRotation(rotationRef.current, events.length);
    setRotation(rotationForIndex(snapped));
    emitIndex(snapped);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      ref={shellRef}
      className={cn(
        "pointer-events-auto relative w-full select-none",
        "pt-3 pb-[max(0.5rem,var(--sab))]",
        className,
      )}
      role="slider"
      aria-label="Outage timeline"
      aria-valuemin={0}
      aria-valuemax={events.length - 1}
      aria-valuenow={safeIndex}
      aria-valuetext={active.title}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          emitIndex(safeIndex - 1);
        } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          emitIndex(safeIndex + 1);
        }
      }}
    >
      {/* Bottom-up light Liquid Glass — fades clear toward the map */}
      <div
        aria-hidden
        className="frost-glass"
        style={{
          WebkitMaskImage:
            "linear-gradient(to top, #000 0%, #000 42%, transparent 100%)",
          maskImage:
            "linear-gradient(to top, #000 0%, #000 42%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="frost-wash !bg-gradient-to-t from-white/90 via-white/55 to-transparent"
      />

      <div className="relative mb-1 px-4 text-center">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Outage timeline
        </p>
        <p
          className="truncate text-base font-semibold tabular-nums"
          style={{ color: accent }}
        >
          {shortMonth(active.startedAt)} {shortDay(active.startedAt)} ·{" "}
          {formatDurationHours(active.durationHours)}
        </p>
        <p className="truncate text-xs text-muted-foreground">{active.title}</p>
      </div>

      <div
        className="relative w-full touch-none overflow-hidden"
        style={{ height: dialHeight }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-black/10 bg-white/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
          style={{ width: wheelSize, height: wheelSize }}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1.5 z-20 -translate-x-1/2"
        >
          <div
            className="h-0 w-0 border-x-[6px] border-x-transparent border-t-[9px]"
            style={{ borderTopColor: accent }}
          />
        </div>

        <div
          className="absolute left-1/2 top-3"
          style={{
            width: wheelSize,
            height: wheelSize,
            marginLeft: -wheelSize / 2,
            transform: `rotate(${rotation}deg)`,
            transition: dragging
              ? "none"
              : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {events.map((event, index) => {
            const angle = index * STEP_DEG;
            const isActive = index === visualIndex;
            const tickColor = event.impactedHome
              ? WEATHER_HAZARD_META[event.causeKind].color
              : "rgba(0,0,0,0.28)";

            return (
              <div key={event.id}>
                {index < events.length - 1
                  ? [1, 2, 3].map((frac) => (
                      <div
                        key={`${event.id}-m${frac}`}
                        aria-hidden
                        className="absolute left-1/2 top-1/2 h-0 w-0"
                        style={{
                          transform: `rotate(${angle + (STEP_DEG * frac) / 4}deg)`,
                        }}
                      >
                        <span
                          className="absolute left-0 h-2 w-px -translate-x-1/2 bg-black/20"
                          style={{ top: -tickRadius }}
                        />
                      </div>
                    ))
                  : null}

                <div
                  className="absolute left-1/2 top-1/2 h-0 w-0"
                  style={{ transform: `rotate(${angle}deg)` }}
                >
                  <button
                    type="button"
                    aria-label={event.title}
                    aria-current={isActive ? "true" : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRotation(rotationForIndex(index));
                      emitIndex(index);
                    }}
                    className="absolute left-0 flex w-[4.5rem] -translate-x-1/2 flex-col items-center"
                    style={{ top: -tickRadius - 6 }}
                  >
                    <span
                      className={cn(
                        "mb-1 block w-px rounded-full",
                        isActive ? "h-4" : "h-2.5",
                      )}
                      style={{
                        backgroundColor: isActive ? accent : tickColor,
                        boxShadow: isActive ? `0 0 10px ${accent}` : undefined,
                      }}
                    />
                    <span
                      className={cn(
                        "text-[13px] font-semibold leading-none",
                        isActive ? "text-foreground" : "text-foreground/75",
                      )}
                    >
                      {shortDay(event.startedAt)}
                    </span>
                    <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {shortMonth(event.startedAt)}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
