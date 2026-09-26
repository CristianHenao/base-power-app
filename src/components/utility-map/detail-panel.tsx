"use client";

import { ChevronLeft, Maximize2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { CountyPicker } from "@/components/utility-map/county-picker";
import { EvidencePopover } from "@/components/utility-map/evidence-popover";
import { FleetCard, GridCard } from "@/components/utility-map/fleet-card";
import { HazardChip } from "@/components/utility-map/hazard-chip";
import { HazardFingerprint } from "@/components/utility-map/hazard-fingerprint";
import { ScoreCard } from "@/components/utility-map/score-card";
import {
  RISK_LAYERS,
  detailHeading,
  detailLayers,
  hazardHighlights,
  overlays,
  type ViewDescription,
} from "@/lib/utility-map/describe-view";
import { HAZARD_IDS, type SpotlightStorm } from "@/lib/utility-map/hazard-style";
import { fleetScenario } from "@/lib/utility-map/fleet";
import { formatLayerValue, generationSummary, paintLabel } from "@/lib/utility-map/format";
import { riskRows, sortRiskRows } from "@/lib/utility-map/risk-table";
import {
  LEVEL_COLORS,
  utilityLayerQuality,
  utilityLayerSummary,
  type Level,
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

type DetailPanelProps = {
  data: UtilityMapData;
  model: ScoreModel;
  view: ViewState;
  described: ViewDescription;
  storm: SpotlightStorm | null;
  storms: SpotlightStorm[];
  countiesByFips: Map<string, CountyRecord>;
  utilitiesById: Map<string, UtilityRecord>;
  selectedUtility: UtilityRecord | null;
  selectedCounty: CountyRecord | null;
  pickerFips: string | null;
  onShare: (share: FleetShare) => void;
  onSelectUtility: (id: string | null) => void;
  onSelectCounty: (fips: string | null) => void;
  onOpenCounty: (fips: string) => void;
  onOpenRiskTable: () => void;
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
        ) : props.view.question === "risk" ? (
          <RiskList {...props} />
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

/** Grid Risk Index, statewide: every utility ranked in a compact table, with the full breakdown one click away. */
function RiskList({ data, countiesByFips, onSelectUtility, onOpenRiskTable }: DetailPanelProps) {
  const [open, setOpen] = useState(false);
  const rows = sortRiskRows(riskRows(data, "utility", countiesByFips), "rank", "asc");
  const shown = open ? rows : rows.slice(0, 15);
  return (
    <div className="space-y-4">
      <Heading title="Grid Risk Index">
        All {rows.length} Texas utilities, ranked. 1–100 against each other; higher is more at risk.
      </Heading>
      <button
        type="button"
        onClick={onOpenRiskTable}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-[var(--bp-grey-100)] px-4 py-3 text-left hover:bg-[var(--bp-grey-5)]"
      >
        <span>
          <span className="block text-[14px] leading-[21px] font-semibold">Open the full table</span>
          <span className="block text-[12px] leading-[18px] text-muted-foreground">
            All {rows.length} utilities and {data.counties.length} counties, every factor, sortable and searchable
          </span>
        </span>
        <Maximize2 className="size-4 shrink-0" aria-hidden />
      </button>
      <table className="w-full text-[13px] leading-[18px]">
        <thead>
          <tr className="border-b text-left text-[12px] text-muted-foreground">
            <th scope="col" className="py-1.5 pr-2 font-semibold">#</th>
            <th scope="col" className="py-1.5 pr-2 font-semibold">Utility</th>
            <th scope="col" className="py-1.5 pr-2 font-semibold">Index</th>
            <th scope="col" className="py-1.5 pr-2 text-right font-semibold" title="Hazard exposure, 1–100">Hazard</th>
            <th scope="col" className="py-1.5 text-right font-semibold" title="Grid stress, 1–100">Grid</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr
              key={row.id}
              tabIndex={0}
              onClick={() => onSelectUtility(row.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectUtility(row.id);
                }
              }}
              className="cursor-pointer border-b hover:bg-[var(--bp-grey-5)] focus-visible:bg-[var(--bp-grey-5)]"
            >
              <td className="py-2 pr-2 tabular-nums text-muted-foreground">{row.rank ?? "—"}</td>
              <td className="py-2 pr-2 font-semibold">{row.name}</td>
              <td className="py-2 pr-2">
                {row.index == null ? (
                  "—"
                ) : (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap"
                    style={{
                      backgroundColor: LEVEL_COLORS[row.level as Level],
                      color: (row.level ?? 0) >= 3 ? "white" : undefined,
                    }}
                  >
                    <span className="tabular-nums">{row.index}</span>
                    {row.band}
                  </span>
                )}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">{row.hazard ?? "—"}</td>
              <td className="py-2 text-right tabular-nums">{row.stress ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 15 ? <ShowAll open={open} count={rows.length} onToggle={() => setOpen(!open)} /> : null}
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
  const hits = storm.counties
    .filter((c) => counties.includes(c.fips))
    .sort(
      (a, b) =>
        Number(a.peak_out_pct == null) - Number(b.peak_out_pct == null) ||
        (b.peak_out_pct ?? 0) - (a.peak_out_pct ?? 0) ||
        b.peak_out - a.peak_out,
    );
  const anyUnknown = hits.some((c) => c.peak_out_pct == null);
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
                {c.peak_out_pct == null ? "Share unknown" : `${number.format(c.peak_out_pct)}% out at peak`} ·{" "}
                {number.format(c.peak_out)} customers ·{" "}
                {number.format(c.customer_hours)} customer-h
              </span>
            </li>
          ))}
        </ul>
      )}
      {anyUnknown ? (
        <p className="bp-info px-4 py-3 text-[12px] leading-[18px]">
          Share unknown: EAGLE-I reported more customers out at some point than this county&apos;s modeled customer
          count, so the count was raised to that peak and a share would read 100% by construction. The customers-out
          count is as reported.
        </p>
      ) : null}
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
        </div>
        {patterns && scored?.rank ? (
          <p className="text-[14px] leading-[21px] text-muted-foreground">
            #{scored.rank} of {model.scoredUtilityCount} Texas utilities by average rank across the selected hazards
          </p>
        ) : null}
        <p className="text-[14px] leading-[21px] text-muted-foreground">
          {utility.customers != null ? `${number.format(utility.customers)} customers across ` : ""}
          {utility.counties.length} {utility.counties.length === 1 ? "county" : "counties"} (EIA-861)
        </p>
      </div>

      <ScoreCard
        data={data}
        kind="utility"
        name={utility.name}
        risk={utility.risk}
        ranks={Object.fromEntries(RISK_LAYERS.map((id) => [id, utilityLayerSummary(utility, countiesByFips, id).rank]))}
        values={Object.fromEntries(RISK_LAYERS.map((id) => [id, utilityLayerSummary(utility, countiesByFips, id).value]))}
        quality={Object.fromEntries(RISK_LAYERS.map((id) => [id, utilityLayerQuality(utility, countiesByFips, id)]))}
        fips={utility.counties}
        storms={props.storms}
        customers={utility.customers}
        summerPeakMw={utility.grid_stats?.summer_peak_mw ?? null}
        baseChapter={fleetCard}
      />

      <p className="border-t pt-5 text-[12px] leading-[18px] font-semibold tracking-wide text-muted-foreground uppercase">
        More for this view
      </p>
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

      {view.question !== "grid" ? <GridCard utility={utility} /> : null}
      {patterns ? fingerprint : <LongTerm open={false}>{fingerprint}</LongTerm>}
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

      <ScoreCard
        data={data}
        kind="county"
        name={`${county.name} County`}
        risk={county.risk}
        ranks={county.ranks}
        values={county.values}
        quality={county.quality}
        fips={[county.fips]}
        storms={props.storms}
        customers={county.customers}
        floodplainPct={county.sfha_land_pct ?? null}
        baseChapter={
          <>
            <p className="text-[13px] leading-[19px] text-muted-foreground">
              Fleet numbers are for {utility.name}, the utility in focus. Pick another from &ldquo;Served by&rdquo; on
              the map.
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
        }
      />

      <p className="border-t pt-5 text-[12px] leading-[18px] font-semibold tracking-wide text-muted-foreground uppercase">
        More for this view
      </p>

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

      {county.sfha_land_pct != null && view.question === "hazards" ? (
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
      <p className="text-[12px] leading-[18px] text-muted-foreground">
        Homes in this county, not any single home. Every value is an estimate.
      </p>
    </div>
  );
}
