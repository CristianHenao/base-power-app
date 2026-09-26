"use client";

import { ChevronLeft, CloudAlert, Zap } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { LevelChip } from "@/components/utility-map/controls-panel";
import { CountyPicker } from "@/components/utility-map/county-picker";
import { EvidencePopover } from "@/components/utility-map/evidence-popover";
import { FleetCard, GridCard, type FleetShare } from "@/components/utility-map/fleet-card";
import { fleetScenario } from "@/lib/utility-map/fleet";
import { formatLayerValue, liveSummary } from "@/lib/utility-map/format";
import {
  RANK_GROUPS,
  offerLabel,
  rankGroup,
  utilityLayerQuality,
  utilityLayerSummary,
  type ScoreModel,
} from "@/lib/utility-map/scoring";
import { pickerOptions } from "@/lib/utility-map/selection";
import type {
  CountyRecord,
  LayerId,
  Quality,
  UtilityMapData,
  UtilityRecord,
} from "@/lib/utility-map/types";
import { cn } from "@/lib/utils";

const GROUP_PREVIEW = 8;

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
  activeLayers: LayerId[];
  countiesByFips: Map<string, CountyRecord>;
  utilitiesById: Map<string, UtilityRecord>;
  selectedUtility: UtilityRecord | null;
  selectedCounty: CountyRecord | null;
  pickerFips: string | null;
  fleetShare: FleetShare;
  onFleetShare: (share: FleetShare) => void;
  onSelectUtility: (id: string | null) => void;
  onSelectCounty: (fips: string | null) => void;
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
        ) : (
          <RankedList {...props} />
        )}
      </div>
    </section>
  );
}

function RankedList({ data, model, activeLayers, onSelectUtility }: DetailPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (activeLayers.length === 0) {
    return (
      <div className="space-y-1">
        <h2 className="text-[20px] leading-[27px]">Where utilities need Base</h2>
        <p className="text-[14px] leading-[21px] text-muted-foreground">
          Turn on at least one layer, or pick a lens, to rank utilities.
        </p>
      </div>
    );
  }
  const sortByScore = (a: UtilityRecord, b: UtilityRecord) =>
    (model.utility.get(b.id)?.score ?? -1) - (model.utility.get(a.id)?.score ?? -1);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-[20px] leading-[27px]">Where utilities need Base</h2>
        <p className="text-[14px] leading-[21px] text-muted-foreground">
          {model.scoredUtilityCount} Texas utilities, ranked by stress within each group. Select one or
          click the map.
        </p>
      </div>

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
                {group.label}{" "}
                <span className="font-medium text-muted-foreground">({members.length})</span>
              </h3>
              <p className="text-[12px] leading-[18px] text-muted-foreground">{group.hint}</p>
            </div>
            {members.length === 0 ? (
              <p className="rounded-2xl border border-dashed px-4 py-3 text-[14px] leading-[21px] text-muted-foreground">
                None with the layers on.
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
                          <span className="block truncate text-[14px] leading-[21px] font-semibold">
                            {u.name}
                          </span>
                          <span className="block text-[12px] leading-[18px] font-medium text-muted-foreground">
                            {offerLabel(u)}
                            {u.eligible_homes != null ? ` · ${number.format(u.eligible_homes)} homes` : ""}
                          </span>
                        </span>
                        <LevelChip level={model.utility.get(u.id)?.level ?? null} />
                      </button>
                    </li>
                  ))}
                </ul>
                {members.length > GROUP_PREVIEW ? (
                  <button
                    type="button"
                    className="bp-link"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (open) next.delete(group.id);
                        else next.add(group.id);
                        return next;
                      })
                    }
                  >
                    {open ? "Show fewer" : `Show all ${members.length}`}
                  </button>
                ) : null}
              </>
            )}
          </div>
        );
      })}
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
        Not part of the score.
      </p>
    </div>
  );
}

type BreakdownRow = { id: LayerId; value: number | null; rank: number | null; quality: Quality };

