import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isOnboardingComplete,
  isOnboardingPath,
  isPlanningPath,
  ONBOARDING_START_PATH,
  POST_ONBOARDING_PATH,
  resolvePostAuthPath,
} from "@/lib/onboarding/profile-sync";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  hasSupabaseConfig,
} from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";
import { isPublicPath } from "@/lib/supabase/public-paths";

function isAuthEntryPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/sign-in" || pathname === "/sign-up";
}

export async function updateSession(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([key, value]) => {
            supabaseResponse.headers.set(key, value);
          });
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;
  const userId = typeof user?.sub === "string" ? user.sub : null;
  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", userId)
      .maybeSingle();

    const complete = isOnboardingComplete(profile);

    if (isAuthEntryPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = resolvePostAuthPath(profile, POST_ONBOARDING_PATH);
      return NextResponse.redirect(url);
    }

    if (!complete && isPlanningPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = ONBOARDING_START_PATH;
      return NextResponse.redirect(url);
    }

    if (complete && isOnboardingPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = POST_ONBOARDING_PATH;
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
