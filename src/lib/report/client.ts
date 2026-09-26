/**
 * Browser client for the Porchlight report. Calls the same-origin Next routes under
 * /api/report, which forward to the Python API (PORCHLIGHT_API_URL on the server).
 */
import type { Narrative, Report, ReportRequest } from "./types";

export class ReportError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function readError(response: Response): Promise<ReportError> {
  let detail = `Report request failed (${response.status}).`;
  try {
    const body = (await response.json()) as { detail?: unknown; error?: unknown };
    const message = body.detail ?? body.error;
    if (typeof message === "string") detail = message;
  } catch {
    // Non-JSON error body; keep the status message.
  }
  return new ReportError(detail, response.status);
}

export async function createReport(request: ReportRequest, signal?: AbortSignal): Promise<Report> {
  const response = await fetch("/api/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) throw await readError(response);
  return (await response.json()) as Report;
}

export async function fetchNarrative(reportId: string, signal?: AbortSignal): Promise<Narrative> {
  const response = await fetch(`/api/report/${encodeURIComponent(reportId)}/narrative`, { signal });
  if (!response.ok) throw await readError(response);
  return (await response.json()) as Narrative;
}

export interface NarrativeHandlers {
  onHeadline?: (text: string) => void;
  onToken?: (text: string) => void;
  onDone?: (status: Narrative["status"], factIds: string[]) => void;
  onError?: () => void;
}

/** Stream the validated narrative word by word. Returns a function that closes the stream. */
export function streamNarrative(reportId: string, handlers: NarrativeHandlers): () => void {
  const source = new EventSource(`/api/report/${encodeURIComponent(reportId)}/narrative?stream=1`);
  source.addEventListener("headline", (e) => handlers.onHeadline?.(JSON.parse((e as MessageEvent).data).text));
  source.addEventListener("token", (e) => handlers.onToken?.(JSON.parse((e as MessageEvent).data).text));
  source.addEventListener("done", (e) => {
    const data = JSON.parse((e as MessageEvent).data) as { status: Narrative["status"]; fact_ids: string[] };
    handlers.onDone?.(data.status, data.fact_ids);
    source.close();
  });
  source.onerror = () => {
    handlers.onError?.();
    source.close();
  };
  return () => source.close();
}
