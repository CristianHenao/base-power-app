"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ConsumerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMapExperience = pathname.startsWith("/risk");

  return (
    <div
      className={cn(
        "flex flex-1 flex-col",
        isMapExperience ? "relative h-dvh overflow-hidden" : "min-h-full",
      )}
    >
      <SiteHeader
        className={cn(
          isMapExperience &&
            "absolute inset-x-0 top-0 z-50 border-transparent bg-background/70 shadow-sm backdrop-blur-md",
        )}
      >
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Homeowner</Badge>
          <Link
            href="/risk"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Risk analysis
          </Link>
        </div>
      </SiteHeader>

      {isMapExperience ? (
        <div className="absolute inset-0 min-h-0 flex-1">{children}</div>
      ) : (
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8">
          {children}
        </div>
      )}
    </div>
  );
}
