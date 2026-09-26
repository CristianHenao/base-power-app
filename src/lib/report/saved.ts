/**
 * Saved reports for the three demo homes, built by `python -m pipeline.reports`. The deployed
 * web app has no Python API behind it, so /api/report falls back to these when the API is
 * unreachable, and says so in the report's sources. Server-side only.
 */
import collin from "../../../data/processed/reports/48085.json";
import harris from "../../../data/processed/reports/48201.json";
import travis from "../../../data/processed/reports/48453.json";
import type { Report, ReportRequest } from "./types";

const BY_COUNTY: Record<string, unknown> = { "48085": collin, "48201": harris, "48453": travis };
/** The demo personas' ZIPs (data/reference/personas.yaml). */
const PERSONA_ZIP: Record<string, string> = { "75025": "48085", "77084": "48201", "78745": "48453" };
const TEXAS_ZIP = /\b(7[5-9]\d{3})(?:-\d{4})?\b/g;

function countyFor(request: ReportRequest): string | null {
  if (request.county_fips && BY_COUNTY[request.county_fips]) return request.county_fips;
  const zips = [request.zip, ...(request.address?.match(TEXAS_ZIP) ?? [])].filter(Boolean) as string[];
  for (const zip of zips.reverse()) {
    const fips = PERSONA_ZIP[zip.slice(0, 5)];
    if (fips) return fips;
  }
  return null;
}

/** A saved demo report for this request, marked as saved, or null when none applies. */
export function savedReport(request: ReportRequest): Report | null {
  const fips = countyFor(request);
  if (!fips) return null;
  const report = structuredClone(BY_COUNTY[fips]) as Report;
  report.report_id = `saved_${fips}`;
  report.sources = [...report.sources, { id: "live_api", status: "unavailable", as_of: null, fallback: "saved report" }];
  return report;
}
