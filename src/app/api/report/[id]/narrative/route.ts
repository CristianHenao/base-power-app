import { API_URL, TIMEOUT_MS, unavailable } from "../../upstream";

/** The validated narrative: JSON by default, server-sent events with ?stream=1. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stream = new URL(request.url).searchParams.get("stream") === "1";
  const path = stream ? "narrative" : "narrative.json";
  try {
    const upstream = await fetch(`${API_URL}/v1/report/${encodeURIComponent(id)}/${path}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-cache",
      },
    });
  } catch {
    return unavailable();
  }
}
