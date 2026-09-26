"use client";

import { type FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatAddressLine,
  getOnboardingDraftServerSnapshot,
  getOnboardingDraftSnapshot,
  subscribeOnboardingDraft,
} from "@/lib/onboarding/storage";
import { createReport, ReportError, streamNarrative, trackEvent } from "@/lib/report/client";
import type { Heat, Report } from "@/lib/report/types";
import { ReportView } from "./report-view";

type NarrativeState = { headline: string; text: string; done: boolean; status: string | null };
const EMPTY_NARRATIVE: NarrativeState = { headline: "", text: "", done: false, status: null };

export function ReportPage() {
  const draft = useSyncExternalStore(subscribeOnboardingDraft, getOnboardingDraftSnapshot,
    getOnboardingDraftServerSnapshot);
  // The onboarding address prefills the field until the user types their own.
  const [typed, setTyped] = useState<string | null>(null);
  const address = typed ?? formatAddressLine(draft.address);
  const [heat, setHeat] = useState<Heat>("gas");
  const [report, setReport] = useState<Report | null>(null);
  const [narrative, setNarrative] = useState<NarrativeState>(EMPTY_NARRATIVE);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const closeStream = useRef<(() => void) | null>(null);

  useEffect(() => () => closeStream.current?.(), []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (address.trim().length < 5) return;
    closeStream.current?.();
    setLoading(true);
    setError(null);
    setReport(null);
    setNarrative(EMPTY_NARRATIVE);
    try {
      const next = await createReport({ address: address.trim(), heat });
      setReport(next);
      trackEvent("report_viewed", next);
      if (next.narrative.status !== "pending" && next.narrative.summary) {
        // A saved report already carries its validated summary.
        setNarrative({ headline: next.narrative.headline ?? "", text: next.narrative.summary, done: true,
          status: next.narrative.status });
        return;
      }
      closeStream.current = streamNarrative(next.report_id, {
        onHeadline: (headline) => setNarrative((n) => ({ ...n, headline })),
        onToken: (token) => setNarrative((n) => ({ ...n, text: n.text + token })),
        onDone: (status) => setNarrative((n) => ({ ...n, done: true, status })),
        onError: () => setNarrative((n) => ({ ...n, done: true })),
      });
    } catch (err) {
      setError(err instanceof ReportError ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} className="space-y-4" aria-label="Report for an address">
        <div className="space-y-2">
          <Label htmlFor="report-address">Texas address</Label>
          <Input id="report-address" value={address} onChange={(e) => setTyped(e.target.value)}
            placeholder="Street, city, TX ZIP" autoComplete="street-address" required minLength={5} />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">How is the home heated?</legend>
          <div className="flex gap-4 text-sm">
            {(["gas", "electric"] as const).map((h) => (
              <label key={h} className="flex items-center gap-2">
                <input type="radio" name="heat" value={h} checked={heat === h} onChange={() => setHeat(h)} />
                {h === "gas" ? "Gas or other" : "Electric"}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" disabled={loading}>{loading ? "Building your report..." : "Will my lights stay on?"}</Button>
        <p className="text-xs text-muted-foreground">We use the address only to find its county and weather alerts. It is not stored.</p>
      </form>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading && (
        <div className="space-y-4" aria-hidden="true">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}
      {report && <ReportView report={report} narrative={narrative} />}
    </div>
  );
}
