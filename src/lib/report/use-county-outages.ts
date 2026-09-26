"use client";

/**
 * The county's real outage history for the /risk timeline: the largest outages from the Porchlight
 * report for the onboarding address, in the card shape the dashboard already uses. Until the report
 * arrives (or if it cannot), the caller's fallback events are shown.
 */
import { useEffect, useState } from "react";
import type { HomeOutageEvent } from "@/lib/risk/synthetic-outages";
import type { WeatherHazardKind } from "@/lib/risk/synthetic-weather";
import { createReport } from "./client";
import type { Event, Report } from "./types";

const WINTER = /winter|ice|\buri\b|mara|snow|freeze|cold/i;

function causeOf(event: Event): WeatherHazardKind {
  return WINTER.test(event.storm ?? event.label) ? "snow" : "storm";
}

/** Hours until 90% of homes were back, upper bound of the band. */
function ninetyPercentHours(event: Event): number {
  const values = event.duration_h.p90.filter((v): v is number => v != null);
  return values.length ? Math.max(...values) : 0;
}

export function reportToTimeline(report: Report): HomeOutageEvent[] {
  const county = report.location.county;
  return [...report.events]
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .map((event) => {
      const hours = ninetyPercentHours(event);
      const started = new Date(event.start);
      const share = event.peak_out_pct != null ? `${Math.round(event.peak_out_pct)}% of homes` : `${event.peak_out.toLocaleString()} homes`;
      return {
        id: event.id,
        hazardId: event.id,
        causeKind: causeOf(event),
        title: event.label,
        detail: `${county} County: ${share} out at peak; 90% back within about ${Math.round(hours)} hours. Homes in the county, not this address.`,
        startedAt: started,
        endedAt: new Date(started.getTime() + hours * 3_600_000),
        durationHours: Number(hours.toFixed(1)),
        status: "restored",
        impactedHome: false,
        homesAffected: event.peak_out,
        scope: "county",
      };
    });
}

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
