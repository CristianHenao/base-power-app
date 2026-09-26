import type { Profile } from "@/lib/supabase/database.types";
import type {
  Address,
  BackupGoal,
  HomeType,
  HouseholdDetails,
  OnboardingDraft,
  OnboardingGoals,
} from "@/lib/types/domain";

export const ONBOARDING_START_PATH = "/onboarding/address";
export const POST_ONBOARDING_PATH = "/risk";

export function isOnboardingComplete(
  profile: Pick<Profile, "onboarding_completed_at"> | null | undefined,
): boolean {
  return Boolean(profile?.onboarding_completed_at);
}

export function isOnboardingPath(pathname: string): boolean {
  return pathname === "/onboarding" || pathname.startsWith("/onboarding/");
}

/**
 * Where to send a signed-in user after auth or when hitting entry routes.
 * Incomplete → onboarding; complete → preferred (default /risk).
 */
export function resolvePostAuthPath(
  profile: Pick<Profile, "onboarding_completed_at"> | null | undefined,
  preferred = POST_ONBOARDING_PATH,
): string {
  if (!isOnboardingComplete(profile)) {
    return ONBOARDING_START_PATH;
  }
  if (!preferred.startsWith("/") || isOnboardingPath(preferred)) {
    return POST_ONBOARDING_PATH;
  }
  return preferred;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function asBoolean(value: unknown): boolean | null | undefined {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  return undefined;
}

function asHomeType(value: unknown): HomeType | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const allowed: HomeType[] = [
    "single_family",
    "townhouse",
    "condo",
    "apartment",
    "mobile",
    "other",
  ];
  return allowed.includes(value as HomeType) ? (value as HomeType) : undefined;
}

function asBackupGoal(value: unknown): BackupGoal | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const allowed: BackupGoal[] = [
    "outage_resilience",
    "bill_savings",
    "ev_charging",
    "whole_home_backup",
    "essentials_only",
    "explore_options",
  ];
  return allowed.includes(value as BackupGoal)
    ? (value as BackupGoal)
    : undefined;
}

function parseAddress(value: unknown): Partial<Address> {
  const raw = asRecord(value);
  if (!raw) return {};
  return {
    line1: asString(raw.line1),
    line2: asString(raw.line2),
    city: asString(raw.city),
    state: asString(raw.state),
    postalCode: asString(raw.postalCode),
    country: asString(raw.country),
    latitude: asNumber(raw.latitude) ?? undefined,
    longitude: asNumber(raw.longitude) ?? undefined,
  };
}

function parseHousehold(value: unknown): Partial<HouseholdDetails> {
  const raw = asRecord(value);
  if (!raw) return {};
  return {
    homeType: asHomeType(raw.homeType),
    squareFootage: asNumber(raw.squareFootage),
    occupants: asNumber(raw.occupants),
    ownsHome: asBoolean(raw.ownsHome),
    hasSolar: asBoolean(raw.hasSolar),
    hasExistingBattery: asBoolean(raw.hasExistingBattery),
    averageMonthlyBillUsd: asNumber(raw.averageMonthlyBillUsd),
  };
}

function parseGoals(value: unknown): Partial<OnboardingGoals> {
  const raw = asRecord(value);
  if (!raw) return {};
  const secondary = Array.isArray(raw.secondaryGoals)
    ? raw.secondaryGoals
        .map((goal) => asBackupGoal(goal))
        .filter((goal): goal is BackupGoal => Boolean(goal))
    : undefined;
  return {
    primaryGoal: asBackupGoal(raw.primaryGoal),
    secondaryGoals: secondary,
    notes: asString(raw.notes),
  };
}

export function draftFromProfile(
  profile: Pick<Profile, "address" | "household" | "goals"> | null | undefined,
): OnboardingDraft {
  if (!profile) {
    return { address: {}, household: {}, goals: {} };
  }
  return {
    address: parseAddress(profile.address),
    household: parseHousehold(profile.household),
    goals: parseGoals(profile.goals),
  };
}

export function isEmptyOnboardingDraft(draft: OnboardingDraft): boolean {
  return (
    Object.keys(draft.address).length === 0 &&
    Object.keys(draft.household).length === 0 &&
    Object.keys(draft.goals).length === 0
  );
}

export function onboardingPatchFromDraft(draft: OnboardingDraft) {
  return {
    address: draft.address as Profile["address"],
    household: draft.household as Profile["household"],
    goals: draft.goals as Profile["goals"],
  };
}
