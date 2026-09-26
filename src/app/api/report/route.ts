import { savedReport } from "@/lib/report/saved";
import type { ReportRequest } from "@/lib/report/types";
import { API_URL, TIMEOUT_MS, unavailable } from "./upstream";

/**
 * Forward a report request to the Python API. The address is passed through, never logged.
 * If the API is unreachable (the deployed site has none), the demo homes get their saved report.
 */
export async function POST(request: Request) {
  let parsed: ReportRequest;
  try {
    parsed = (await request.json()) as ReportRequest;
  } catch {
    return Response.json({ detail: "Invalid JSON body." }, { status: 400 });
  }
  const body = JSON.stringify(parsed);
  const fallback = () => {
    const saved = savedReport(parsed);
    return saved ? Response.json(saved) : unavailable();
  };
  try {
    const upstream = await fetch(`${API_URL}/v1/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (upstream.status >= 500) return fallback();
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return fallback();
  }
}
