/** Where the Porchlight Python API lives. Server-side only. */
export const API_URL = (process.env.PORCHLIGHT_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
export const TIMEOUT_MS = 15_000;

export function unavailable(): Response {
  return Response.json(
    { detail: "The report service is not reachable right now. Try again in a moment." },
    { status: 503 },
  );
}
