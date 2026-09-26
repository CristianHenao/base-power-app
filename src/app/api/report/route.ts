import { API_URL, TIMEOUT_MS, unavailable } from "./upstream";

/** Forward a report request to the Python API. The address is passed through, never logged. */
export async function POST(request: Request) {
  let body: string;
  try {
    body = JSON.stringify(await request.json());
  } catch {
    return Response.json({ detail: "Invalid JSON body." }, { status: 400 });
  }
  try {
    const upstream = await fetch(`${API_URL}/v1/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return unavailable();
  }
}
