import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SiteHeaderProps = {
  children?: ReactNode;
  className?: string;
  homeHref?: string;
  /** When true, header floats over content (map) with a translucent bar. */
  overlay?: boolean;
};

export function SiteHeader({
  children,
  className,
  homeHref = "/",
  overlay = false,
}: SiteHeaderProps) {
  return (
    <header
      className={cn(
        "relative z-40",
        /* Transparent shell — glass/fill live on absolute children for Liquid Glass */
        overlay
          ? "absolute inset-x-0 top-0 text-white"
          : "sticky top-0 border-b border-border/60",
        className,
      )}
      style={{ paddingTop: "var(--sat)" }}
    >
      {overlay ? (
        <>
          <div aria-hidden className="frost-glass" />
          <div
            aria-hidden
            className="frost-wash !bg-gradient-to-b from-black/55 via-black/35 to-transparent"
          />
        </>
      ) : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-background/80 backdrop-blur-md"
        />
      )}

      <div className="relative mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href={homeHref}
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="inline-flex size-7 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
            BP
          </span>
          Base Power
        </Link>
        {children}
      </div>
    </header>
  );
}
