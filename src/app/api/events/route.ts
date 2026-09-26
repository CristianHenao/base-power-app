import { API_URL, unavailable } from "../report/upstream";

/** Forward a funnel event (report_viewed, replay_opened, cta_clicked) to the Python API. */
export async function POST(request: Request) {
  let body: string;
  try {
    body = JSON.stringify(await request.json());
  } catch {
    return Response.json({ detail: "Invalid JSON body." }, { status: 400 });
  }
  try {
    const upstream = await fetch(`${API_URL}/v1/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
    });
    return new Response(upstream.body, { status: upstream.status, headers: { "content-type": "application/json" } });
  } catch {
    return unavailable();
  }
}
