/**
 * Current NWS warnings for Texas (UM-6.2). Source: https://api.weather.gov/alerts/active?area=TX.
 * Keeps actual (not test) alerts whose event is a Warning, drops ones that have ended or
 * expired, and lists one row per Texas county from the alert's SAME codes ("048201" → "48201").
 */

export type LiveWarning = { id: string; fips: string; event: string; expires: string | null };

type NwsFeature = {
  id?: string;
  properties?: {
    id?: string;
    event?: string;
    status?: string;
    expires?: string | null;
    ends?: string | null;
    geocode?: { SAME?: string[] };
  };
};

export function parseNwsAlerts(payload: unknown, now: Date): LiveWarning[] {
  const features = (payload as { features?: NwsFeature[] })?.features;
  if (!Array.isArray(features)) throw new Error("NWS response has no features list.");
  const seen = new Set<string>();
  const out: LiveWarning[] = [];
  for (const feature of features) {
    const p = feature.properties ?? {};
    const id = p.id ?? feature.id;
    if (!id || p.status !== "Actual" || !p.event?.endsWith("Warning")) continue;
    const until = [p.ends, p.expires].filter((t): t is string => Boolean(t)).map((t) => new Date(t).getTime());
    if (until.some((t) => t <= now.getTime())) continue;
    for (const same of p.geocode?.SAME ?? []) {
      if (!/^048\d{3}$/.test(same)) continue;
      const fips = same.slice(1);
      const key = `${id}|${fips}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id, fips, event: p.event, expires: p.expires ?? null });
    }
  }
  return out.sort((a, b) => a.fips.localeCompare(b.fips) || a.id.localeCompare(b.id));
}
