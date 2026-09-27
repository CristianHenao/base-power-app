"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { UserAvatarLink } from "@/components/auth/user-avatar-link";
import { ReportNavLink } from "@/components/report/report-nav-link";
import { SiteHeader } from "@/components/layout/site-header";
import { useAppScene } from "@/components/layout/use-app-scene";
import { isPlanningPath, POST_ONBOARDING_PATH } from "@/lib/onboarding/profile-sync";
import { cn } from "@/lib/utils";

export function ConsumerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMapExperience = isPlanningPath(pathname);
  const homeHref = pathname.startsWith("/report") ? "/report" : POST_ONBOARDING_PATH;
  useAppScene(isMapExperience ? "map" : "light");

  if (isMapExperience) {
    return (
      <div className="app-shell-map">
        <SiteHeader homeHref={homeHref} overlay>
          <div className="flex items-center gap-3">
            <ReportNavLink />
            <UserAvatarLink />
          </div>
        </SiteHeader>
        <div className="absolute inset-0 min-h-0">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <SiteHeader homeHref={homeHref}>
        <div className="flex items-center gap-3">
          <ReportNavLink active={pathname.startsWith("/report")} />
          <UserAvatarLink />
        </div>
      </SiteHeader>
      <div
        className={cn(
          "mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8",
          "pb-[max(2rem,var(--sab))]",
        )}
      >
        {children}
      </div>
    </div>
  );
}
