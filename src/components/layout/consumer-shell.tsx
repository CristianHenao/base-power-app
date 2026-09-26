"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { UserAvatarLink } from "@/components/auth/user-avatar-link";
import { SiteHeader } from "@/components/layout/site-header";
import { cn } from "@/lib/utils";

export function ConsumerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMapExperience = pathname.startsWith("/risk");

  if (isMapExperience) {
    return (
      <div className="app-shell-map">
        <SiteHeader homeHref="/risk" overlay>
          <UserAvatarLink />
        </SiteHeader>
        <div className="absolute inset-0 min-h-0">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <SiteHeader homeHref="/risk">
        <UserAvatarLink />
      </SiteHeader>
      <div
        className={cn(
          "mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8",
          "pb-[max(2rem,env(safe-area-inset-bottom))]",
        )}
      >
        {children}
      </div>
    </div>
  );
}
