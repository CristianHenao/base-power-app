import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SiteHeaderProps = {
  children?: ReactNode;
  className?: string;
  homeHref?: string;
};

export function SiteHeader({
  children,
  className,
  homeHref = "/",
}: SiteHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md",
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
