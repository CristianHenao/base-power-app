import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type FrostPanelProps = {
  children: ReactNode;
  className?: string;
  /** Extra classes for the gradient wash layer */
  washClassName?: string;
};

/**
 * Light Liquid Glass shell. Outer node stays free of backdrop-filter so iOS
 * status/toolbar sampling is not polluted by fixed overlays.
 */
export function FrostPanel({
  children,
  className,
  washClassName,
}: FrostPanelProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-black/8 text-foreground shadow-[0_8px_28px_rgba(0,0,0,0.12)]",
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

/** Round light-glass control — blur lives on a child. */
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
        "relative inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/10 text-foreground shadow-[0_6px_18px_rgba(0,0,0,0.1)] transition-opacity hover:opacity-90",
        className,
      )}
      {...props}
    >
      <span aria-hidden className="frost-glass rounded-full" />
      <span aria-hidden className="frost-wash rounded-full" />
      <span className="relative z-[1]">{children}</span>
    </button>
  );
}
