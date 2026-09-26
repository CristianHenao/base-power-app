"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trackEvent } from "@/lib/report/client";
import type { Event, Report, Source } from "@/lib/report/types";
import { cn } from "@/lib/utils";
import { BackupChart } from "./backup-chart";
import { HouseholdGapCard } from "./household-gap-card";
import { band, centralDate, centralTime, hours, percent } from "./format";

const OFFER_TEXT: Record<Report["base_offer"]["product"], string> = {
  energy_plus_backup: "Base sells power and installs Cores here.",
  energy_only: "Base sells power plans here; Cores are not offered in this area yet.",
  backup_program: "Cores come through the local utility's backup program here.",
  none: "Base does not list an offer for this utility yet.",
};

const SOURCE_NAMES: Record<string, string> = {
  eaglei: "Outage history",
  ercot_profiles: "Home load",
  base_offer: "Base offer",
  census: "Address",
  nws: "Weather alerts",
  ercot_live: "Grid now",
  llm: "Summary",
};

function SourceChips({ sources }: { sources: Source[] }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Data sources">
      {sources.map((s) => (
        <li key={s.id}>
          <Badge
            variant={s.status === "ok" ? "outline" : s.status === "degraded" ? "destructive" : "secondary"}
            title={s.as_of ? `as of ${s.as_of}` : undefined}
          >
            {SOURCE_NAMES[s.id] ?? s.id}: {s.status === "ok" ? "live" : s.status.replace("_", " ")}
            {s.fallback ? ` (${s.fallback})` : ""}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function StormRow({ event, report }: { event: Event; report: Report }) {
  const covered = event.covered;
  return (
    <li className="border-b py-3 last:border-0">
      <details onToggle={(e) => (e.currentTarget.open ? trackEvent("replay_opened", report) : undefined)}>
        <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium">{event.label}</span>
          <span className="text-sm text-muted-foreground">
            {centralDate(event.start)}
            {event.peak_out_pct != null ? ` · ${Math.round(event.peak_out_pct)}% of homes out at peak` : ` · ${event.peak_out.toLocaleString()} homes out at peak`}
          </span>
        </summary>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div><dt className="text-muted-foreground">Half of homes back within</dt><dd>{band(event.duration_h.p50)}</dd></div>
          <div><dt className="text-muted-foreground">90% of homes back within</dt><dd>{band(event.duration_h.p90)}</dd></div>
          <div><dt className="text-muted-foreground">One Core that week</dt><dd>{hours(event.backup_h?.cores_1)}</dd></div>
          <div><dt className="text-muted-foreground">Two Cores that week</dt><dd>{hours(event.backup_h?.cores_2)}</dd></div>
          {covered && (
            <div className="col-span-2 sm:col-span-4">
              <dt className="text-muted-foreground">Homes fully covered</dt>
              <dd>One Core {percent(covered.cores_1.homes)} · two Cores {percent(covered.cores_2.homes)}</dd>
            </div>
          )}
        </dl>
        {!covered && (
          <p className="mt-2 text-xs text-muted-foreground">Storm-by-storm coverage is modeled for the demo homes so far.</p>
        )}
      </details>
    </li>
  );
}

export function ReportView({ report, narrative }: { report: Report; narrative: { headline: string; text: string; done: boolean; status: string | null } }) {
  const { location, outlook, sizing, live } = report;
  return (
    <div className="space-y-6">
      <section aria-live="polite">
        <p className="text-sm text-muted-foreground">
          Homes in {location.county} County · {report.home.label} · {location.utility.name ?? "utility unknown"}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">
          {narrative.headline || `${outlook.label} outlook for long outages in ${location.county} County`}
        </h1>
        <p className={cn("mt-3 leading-relaxed", !narrative.text && "text-muted-foreground")}>
          {narrative.text || "Writing a plain-language summary from these numbers..."}
        </p>
        {narrative.done && narrative.status === "template" && (
          <p className="mt-1 text-xs text-muted-foreground">Summary from our template; the language model was unavailable.</p>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardDescription>Long outages (12 hours or more) for a typical home in the county</CardDescription>
          <CardTitle className="flex items-center gap-3 text-xl">
            {outlook.label}
            <Badge variant="secondary">about once every {Math.round(outlook.once_every_years)} years</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {outlook.long_outages_per_year.toFixed(2)} a year (90% range {outlook.interval_90[0].toFixed(2)}-
          {outlook.interval_90[1].toFixed(2)}) from {Math.round(outlook.years_of_data)} years of county records since {outlook.since}. Estimate.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>The storms that hit here</CardTitle>
          <CardDescription>Largest outages since {outlook.since}, replayed against a Base Core on that week’s household load</CardDescription>
        </CardHeader>
        <CardContent>
          <ul>{report.events.map((e) => <StormRow key={e.id} event={e} report={report} />)}</ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Same Core, different month</CardTitle>
          <CardDescription>How long backup lasts depends on the season</CardDescription>
        </CardHeader>
        <CardContent><BackupChart backup={report.backup} /></CardContent>
      </Card>

      {report.household_gap && <HouseholdGapCard gap={report.household_gap} county={location.county} />}

      <Card>
        <CardHeader>
          <CardTitle>{sizing.cores ? `${sizing.cores === 1 ? "One Core" : `${sizing.cores} Cores`} fit this home` : "How many Cores?"}</CardTitle>
          <CardDescription>{sizing.reason}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{OFFER_TEXT[report.base_offer.product]}</p>
          {report.base_offer.url && (
            <a href={report.base_offer.url} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("cta_clicked", report)}
              className="inline-block font-medium underline underline-offset-4">
              See Base’s plans for this area
            </a>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Right now</CardTitle>
          <CardDescription>Texas grid and weather alerts for this address</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {live.grid ? (
            <p>
              ERCOT: <span className="font-medium">{live.grid.note ?? live.grid.status}</span> Reserves{" "}
              {Math.round(live.grid.reserves_mw).toLocaleString()} MW
              {live.grid.price_mwh != null && `, ${location.load_zone} price $${live.grid.price_mwh.toFixed(0)}/MWh`}
              {` · ${centralTime(live.grid.as_of)}`}
              {live.grid.stale && " (stale)"}
            </p>
          ) : (
            <p className="text-muted-foreground">Grid conditions are unavailable right now.</p>
          )}
          {live.alerts.length > 0 ? (
            <ul className="list-disc pl-5">{live.alerts.map((a, i) => <li key={i}>{a.headline ?? a.event}</li>)}</ul>
          ) : (
            <p className="text-muted-foreground">No active weather alerts reported for this address.</p>
          )}
        </CardContent>
      </Card>

      <SourceChips sources={report.sources} />
      <p className="text-xs text-muted-foreground">
        Outage data is county-level, so these numbers describe homes in {location.county} County, not one address. Every number is an estimate from public data.
      </p>
    </div>
  );
}
