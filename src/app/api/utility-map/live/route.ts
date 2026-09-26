import { parseNwsAlerts, type LiveWarning } from "@/lib/utility-map/live";

// Current NWS warnings for the utility map. Polled by the page every 60 s; cached here for
// 60 s so the NWS API sees one request a minute per server, not one per viewer.
const NWS_URL = "https://api.weather.gov/alerts/active?area=TX";
const TTL_MS = 60_000;

type LiveResponse = {
  status: "ok" | "unavailable";
  fetched_at: string;
  alerts: LiveWarning[];
};

let cache: { at: number; body: LiveResponse } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return Response.json(cache.body);
  try {
    const response = await fetch(NWS_URL, {
      headers: {
        // NWS requires a User-Agent that identifies the app and a contact.
        "User-Agent": "(Porchlight utility map, https://github.com/CristianHenao/base-power-app)",
        Accept: "application/geo+json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`NWS responded ${response.status}`);
    const body: LiveResponse = {
      status: "ok",
      fetched_at: new Date().toISOString(),
      alerts: parseNwsAlerts(await response.json(), new Date()),
    };
    cache = { at: now, body };
    return Response.json(body);
  } catch {
    // Never an empty all-clear on failure: the page shows "Live warnings unavailable".
    return Response.json({ status: "unavailable", fetched_at: new Date().toISOString(), alerts: [] });
  }
}
