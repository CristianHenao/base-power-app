"use client";

import { BatteryCharging } from "lucide-react";
import { cn } from "@/lib/utils";

type BasePowerToggleProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  className?: string;
};

/** Compact light-glass switch for the analysis toolbar (next to close). */
export function BasePowerToggle({
  checked,
  onCheckedChange,
  className,
}: BasePowerToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Show with Base Power"
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "pointer-events-auto relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-full border border-black/10 px-3 text-foreground shadow-[0_6px_18px_rgba(0,0,0,0.1)] transition-opacity hover:opacity-90",
        className,
      )}
    >
      <span aria-hidden className="frost-glass rounded-full" />
      <span
        aria-hidden
        className={cn(
          "frost-wash rounded-full",
          checked && "!bg-amber-400/25",
        )}
      />
      <BatteryCharging
        className={cn(
          "relative z-[1] size-4 shrink-0",
          checked ? "text-amber-700" : "text-foreground/70",
        )}
        aria-hidden
      />
      <span className="relative z-[1] text-sm font-medium whitespace-nowrap">
        Base Power
      </span>
      <span
        aria-hidden
        className={cn(
          "relative z-[1] h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-amber-500" : "bg-black/15",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform",
            checked ? "left-4" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}
