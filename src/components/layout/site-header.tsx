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
        "z-40 border-b bg-background/80 backdrop-blur-md",
        "pt-[env(safe-area-inset-top)]",
        overlay
          ? "absolute inset-x-0 top-0 border-transparent bg-background/70 shadow-sm"
          : "sticky top-0",
        className,
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
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
