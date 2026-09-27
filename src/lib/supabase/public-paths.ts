/** Paths a signed-out visitor can open. The map and onboarding stay behind sign-in. */
const PUBLIC_PREFIXES = [
  "/sign-up",
  "/sign-in",
  "/auth",
  "/~offline",
  "/manifest.webmanifest",
  "/api/map",
  "/report",
  "/embed",
  "/api/report",
  "/api/events",
];

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
