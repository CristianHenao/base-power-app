"use client";

import { useEffect, useRef, useState } from "react";
import { ReportView } from "@/components/report/report-view";
import { createReport, ReportError, streamNarrative } from "@/lib/report/client";
import type { Heat, Report } from "@/lib/report/types";

type NarrativeState = { headline: string; text: string; done: boolean; status: string | null };
const EMPTY_NARRATIVE: NarrativeState = { headline: "", text: "", done: false, status: null };

/** A report for one ZIP, with no account and no address form. */
export function EmbedReport({ zip, heat }: { zip: string; heat: Heat }) {
  return <EmbedReportBody key={`${zip}:${heat}`} zip={zip} heat={heat} />;
}

function EmbedReportBody({ zip, heat }: { zip: string; heat: Heat }) {
  const [report, setReport] = useState<Report | null>(null);
  const [narrative, setNarrative] = useState<NarrativeState>(EMPTY_NARRATIVE);
  const [error, setError] = useState<string | null>(null);
  const closeStream = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!/^\d{5}$/.test(zip)) return;
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const next = await createReport({ zip, heat }, controller.signal);
        if (cancelled) return;
        setReport(next);
        if (next.narrative.status !== "pending" && next.narrative.summary) {
          setNarrative({
            headline: next.narrative.headline ?? "",
            text: next.narrative.summary,
            done: true,
            status: next.narrative.status,
          });
          return;
        }
        closeStream.current = streamNarrative(next.report_id, {
          onHeadline: (headline) => setNarrative((n) => ({ ...n, headline })),
          onToken: (token) => setNarrative((n) => ({ ...n, text: n.text + token })),
          onDone: (status) => setNarrative((n) => ({ ...n, done: true, status })),
          onError: () => setNarrative((n) => ({ ...n, done: true })),
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ReportError ? err.message : "Something went wrong. Try again.");
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      closeStream.current?.();
    };
  }, [zip, heat]);

  if (!/^\d{5}$/.test(zip)) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a Texas ZIP, for example <a className="underline" href="/embed?zip=77084">/embed?zip=77084</a>.
        Gas heat is the default; add <span className="font-medium">heat=electric</span> for electric heat.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        ZIP {zip} · {heat === "electric" ? "electric heat" : "gas heat"} ·{" "}
        <a className="underline" href="/report">Open the full report</a>
      </p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!report && !error && <p className="text-sm text-muted-foreground">Building the report...</p>}
      {report && <ReportView report={report} narrative={narrative} />}
    </div>
  );
}
