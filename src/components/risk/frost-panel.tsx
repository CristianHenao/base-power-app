import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type FrostPanelProps = {
  children: ReactNode;
  className?: string;
  /** Extra classes for the gradient wash layer */
  washClassName?: string;
};

/**
 * Frosted glass shell. Outer node stays free of backdrop-filter so iOS Liquid
 * Glass status/toolbar sampling is not polluted by fixed overlays.
 */
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
      <div aria-hidden className="frost-glass rounded-[inherit]" />
      <div
        aria-hidden
        className={cn("frost-wash rounded-[inherit]", washClassName)}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

type FrostControlProps = ButtonHTMLAttributes<HTMLButtonElement>;

/** Round control — glass lives on a child, not the interactive button itself. */
export function FrostControl({
  children,
  className,
  type = "button",
  ...props
}: FrostControlProps) {
  return (
    <button
      type={type}
      className={cn(
        "relative inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-opacity hover:opacity-90",
        className,
      )}
      {...props}
    >
      <span aria-hidden className="frost-glass rounded-full" />
      <span aria-hidden className="frost-wash rounded-full !bg-black/55" />
      <span className="relative z-[1]">{children}</span>
    </button>
  );
}
