"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { OnboardingDraft } from "@/lib/types/domain";
import {
  draftFromProfile,
  isEmptyOnboardingDraft,
} from "@/lib/onboarding/profile-sync";
import {
  getOnboardingDraftServerSnapshot,
  getOnboardingDraftSnapshot,
  patchOnboardingDraft,
  readOnboardingDraft,
  subscribeOnboardingDraft,
  writeOnboardingDraft,
} from "@/lib/onboarding/storage";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUser, getProfile } from "@/lib/supabase/profile";

type OnboardingContextValue = {
  draft: OnboardingDraft;
  updateDraft: (patch: Partial<OnboardingDraft>) => OnboardingDraft;
  hydrated: boolean;
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

  useEffect(() => {
    let cancelled = false;

    async function hydrateFromProfile() {
      try {
        const supabase = createClient();
        const user = await getCurrentUser(supabase);
        if (!user || cancelled) return;

        const profile = await getProfile(supabase, user.id);
        if (!profile || cancelled) return;

        const remote = draftFromProfile(profile);
        if (isEmptyOnboardingDraft(remote)) return;

        const local = readOnboardingDraft();
        // Prefer server snapshot once onboarding is done, or when local is empty.
        if (profile.onboarding_completed_at || isEmptyOnboardingDraft(local)) {
          writeOnboardingDraft(remote);
        }
      } catch {
        // Stay on local draft if profile hydrate fails.
      }
    }

    void hydrateFromProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ draft, updateDraft, hydrated: true }),
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
