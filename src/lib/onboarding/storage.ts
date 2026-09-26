import type { Address, OnboardingDraft } from "@/lib/types/domain";

const STORAGE_KEY = "base-power.onboarding.v1";

export const EMPTY_ONBOARDING_DRAFT: OnboardingDraft = {
  address: {},
  household: {},
  goals: {},
};

type Cache = {
  raw: string | null;
  draft: OnboardingDraft;
};

let cache: Cache = {
  raw: null,
  draft: EMPTY_ONBOARDING_DRAFT,
};

const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

function parseDraft(raw: string | null): OnboardingDraft {
  if (!raw) return EMPTY_ONBOARDING_DRAFT;
  try {
    const parsed = JSON.parse(raw) as OnboardingDraft;
    return {
      address: parsed.address ?? {},
      household: parsed.household ?? {},
      goals: parsed.goals ?? {},
    };
  } catch {
    return EMPTY_ONBOARDING_DRAFT;
  }
}

export function subscribeOnboardingDraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getOnboardingDraftSnapshot(): OnboardingDraft {
  if (typeof window === "undefined") return EMPTY_ONBOARDING_DRAFT;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cache.raw) return cache.draft;
  cache = { raw, draft: parseDraft(raw) };
  return cache.draft;
}

export function getOnboardingDraftServerSnapshot(): OnboardingDraft {
  return EMPTY_ONBOARDING_DRAFT;
}

export function readOnboardingDraft(): OnboardingDraft {
  return getOnboardingDraftSnapshot();
}

export function writeOnboardingDraft(draft: OnboardingDraft): void {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(draft);
  window.localStorage.setItem(STORAGE_KEY, raw);
  cache = { raw, draft };
  emitChange();
}

export function patchOnboardingDraft(
  patch: Partial<OnboardingDraft>,
): OnboardingDraft {
  const current = readOnboardingDraft();
  const merged: OnboardingDraft = {
    address: { ...current.address, ...patch.address },
    household: { ...current.household, ...patch.household },
    goals: {
      ...current.goals,
      ...patch.goals,
      secondaryGoals:
        patch.goals?.secondaryGoals ?? current.goals.secondaryGoals,
    },
  };
  writeOnboardingDraft(merged);
  return merged;
}

export function clearOnboardingDraft(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  cache = { raw: null, draft: EMPTY_ONBOARDING_DRAFT };
  emitChange();
}

export function formatAddressLine(address: Partial<Address>): string {
  const street = [address.line1, address.line2].filter(Boolean).join(", ");
  const locality = [address.city, address.state].filter(Boolean).join(", ");
  const zip = address.postalCode ? ` ${address.postalCode}` : "";
  return [street, `${locality}${zip}`.trim()].filter(Boolean).join(", ");
}

export function hasHomeCoordinates(
  address: Partial<Address> | undefined,
): address is Partial<Address> & { latitude: number; longitude: number } {
  return (
    typeof address?.latitude === "number" &&
    typeof address?.longitude === "number" &&
    Number.isFinite(address.latitude) &&
    Number.isFinite(address.longitude)
  );
}
