import { NextResponse } from "next/server";
import { POST_ONBOARDING_PATH, resolvePostAuthPath } from "@/lib/onboarding/profile-sync";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/profile";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? POST_ONBOARDING_PATH;

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      let destination = next.startsWith("/") ? next : POST_ONBOARDING_PATH;
      if (data.user) {
        try {
          const profile = await ensureProfile(supabase, data.user);
          destination = resolvePostAuthPath(profile, destination);
        } catch {
          // Profile trigger may have already created the row.
        }
      }
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_callback`);
}
