"use client";

import { ChevronLeft, CloudAlert, Zap } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { LevelChip } from "@/components/utility-map/controls-panel";
import { CountyPicker } from "@/components/utility-map/county-picker";
import { EvidencePopover } from "@/components/utility-map/evidence-popover";
import { FleetCard, GridCard } from "@/components/utility-map/fleet-card";
import { HazardChip } from "@/components/utility-map/hazard-chip";
import { HazardFingerprint } from "@/components/utility-map/hazard-fingerprint";
import { detailHeading, detailLayers, hazardHighlights, overlays, type ViewDescription } from "@/lib/utility-map/describe-view";
import { HAZARD_IDS, type SpotlightStorm } from "@/lib/utility-map/hazard-style";
import { fleetScenario } from "@/lib/utility-map/fleet";
import { formatLayerValue, generationSummary, liveSummary, paintLabel } from "@/lib/utility-map/format";
import {
  RANK_GROUPS,
  offerLabel,
  rankGroup,
  utilityLayerQuality,
  utilityLayerSummary,
  type ScoreModel,
} from "@/lib/utility-map/scoring";
import { pickerOptions } from "@/lib/utility-map/selection";
import type { CountyRecord, LayerId, Quality, UtilityMapData, UtilityRecord } from "@/lib/utility-map/types";
import type { FleetShare, ViewState } from "@/lib/utility-map/view";
import { cn } from "@/lib/utils";

const GROUP_PREVIEW = 8;
const LIST_PREVIEW = 12;

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });

function formatAsOf(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type DetailPanelProps = {
  data: UtilityMapData;
  model: ScoreModel;
  view: ViewState;
  described: ViewDescription;
  storm: SpotlightStorm | null;
  countiesByFips: Map<string, CountyRecord>;
  utilitiesById: Map<string, UtilityRecord>;
  selectedUtility: UtilityRecord | null;
  selectedCounty: CountyRecord | null;
  pickerFips: string | null;
  onShare: (share: FleetShare) => void;
  onSelectUtility: (id: string | null) => void;
  onSelectCounty: (fips: string | null) => void;
  onOpenCounty: (fips: string) => void;
  onClosePicker: () => void;
  className?: string;
};

export function DetailPanel(props: DetailPanelProps) {
  const { selectedUtility, selectedCounty, pickerFips, countiesByFips, utilitiesById, className } = props;
  const pickerCounty = pickerFips ? countiesByFips.get(pickerFips) : undefined;
  return (
    <section aria-label="Details" className={cn("bp-panel flex min-h-0 flex-col overflow-hidden", className)}>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {pickerCounty ? (
          <CountyPicker
            countyName={pickerCounty.name}
            options={pickerOptions(pickerCounty, utilitiesById)}
            onPick={props.onSelectUtility}
            onCancel={props.onClosePicker}
          />
        ) : selectedCounty && selectedUtility ? (
          <CountyView {...props} county={selectedCounty} utility={selectedUtility} />
        ) : selectedUtility ? (
          <UtilityView {...props} utility={selectedUtility} />
        ) : props.view.question === "opportunities" ? (
          <RankedList {...props} />
        ) : (
          <ResultList {...props} />
        )}
      </div>
    </section>
  );
}

function Heading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="space-y-1">
      <h2 className="text-[20px] leading-[27px]">{title}</h2>
      {children ? <p className="text-[14px] leading-[21px] text-muted-foreground">{children}</p> : null}
    </div>
  );
}

