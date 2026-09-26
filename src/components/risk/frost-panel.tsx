import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FrostPanelProps = {
  children: ReactNode;
  className?: string;
  /** Extra classes for the gradient wash layer */
  washClassName?: string;
};

/** Shared frosted glass shell used across risk map overlays. */
export function FrostPanel({
  children,
  className,
  washClassName,
}: FrostPanelProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.35)]",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 backdrop-blur-xl backdrop-saturate-150"
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/40",
          washClassName,
        )}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

export const frostControlClassName =
  "border-white/15 bg-black/55 text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl backdrop-saturate-150 hover:bg-black/70";
