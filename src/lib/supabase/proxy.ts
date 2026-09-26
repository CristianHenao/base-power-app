import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  hasSupabaseConfig,
} from "@/lib/supabase/env";

const PUBLIC_PREFIXES = [
  "/",
  "/sign-up",
  "/sign-in",
  "/auth",
  "/~offline",
  "/manifest.webmanifest",
  "/api/map",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => prefix !== "/" && pathname.startsWith(prefix),
  );
}

function isAuthEntryPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/sign-in" || pathname === "/sign-up";
}

export async function updateSession(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
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
  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthEntryPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/risk";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
