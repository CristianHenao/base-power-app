"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";
import { OnboardingProvider } from "@/components/providers/onboarding-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      disable={process.env.NODE_ENV === "development"}
      reloadOnOnline={false}
      cacheOnNavigation
    >
      <OnboardingProvider>{children}</OnboardingProvider>
    </SerwistProvider>
  );
}
