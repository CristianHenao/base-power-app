"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { useAppScene } from "@/components/layout/use-app-scene";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AuthShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const onSignUp = pathname.startsWith("/sign-up");
  useAppScene("light");

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <SiteHeader>
        {onSignUp ? (
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Sign in
          </Link>
        ) : (
          <Link href="/sign-up" className={cn(buttonVariants({ size: "sm" }))}>
            Create account
          </Link>
        )}
      </SiteHeader>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 pb-[max(2.5rem,var(--sab))]">
        {children}
      </div>
    </div>
  );
}
