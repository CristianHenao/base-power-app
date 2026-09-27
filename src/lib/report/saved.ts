/**
 * Saved reports for the three demo homes, built by `python -m pipeline.reports`. The deployed
 * web app has no Python API behind it, so /api/report falls back to these when the API is
 * unreachable, and says so in the report's sources. Server-side only.
 */
import collin from "../../../data/processed/reports/48085.json" with { type: "json" };
import harris from "../../../data/processed/reports/48201.json" with { type: "json" };
import travis from "../../../data/processed/reports/48453.json" with { type: "json" };
/**
 * Collin / Harris / Travis ZIPs from data/processed/zip_county.csv (Census 2020 ZCTA–county
 * relationship, majority land share per ZIP — see pipeline/zip_county.py). A ZIP that spans
 * counties is included only when that majority county is one of the three demo FIPS; ZIPs whose
 * majority is elsewhere are omitted (never guessed from a secondary share).
 */
import demoZipCounty from "../../../data/processed/reports/demo_zip_county.json" with { type: "json" };
import type { Report, ReportRequest } from "./types";

const BY_COUNTY: Record<string, unknown> = { "48085": collin, "48201": harris, "48453": travis };
const DEMO_ZIP_FIPS = demoZipCounty as Record<string, string>;
const TEXAS_ZIP = /\b(7[5-9]\d{3})(?:-\d{4})?\b/g;

/** County FIPS for a demo ZIP or an explicit demo county_fips; null outside Collin/Harris/Travis. */
export function countyFor(request: ReportRequest): string | null {
  if (request.county_fips && BY_COUNTY[request.county_fips]) return request.county_fips;
  const zips = [request.zip, ...(request.address?.match(TEXAS_ZIP) ?? [])].filter(Boolean) as string[];
  for (const zip of zips.reverse()) {
    const fips = DEMO_ZIP_FIPS[zip.slice(0, 5)];
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
