/**
 * Map a /v1/report into the HomeOutageEvent shape used by the outlook timeline cards.
 * County-level only: never claims this address lost power.
 */
import type { HomeOutageEvent } from "@/lib/risk/synthetic-outages";
import type { WeatherHazardKind } from "@/lib/risk/synthetic-weather";
import { centralRange } from "../../components/report/format.ts";
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
      const share =
        event.peak_out_pct != null
          ? `${Math.round(event.peak_out_pct)}% of homes`
          : `${event.peak_out.toLocaleString()} homes`;
      return {
        id: event.id,
        hazardId: event.id,
        causeKind: causeOf(event),
        title: event.label,
        detail: `${centralRange(event.start, event.end)}. ${county} County: ${share} out at peak; 90% back within about ${Math.round(hours)} hours. Homes in the county, not this address.`,
        startedAt: started,
        endedAt: new Date(event.end),
        durationHours: Number(hours.toFixed(1)),
        status: "restored",
        impactedHome: false,
        homesAffected: event.peak_out,
        scope: "county",
      };
    });
}
