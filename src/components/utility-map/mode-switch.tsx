"use client";

import { useRef, type KeyboardEvent } from "react";
import { MODES, type ModeId } from "@/lib/utility-map/controls";
import { cn } from "@/lib/utils";

/** Risk / Hazards / Grid / Base fleet. Arrow keys move between modes. */
export function ModeSwitch({
  mode,
  onChange,
  className,
}: {
  mode: ModeId;
  onChange: (mode: ModeId) => void;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = MODES.findIndex((m) => m.id === mode);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = (index + step + MODES.length) % MODES.length;
    onChange(MODES[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label="Map mode"
      onKeyDown={onKeyDown}
      className={cn("grid grid-cols-4 gap-1 rounded-full bg-[var(--bp-grey-5)] p-1", className)}
    >
      {MODES.map((m, i) => {
        const on = m.id === mode;
        return (
          <button
            key={m.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={m.hint}
            onClick={() => onChange(m.id)}
            className={cn(
              "rounded-full px-2 py-1.5 text-[13px] leading-[18px] font-semibold transition-colors",
              on
                ? "bg-white text-[var(--bp-grey-100)] shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
                : "text-muted-foreground hover:text-[var(--bp-grey-100)]",
            )}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
