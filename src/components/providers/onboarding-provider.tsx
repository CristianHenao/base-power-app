"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { OnboardingDraft } from "@/lib/types/domain";
import {
  getOnboardingDraftServerSnapshot,
  getOnboardingDraftSnapshot,
  patchOnboardingDraft,
  subscribeOnboardingDraft,
} from "@/lib/onboarding/storage";

type OnboardingContextValue = {
  draft: OnboardingDraft;
  updateDraft: (patch: Partial<OnboardingDraft>) => OnboardingDraft;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const draft = useSyncExternalStore(
    subscribeOnboardingDraft,
    getOnboardingDraftSnapshot,
    getOnboardingDraftServerSnapshot,
  );

  const updateDraft = useCallback((patch: Partial<OnboardingDraft>) => {
    return patchOnboardingDraft(patch);
  }, []);

  const value = useMemo(
    () => ({ draft, updateDraft }),
    [draft, updateDraft],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within OnboardingProvider.");
  }
  return context;
}
