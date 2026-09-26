import type { SupabaseClient, User } from "@supabase/supabase-js";
import { onboardingPatchFromDraft } from "@/lib/onboarding/profile-sync";
import type {
  Database,
  Profile,
  ProfileUpdate,
} from "@/lib/supabase/database.types";
import type { OnboardingDraft } from "@/lib/types/domain";

type Client = SupabaseClient<Database>;

export async function getAccessToken(client: Client): Promise<string | null> {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? null;
}

export async function getCurrentUser(client: Client): Promise<User | null> {
  const { data, error } = await client.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function getProfile(
  client: Client,
  userId: string,
): Promise<Profile | null> {
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertProfile(
  client: Client,
  userId: string,
  patch: ProfileUpdate,
): Promise<Profile> {
  const { data, error } = await client
    .from("profiles")
    .upsert(
      {
        id: userId,
        ...patch,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function ensureProfile(
  client: Client,
  user: User,
  extras?: { fullName?: string },
): Promise<Profile> {
  const existing = await getProfile(client, user.id);
  if (existing) {
    if (extras?.fullName && extras.fullName !== existing.full_name) {
      return upsertProfile(client, user.id, {
        full_name: extras.fullName,
        email: user.email ?? existing.email,
      });
    }
    return existing;
  }

  return upsertProfile(client, user.id, {
    email: user.email ?? null,
    full_name:
      extras?.fullName ||
      (typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : null),
  });
}

/** Persist onboarding answers without marking the flow complete. */
export async function saveOnboardingDraft(
  client: Client,
  userId: string,
  draft: OnboardingDraft,
): Promise<Profile> {
  return upsertProfile(client, userId, onboardingPatchFromDraft(draft));
}

/** Persist full draft and stamp onboarding as complete. */
export async function completeOnboarding(
  client: Client,
  userId: string,
  draft: OnboardingDraft,
): Promise<Profile> {
  return upsertProfile(client, userId, {
    ...onboardingPatchFromDraft(draft),
    onboarding_completed_at: new Date().toISOString(),
  });
}
