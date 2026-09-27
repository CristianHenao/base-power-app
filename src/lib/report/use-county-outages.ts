"use client";

/**
 * The county's real outage history for the outlook map timeline: the largest outages from the Porchlight
 * report for the onboarding address, in the card shape the dashboard already uses. Until the report
 * arrives (or if it cannot), the caller's fallback events are shown.
 */
import { useEffect, useState } from "react";
import type { HomeOutageEvent } from "@/lib/risk/synthetic-outages";
import { createReport } from "./client";
import { reportToTimeline } from "./timeline";

export { reportToTimeline } from "./timeline";

/** Real county events for `addressLine`; `fallback` while loading, without an address, or on failure. */
export function useCountyOutages(addressLine: string, fallback: HomeOutageEvent[]): {
  events: HomeOutageEvent[];
  source: "report" | "fallback";
} {
  const [state, setState] = useState<{ key: string; events: HomeOutageEvent[] } | null>(null);
  useEffect(() => {
    if (addressLine.trim().length < 5) return;
    const controller = new AbortController();
    createReport({ address: addressLine }, controller.signal)
      .then((report) => setState({ key: addressLine, events: reportToTimeline(report) }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [addressLine]);
  if (state && state.key === addressLine && state.events.length > 0) return { events: state.events, source: "report" };
  return { events: fallback, source: "fallback" };
}
