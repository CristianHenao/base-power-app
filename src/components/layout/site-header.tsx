import Link from "next/link";
import type { ReactNode } from "react";
import { BasePowerLogo } from "@/components/brand/base-power-logo";
import { cn } from "@/lib/utils";

type SiteHeaderProps = {
  children?: ReactNode;
  className?: string;
  homeHref?: string;
  /** When true, header floats over content (map). */
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
        "relative z-40 border-b border-border bg-white text-foreground",
        overlay ? "absolute inset-x-0 top-0" : "sticky top-0",
        className,
      )}
      style={{ paddingTop: "var(--sat)" }}
    >
      <div className="relative mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href={homeHref}
          className="inline-flex items-center text-foreground transition-opacity hover:opacity-80"
          aria-label="Base Power home"
        >
          <BasePowerLogo className="h-8 w-auto sm:h-9" />
        </Link>
        {children}
      </div>
    </header>
  );
}