/** Find opportunities and hazard patterns: utilities grouped by Base offer, ranked by the view's score. */
function RankedList({ data, model, view, described, onSelectUtility }: DetailPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const patterns = view.question === "hazards";
  const title = patterns ? "Utilities by the selected hazards" : "Where to focus";
  if (described.legend.kind === "empty") {
    return <Heading title={title}>{described.legend.message}</Heading>;
  }
  const sortByScore = (a: UtilityRecord, b: UtilityRecord) =>
    (model.utility.get(b.id)?.score ?? -1) - (model.utility.get(a.id)?.score ?? -1);

  return (
    <div className="space-y-6">
      <Heading title={title}>
        {model.scoredUtilityCount} Texas utilities, ranked within each group by{" "}
        {patterns ? "their average Texas rank across the selected hazards" : "screening score"}. Select one or click
        the map.
      </Heading>

      {RANK_GROUPS.map((group) => {
        const members = data.utilities
          .filter((u) => rankGroup(u, model.utility.get(u.id)?.level ?? null) === group.id)
          .sort(sortByScore);
        const open = expanded.has(group.id);
        const shown = open ? members : members.slice(0, GROUP_PREVIEW);
        return (
          <div key={group.id} className="space-y-2">
            <div>
              <h3 className="text-[16px] leading-[24px]">
                {group.label} <span className="font-medium text-muted-foreground">({members.length})</span>
              </h3>
              <p className="text-[12px] leading-[18px] text-muted-foreground">{group.hint}</p>
            </div>
            {members.length === 0 ? (
              <p className="rounded-2xl border border-dashed px-4 py-3 text-[14px] leading-[21px] text-muted-foreground">
                None in this view.
              </p>
            ) : (
              <>
                <ul className="bp-row-list">
                  {shown.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => onSelectUtility(u.id)}
                        className="bp-row flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] leading-[21px] font-semibold">{u.name}</span>
                          <span className="block text-[12px] leading-[18px] font-medium text-muted-foreground">
                            {offerLabel(u)}
                            {u.eligible_homes != null ? ` · ${number.format(u.eligible_homes)} potential homes` : ""}
                          </span>
                        </span>
                        <LevelChip level={model.utility.get(u.id)?.level ?? null} />
                      </button>
                    </li>
                  ))}
                </ul>
                {members.length > GROUP_PREVIEW ? (
                  <ShowAll open={open} count={members.length} onToggle={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (open) next.delete(group.id);
                      else next.add(group.id);
                      return next;
                    })
                  } />
                ) : null}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ShowAll({ open, count, onToggle }: { open: boolean; count: number; onToggle: () => void }) {
  return (
    <button type="button" className="bp-link" onClick={onToggle}>
      {open ? "Show fewer" : `Show all ${count}`}
    </button>
  );
}

/** Past storm, grid and fleet: the same rows as the table, in the same order. */
function ResultList({ described, countiesByFips, onSelectUtility, onOpenCounty }: DetailPanelProps) {
  const [open, setOpen] = useState(false);
  const { table } = described;
  const shown = open ? table.rows : table.rows.slice(0, LIST_PREVIEW);
  const others = table.columns.map((col, i) => ({ col, i })).filter(({ i }) => i !== table.primary);
  return (
    <div className="space-y-4">
      <Heading title={described.caption.title}>{table.caption}.</Heading>
      {table.rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-3 text-[14px] leading-[21px] text-muted-foreground">
          {described.legend.kind === "empty" ? described.legend.message : "Nothing to list."}
        </p>
      ) : (
        <ul className="bp-row-list">
          {shown.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() =>
                  table.rowKind === "county" && countiesByFips.has(row.id) ? onOpenCounty(row.id) : onSelectUtility(row.id)
                }
                className="bp-row flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] leading-[21px] font-semibold">{row.name}</span>
                  <span className="block text-[12px] leading-[18px] font-medium text-muted-foreground">
                    {others.map(({ col, i }) => `${col}: ${row.cells[i]}`).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[14px] leading-[21px] font-semibold tabular-nums">
                  {row.cells[table.primary]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {table.rows.length > LIST_PREVIEW ? (
        <ShowAll open={open} count={table.rows.length} onToggle={() => setOpen(!open)} />
      ) : null}
    </div>
  );
}

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="bp-link" onClick={onClick}>
      <ChevronLeft className="size-4" aria-hidden />
      {label}
    </button>
  );
}

function RightNow({ data, fips }: { data: UtilityMapData; fips: string[] }) {
  const { live } = data;
  return (
    <div className="bp-info space-y-1.5 p-4">
      <p className="text-[14px] leading-[21px] font-semibold">Right now</p>
      <p className="flex items-start gap-2 text-[14px] leading-[21px]">
        <CloudAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {liveSummary(live, fips)}
      </p>
      {live.status === "ok" && live.ercot ? (
        <p className="flex items-start gap-2 text-[14px] leading-[21px]">
          <Zap className="mt-0.5 size-4 shrink-0" aria-hidden />
          ERCOT conditions: {live.ercot}
        </p>
      ) : null}
      <p className="text-[12px] leading-[18px]">
        {live.status === "ok" && live.as_of ? `As of ${formatAsOf(live.as_of)} CT. ` : ""}
        Not part of the analysis.
      </p>
    </div>
  );
}

type BreakdownRow = { id: LayerId; value: number | null; rank: number | null; quality: Quality };

function Breakdown({
  data,
  title,
  rows,
  weighted,
}: {
  data: UtilityMapData;
  title: string;
  rows: BreakdownRow[];
  weighted: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-3">
      <p className="text-[16px] leading-[24px] font-semibold">{title}</p>
      <ul className="space-y-3">
        {rows.map((row) => {
          const meta = data.layers.find((l) => l.id === row.id);
          if (!meta) return null;
          return (
            <li key={row.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-[14px] leading-[21px]">
                <span className="flex items-center gap-1 font-semibold">
                  {meta.label}
                  <EvidencePopover meta={meta} sources={data.sources} />
                </span>
                <span className="text-right text-muted-foreground">{formatLayerValue(meta, row.value, row.quality)}</span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-[var(--bp-grey-20)]"
                role="img"
                aria-label={`${meta.label}: ${
                  row.rank == null ? "no rank" : `higher than ${Math.round(row.rank * 100)}% of Texas counties`
                }`}
              >
                <div className="h-full rounded-full bg-[var(--bp-green-90)]" style={{ width: `${Math.round((row.rank ?? 0) * 100)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[12px] leading-[18px] text-muted-foreground">
        {weighted
          ? "Bars show a customer-weighted average of its counties' ranks against Texas (0 to 100%)."
          : "Bars show rank against Texas counties (0 to 100%)."}{" "}
        Tap ⓘ for the source and period.
      </p>
    </div>
  );
}

/** A compact "same as the map" chip: the map color and the tooltip's words for this place. */
function ViewChip({ described, level }: { described: ViewDescription; level: number | null }) {
  const color = level == null ? null : described.colors[level - 1];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-0.5 text-[12px] leading-[18px] font-semibold">
      {color ? <span className="size-2.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: color }} aria-hidden /> : null}
      {paintLabel(described.context, level)}
    </span>
  );
}

function LongTerm({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group space-y-3">
      <summary className="bp-link cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Show long-term hazard profile</span>
        <span className="hidden group-open:inline">Hide long-term hazard profile</span>
      </summary>
      {children}
    </details>
  );
}

function StormImpact({ storm, counties, countiesByFips }: {
  storm: SpotlightStorm;
  counties: string[];
  countiesByFips: Map<string, CountyRecord>;
}) {
  const hits = storm.counties.filter((c) => counties.includes(c.fips)).sort((a, b) => b.peak_out_pct - a.peak_out_pct);
  const title = `${storm.name} ${storm.start.slice(0, 4)}`;
  return (
    <div className="space-y-2">
      <p className="text-[16px] leading-[24px] font-semibold">{title}: outages here</p>
      {hits.length === 0 ? (
        <p className="text-[14px] leading-[21px] text-muted-foreground">No outage event labeled with this storm here.</p>
      ) : (
        <ul className="bp-row-list">
          {hits.map((c) => (
            <li key={c.fips} className="flex items-center justify-between gap-2 px-4 py-2.5 text-[14px] leading-[21px]">
              <span className="font-semibold">{countiesByFips.get(c.fips)?.name ?? c.fips} County</span>
              <span className="text-right tabular-nums text-muted-foreground">
                {number.format(c.peak_out_pct)}% out at peak · {number.format(c.peak_out)} customers ·{" "}
                {number.format(c.customer_hours)} customer-h
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[12px] leading-[18px] text-muted-foreground">
        EAGLE-I county records, {storm.start} to {storm.end}. Homes in the county, not any single home.
      </p>
    </div>
  );
}

function UtilityView(props: DetailPanelProps & { utility: UtilityRecord }) {
  const { data, model, view, described, storm, countiesByFips, utility, onShare, onSelectUtility, onSelectCounty } = props;
  const [allCounties, setAllCounties] = useState(false);
  const scored = model.utility.get(utility.id);
  const ranked = view.question === "opportunities";
  const patterns = view.question === "hazards" && view.hazardSub === "patterns";
  const counties = utility.counties
    .map((fips) => countiesByFips.get(fips))
    .filter((c): c is CountyRecord => c != null)
    .map((c) => ({ c, level: described.stateFor(c).level }))
    .sort((a, b) => (b.level ?? -1) - (a.level ?? -1) || a.c.name.localeCompare(b.c.name));
  const shownCounties = allCounties ? counties : counties.slice(0, GROUP_PREVIEW);
  const fleet = fleetScenario(utility, countiesByFips, view.share, data.battery);
  const fleetCard = (
    <FleetCard
      data={data}
      utility={utility}
      fleet={fleet}
      share={view.share}
      onShare={onShare}
      spikeHours={utilityLayerSummary(utility, countiesByFips, "price_spikes").value}
    />
  );
  const fingerprint = (
    <HazardFingerprint
      layers={data.layers}
      ranks={Object.fromEntries(HAZARD_IDS.map((h) => [h, utilityLayerSummary(utility, countiesByFips, h).rank]))}
      values={Object.fromEntries(HAZARD_IDS.map((h) => [h, utilityLayerSummary(utility, countiesByFips, h).value]))}
      quality={Object.fromEntries(HAZARD_IDS.map((h) => [h, utilityLayerQuality(utility, countiesByFips, h)]))}
    />
  );

  return (
    <div className="space-y-6">
      <BackButton label="All utilities" onClick={() => onSelectUtility(null)} />
      <div className="space-y-3">
        <h2 className="text-[30px] leading-[1.2]">{utility.name}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {utility.grids.map((grid) => (
            <Badge key={grid} variant="outline" className="bg-white">
              {grid}
            </Badge>
          ))}
          <Badge variant="secondary">{offerLabel(utility)}</Badge>
        </div>
        {ranked ? (
          <div className="flex flex-wrap items-center gap-2">
            <LevelChip level={scored?.level ?? null} />
            {scored?.rank ? (
              <span className="text-[14px] leading-[21px] text-muted-foreground">
                #{scored.rank} of {model.scoredUtilityCount} Texas utilities
              </span>
            ) : null}
          </div>
        ) : patterns && scored?.rank ? (
          <p className="text-[14px] leading-[21px] text-muted-foreground">
            #{scored.rank} of {model.scoredUtilityCount} Texas utilities by average rank across the selected hazards
          </p>
        ) : null}
        <p className="text-[14px] leading-[21px] text-muted-foreground">
          {utility.customers != null ? `${number.format(utility.customers)} customers across ` : ""}
          {utility.counties.length} {utility.counties.length === 1 ? "county" : "counties"} (EIA-861)
        </p>
      </div>

      {view.question === "fleet" ? fleetCard : null}
      {view.question === "grid" ? <GridCard utility={utility} /> : null}
      {storm ? <StormImpact storm={storm} counties={utility.counties} countiesByFips={countiesByFips} /> : null}

      <Breakdown
        data={data}
        title={detailHeading(view)}
        weighted
        rows={detailLayers(view).map((id) => ({
          id,
          ...utilityLayerSummary(utility, countiesByFips, id),
          quality: utilityLayerQuality(utility, countiesByFips, id),
        }))}
      />

      <div className="space-y-3">
        <p className="text-[16px] leading-[24px] font-semibold">
          All {counties.length} {counties.length === 1 ? "county" : "counties"}, as colored on the map
        </p>
        <ul className="bp-row-list">
          {shownCounties.map(({ c, level }) => (
            <li key={c.fips}>
              <button
                type="button"
                onClick={() => onSelectCounty(c.fips)}
                className="bp-row flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[14px] leading-[21px] font-semibold"
              >
                {c.name}
                <ViewChip described={described} level={level} />
              </button>
            </li>
          ))}
        </ul>
        {counties.length > GROUP_PREVIEW ? (
          <ShowAll open={allCounties} count={counties.length} onToggle={() => setAllCounties(!allCounties)} />
        ) : null}
      </div>

      {view.question !== "fleet" ? fleetCard : null}
      {view.question !== "grid" ? <GridCard utility={utility} /> : null}
      {patterns ? fingerprint : <LongTerm open={false}>{fingerprint}</LongTerm>}
      <RightNow data={data} fips={utility.counties} />
    </div>
  );
}

function CountyView(props: DetailPanelProps & { county: CountyRecord; utility: UtilityRecord }) {
  const { data, view, described, storm, countiesByFips, utilitiesById, county, utility, onShare, onSelectCounty } = props;
  const serving = pickerOptions(county, utilitiesById);
  const highlights = hazardHighlights(view, county);
  const fingerprint = (
    <HazardFingerprint
      layers={data.layers}
      ranks={Object.fromEntries(HAZARD_IDS.map((h) => [h, county.ranks[h]]))}
      values={Object.fromEntries(HAZARD_IDS.map((h) => [h, county.values[h]]))}
      quality={Object.fromEntries(HAZARD_IDS.map((h) => [h, county.quality[h]]))}
    />
  );
  return (
    <div className="space-y-6">
      <BackButton label={utility.name} onClick={() => onSelectCounty(null)} />
      <div className="space-y-3">
        <h2 className="text-[30px] leading-[1.2]">{county.name} County</h2>
        <ViewChip described={described} level={described.stateFor(county).level} />
        <p className="text-[14px] leading-[21px] text-muted-foreground">
          Served by{" "}
          {serving.map((s) => `${s.name}${s.share != null ? ` (≈ ${percent.format(s.share)})` : ""}`).join(", ")}
          {county.customers != null ? ` · ${number.format(county.customers)} customers` : ""}
          {county.load_zone ? ` · ${county.load_zone} (approximate)` : ""}
        </p>
      </div>

      {view.question === "fleet" ? (
        <>
          <p className="text-[14px] leading-[21px] text-muted-foreground">
            Fleet numbers are for {utility.name}, the utility in focus. Pick another from &ldquo;Served by&rdquo; on the map.
          </p>
          <FleetCard
            data={data}
            utility={utility}
            fleet={fleetScenario(utility, countiesByFips, view.share, data.battery)}
            share={view.share}
            onShare={onShare}
            spikeHours={utilityLayerSummary(utility, countiesByFips, "price_spikes").value}
          />
        </>
      ) : null}

      {storm ? <StormImpact storm={storm} counties={[county.fips]} countiesByFips={countiesByFips} /> : null}

      {highlights ? (
        <div className="space-y-2">
          <p className="text-[14px] leading-[21px] font-semibold">{highlights.label}</p>
          <p className="text-[12px] leading-[18px] text-muted-foreground">
            High means Texas&apos;s top fifth of counties, 2000 on. Historical relative exposure, not the odds of these
            events at the same time.
          </p>
          <div className="flex flex-wrap gap-3">
            {highlights.scope.map((h) => (
              <span key={h} className={cn(!highlights.high.includes(h) && "opacity-45")}>
                <HazardChip hazard={h} />
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {view.question === "grid" && generationSummary(county.generation_mix) ? (
        <p className="text-[14px] leading-[21px]">
          <span className="font-semibold">Power plants in the county:</span> {generationSummary(county.generation_mix)}
          <span className="block text-[12px] leading-[18px] text-muted-foreground">
            EIA-860 2024, net summer capacity. ERCOT is one grid, so this isn&apos;t reserved for the county.
          </span>
        </p>
      ) : null}

      {county.sfha_land_pct != null && (view.question === "hazards" || view.factors.includes("flood")) ? (
        <p className="bp-info px-4 py-3 text-[14px] leading-[21px]">
          {Math.round(county.sfha_land_pct)}% of this county&apos;s land is in FEMA&apos;s 1% annual-chance floodplain
          (effective flood maps).{" "}
          {overlays(view).flood
            ? "The blue areas on the map are those zones."
            : "Pick Flood under Explore hazards to see the zones."}
        </p>
      ) : null}

      <Breakdown
        data={data}
        title={detailHeading(view)}
        weighted={false}
        rows={detailLayers(view).map((id) => ({
          id,
          value: county.values[id],
          rank: county.ranks[id],
          quality: county.quality[id],
        }))}
      />
      {view.question === "hazards" && view.hazardSub === "patterns" ? fingerprint : <LongTerm open={false}>{fingerprint}</LongTerm>}
      <RightNow data={data} fips={[county.fips]} />
      <p className="text-[12px] leading-[18px] text-muted-foreground">
        Homes in this county, not any single home. Every value is an estimate.
      </p>
    </div>
  );
}