function Breakdown({ data, rows }: { data: UtilityMapData; rows: BreakdownRow[] }) {
  return (
    <div className="space-y-3">
      <p className="text-[16px] leading-[24px] font-semibold">What drives the score</p>
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
                <span className="text-right text-muted-foreground">
                  {formatLayerValue(meta, row.value, row.quality)}
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-[var(--bp-grey-20)]"
                role="img"
                aria-label={`${meta.label}: ${
                  row.rank == null ? "no rank" : `higher than ${Math.round(row.rank * 100)}% of Texas counties`
                }`}
              >
                <div
                  className="h-full rounded-full bg-[var(--bp-green-90)]"
                  style={{ width: `${Math.round((row.rank ?? 0) * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[12px] leading-[18px] text-muted-foreground">
        Bars show rank against Texas counties (0 to 100%). Tap ⓘ for the source and period.
      </p>
    </div>
  );
}

function UtilityView({
  data,
  model,
  activeLayers,
  countiesByFips,
  utility,
  fleetShare,
  onFleetShare,
  onSelectUtility,
  onSelectCounty,
}: DetailPanelProps & { utility: UtilityRecord }) {
  const scored = model.utility.get(utility.id);
  const topCounties = utility.counties
    .map((fips) => countiesByFips.get(fips))
    .filter((c): c is CountyRecord => c != null)
    .sort((a, b) => (model.county.get(b.fips)?.score ?? -1) - (model.county.get(a.fips)?.score ?? -1));
  const fleet = fleetScenario(utility, countiesByFips, fleetShare, data.battery);

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
        <div className="flex flex-wrap items-center gap-2">
          <LevelChip level={scored?.level ?? null} />
          {scored?.rank ? (
            <span className="text-[14px] leading-[21px] text-muted-foreground">
              #{scored.rank} of {model.scoredUtilityCount} Texas utilities
            </span>
          ) : null}
        </div>
        <p className="text-[14px] leading-[21px] text-muted-foreground">
          {utility.customers != null ? `${number.format(utility.customers)} customers across ` : ""}
          {utility.counties.length} {utility.counties.length === 1 ? "county" : "counties"} (EIA-861)
        </p>
      </div>

      <Breakdown
        data={data}
        rows={activeLayers.map((id) => ({
          id,
          ...utilityLayerSummary(utility, countiesByFips, id),
          quality: utilityLayerQuality(utility, countiesByFips, id),
        }))}
      />

      <RightNow data={data} fips={utility.counties} />

      <FleetCard
        data={data}
        utility={utility}
        fleet={fleet}
        share={fleetShare}
        onShare={onFleetShare}
        spikeHours={utilityLayerSummary(utility, countiesByFips, "price_spikes").value}
      />

      <GridCard utility={utility} />

      <div className="space-y-3">
        <p className="text-[16px] leading-[24px] font-semibold">Counties, most stressed first</p>
        <ul className="bp-row-list">
          {topCounties.slice(0, 8).map((c) => (
            <li key={c.fips}>
              <button
                type="button"
                onClick={() => onSelectCounty(c.fips)}
                className="bp-row flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[14px] leading-[21px] font-semibold"
              >
                {c.name}
                <LevelChip level={model.county.get(c.fips)?.level ?? null} />
              </button>
            </li>
          ))}
        </ul>
        {topCounties.length > 8 ? (
          <p className="text-[12px] leading-[18px] text-muted-foreground">
            {topCounties.length - 8} more on the map.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CountyView({
  data,
  model,
  activeLayers,
  utilitiesById,
  county,
  utility,
  onSelectCounty,
}: DetailPanelProps & { county: CountyRecord; utility: UtilityRecord }) {
  const scored = model.county.get(county.fips);
  const serving = pickerOptions(county, utilitiesById);
  return (
    <div className="space-y-6">
      <BackButton label={utility.name} onClick={() => onSelectCounty(null)} />
      <div className="space-y-3">
        <h2 className="text-[30px] leading-[1.2]">{county.name} County</h2>
        <LevelChip level={scored?.level ?? null} />
        <p className="text-[14px] leading-[21px] text-muted-foreground">
          Served by{" "}
          {serving
            .map((s) => `${s.name}${s.share != null ? ` (≈ ${percent.format(s.share)})` : ""}`)
            .join(", ")}
          {county.customers != null ? ` · ${number.format(county.customers)} customers` : ""}
          {county.load_zone ? ` · ${county.load_zone} (approximate)` : ""}
        </p>
      </div>
      <Breakdown
        data={data}
        rows={activeLayers.map((id) => ({
          id,
          value: county.values[id],
          rank: county.ranks[id],
          quality: county.quality[id],
        }))}
      />
      <RightNow data={data} fips={[county.fips]} />
      <p className="text-[12px] leading-[18px] text-muted-foreground">
        Homes in this county, not any single home. Every value is an estimate.
      </p>
    </div>
  );
}
