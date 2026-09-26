"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { HomeOutageEvent } from "@/lib/risk/synthetic-outages";
import { WEATHER_HAZARD_META } from "@/lib/risk/synthetic-weather";
import { cn } from "@/lib/utils";

/** Spacing between major event ticks (px) */
const STEP_PX = 72;
/** Horizontal drag sensitivity */
const DRAG_PX_PER_PX = 1;
/** Minor ticks between each major stop */
const MINOR_PER_STEP = 3;

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

function indexFromOffset(offsetPx: number, length: number) {
  if (length <= 1) return 0;
  return clampIndex(Math.round(-offsetPx / STEP_PX), length);
}

function offsetForIndex(index: number) {
  return -index * STEP_PX;
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
  const [offset, setOffset] = useState(() => offsetForIndex(safeIndex));
  const [dragging, setDragging] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startOffset: number;
  } | null>(null);
  const lastEmittedIndex = useRef(safeIndex);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  useEffect(() => {
    if (dragging) return;
    setOffset(offsetForIndex(safeIndex));
    lastEmittedIndex.current = safeIndex;
  }, [safeIndex, dragging]);

  if (!events.length) return null;

  const visualIndex = dragging
    ? indexFromOffset(offset, events.length)
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
      startOffset: offsetRef.current,
    };
    setDragging(true);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const nextOffset =
      drag.startOffset + (event.clientX - drag.startX) * DRAG_PX_PER_PX;
    const minOffset = offsetForIndex(events.length - 1);
    const maxOffset = offsetForIndex(0);
    const clamped = Math.max(minOffset, Math.min(maxOffset, nextOffset));
    setOffset(clamped);
    emitIndex(indexFromOffset(clamped, events.length));
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);

    const snapped = indexFromOffset(offsetRef.current, events.length);
    setOffset(offsetForIndex(snapped));
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
        "px-3 pt-3 pb-[max(0.5rem,var(--sab))]",
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
      {/* Soft vignette above the bar */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-16 bottom-0"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.18) 55%, transparent 100%)",
        }}
      />

      {/* Horizontal glass rectangle */}
      <div
        className="relative overflow-hidden rounded-2xl border border-white/40 shadow-[0_10px_28px_rgba(0,0,0,0.22)] touch-none"
        style={{ height: 72 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div aria-hidden className="frost-glass absolute inset-0 rounded-2xl" />
        <div aria-hidden className="frost-wash absolute inset-0 rounded-2xl" />

        {/* Center caret */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1 z-20 -translate-x-1/2"
        >
          <div
            className="h-0 w-0 border-x-[5px] border-x-transparent border-t-[7px]"
            style={{ borderTopColor: accent }}
          />
        </div>

        {/* Center guide line */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-1.5 left-1/2 top-2 z-10 w-px -translate-x-1/2"
          style={{ backgroundColor: accent, opacity: 0.35 }}
        />

        {/* Sliding tick strip — active stop sits under center */}
        <div
          className="absolute inset-y-0 left-1/2 z-10"
          style={{
            transform: `translateX(${offset}px)`,
            transition: dragging
              ? "none"
              : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {events.map((event, index) => {
            const isActive = index === visualIndex;
            const tickColor = event.impactedHome
              ? WEATHER_HAZARD_META[event.causeKind].color
              : "rgba(0,0,0,0.28)";
            const x = index * STEP_PX;

            return (
              <div key={event.id}>
                {index < events.length - 1
                  ? Array.from({ length: MINOR_PER_STEP }, (_, frac) => {
                      const mx = x + (STEP_PX * (frac + 1)) / (MINOR_PER_STEP + 1);
                      return (
                        <span
                          key={`${event.id}-m${frac}`}
                          aria-hidden
                          className="absolute top-3 h-1.5 w-px -translate-x-1/2 bg-black/20"
                          style={{ left: mx }}
                        />
                      );
                    })
                  : null}

                <button
                  type="button"
                  aria-label={event.title}
                  aria-current={isActive ? "true" : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOffset(offsetForIndex(index));
                    emitIndex(index);
                  }}
                  className="absolute top-1.5 flex w-[4.5rem] -translate-x-1/2 flex-col items-center"
                  style={{ left: x }}
                >
                  <span
                    className={cn(
                      "mb-0.5 block w-px rounded-full",
                      isActive ? "h-3.5" : "h-2",
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
            );
          })}
        </div>
      </div>
    </div>
  );
}
