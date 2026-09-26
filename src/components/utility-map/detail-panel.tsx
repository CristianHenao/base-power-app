"use client";

import { ChevronLeft, CloudAlert, Zap } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { LevelChip } from "@/components/utility-map/controls-panel";
import {
  BASE_OFFER_LABELS,
  RANK_GROUPS,
  fleetEstimate,
  rankGroup,
  utilityLayerSummary,
  type ScoreModel,
} from "@/lib/utility-map/scoring";
import type {
  CountyRecord,
  LayerId,
  MapLayerMeta,
  UtilityMapData,
  UtilityRecord,
} from "@/lib/utility-map/types";
import { cn } from "@/lib/utils";

const FLEET_SHARES = [0.01, 0.05, 0.1] as const;

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function formatValue(layer: LayerId, value: number | null): string {
  if (value == null) return "Not in ERCOT";
  if (layer === "homes") return `${number.format(value)} homes`;
  if (layer === "outages") return `${oneDecimal.format(value)} h per customer / yr`;
  if (layer === "scarcity") return `${number.format(value)} h / yr`;
  return `${oneDecimal.format(value)} / 100`;
}

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
  selectedUtility: UtilityRecord | null;
  selectedCounty: CountyRecord | null;
  onSelectUtility: (id: string | null) => void;
  onSelectCounty: (fips: string | null) => void;
  className?: string;
};

export function DetailPanel(props: DetailPanelProps) {
  const { selectedUtility, selectedCounty, className } = props;
  return (
    <section
      aria-label="Details"
      className={cn(
        "bp-panel flex min-h-0 flex-col overflow-hidden",
        className,
      )}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {selectedCounty && selectedUtility ? (
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
  if (activeLayers.length === 0) {
    return (
      <div className="space-y-1">
        <h2 className="text-[20px] leading-[27px]">Where utilities need Base</h2>
        <p className="text-[14px] leading-[21px] text-muted-foreground">
          Turn on at least one scored layer, or pick a preset, to rank utilities.
        </p>
      </div>
    );
  }
  const scored = data.utilities.filter((u) => u.scored);
  const others = data.utilities.filter((u) => !u.scored);
  const sortByScore = (a: UtilityRecord, b: UtilityRecord) =>
    (model.utility.get(b.id)?.score ?? -1) - (model.utility.get(a.id)?.score ?? -1);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-[20px] leading-[27px]">Where utilities need Base</h2>
        <p className="text-[14px] leading-[21px] text-muted-foreground">
          Ranked by stress within each group. Select a utility or click the map.
        </p>
      </div>

      {RANK_GROUPS.map((group) => {
        const members = scored
          .filter((u) => rankGroup(u, model.utility.get(u.id)?.level ?? null) === group.id)
          .sort(sortByScore);
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
              <ul className="bp-row-list">
                {members.map((u) => (
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
                          {BASE_OFFER_LABELS[u.base_offer]} ·{" "}
                          {number.format(u.eligible_homes)} eligible homes
                        </span>
                      </span>
                      <LevelChip level={model.utility.get(u.id)?.level ?? null} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      <div className="space-y-2">
        <div>
          <h3 className="text-[16px] leading-[24px]">
            Not served by Base{" "}
            <span className="font-medium text-muted-foreground">({others.length})</span>
          </h3>
          <p className="text-[12px] leading-[18px] text-muted-foreground">
            Drawn for context. Expansion candidates, not scored in detail.
          </p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {others.sort(sortByScore).map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => onSelectUtility(u.id)}
                className="bp-pill"
              >
                {u.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
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

function RightNow({
  data,
  fips,
}: {
  data: UtilityMapData;
  fips: string[];
}) {
  const alerts = data.live.alerts.filter((a) => fips.includes(a.fips));
  const events = [...new Set(alerts.map((a) => a.event))];
  return (
    <div className="bp-info space-y-1.5 p-4">
      <p className="text-[14px] leading-[21px] font-semibold">Right now</p>
      <p className="flex items-start gap-2 text-[14px] leading-[21px]">
        <CloudAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {alerts.length === 0
          ? "No active NWS warnings"
          : `${alerts.length} ${alerts.length === 1 ? "county" : "counties"} under ${events.join(", ")}`}
      </p>
      <p className="flex items-start gap-2 text-[14px] leading-[21px]">
        <Zap className="mt-0.5 size-4 shrink-0" aria-hidden />
        ERCOT conditions: {data.live.ercot}
      </p>
      <p className="text-[12px] leading-[18px]">
        As of {formatAsOf(data.live.as_of)} CT. Not part of the score.
      </p>
    </div>
  );
}

function Breakdown({
  layers,
  rows,
}: {
  layers: MapLayerMeta[];
  rows: { id: LayerId; value: number | null; rank: number | null }[];
}) {
  return (
    <div className="space-y-3">
      <p className="text-[16px] leading-[24px] font-semibold">What drives the score</p>
      <ul className="space-y-3">
        {rows.map((row) => {
          const meta = layers.find((l) => l.id === row.id);
          return (
            <li key={row.id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-[14px] leading-[21px]">
                <span className="font-semibold">{meta?.label}</span>
                <span className="text-muted-foreground">{formatValue(row.id, row.value)}</span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-[var(--bp-grey-20)]"
                role="img"
                aria-label={`${meta?.label}: ${row.rank == null ? "no data" : `higher than ${Math.round(row.rank * 100)}% of Texas`}`}
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
        Bars show rank against Texas (0 to 100%).
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
  onSelectUtility,
  onSelectCounty,
}: DetailPanelProps & { utility: UtilityRecord }) {
  const [share, setShare] = useState<(typeof FLEET_SHARES)[number]>(0.01);
  const scored = model.utility.get(utility.id);
  const topCounties = utility.counties
    .map((fips) => countiesByFips.get(fips))
    .filter((c): c is CountyRecord => c != null)
    .sort(
      (a, b) =>
        (model.county.get(b.fips)?.score ?? -1) - (model.county.get(a.fips)?.score ?? -1),
    );
  const fleet = fleetEstimate(utility, countiesByFips, share, data.battery);

  return (
    <div className="space-y-6">
      <BackButton label="All utilities" onClick={() => onSelectUtility(null)} />
      <div className="space-y-3">
        <h2 className="text-[30px] leading-[1.2]">{utility.name}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="bg-white">
            {utility.grid}
          </Badge>
          <Badge variant="secondary">{BASE_OFFER_LABELS[utility.base_offer]}</Badge>
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
          {number.format(utility.customers)} customers across {utility.counties.length}{" "}
          {utility.counties.length === 1 ? "county" : "counties"}
        </p>
      </div>

      {!utility.scored ? (
        <div className="rounded-2xl border border-dashed p-4">
          <p className="text-[16px] leading-[24px] font-semibold">
            Base doesn&apos;t serve {utility.name} today
          </p>
          <p className="mt-1 text-[14px] leading-[21px] text-muted-foreground">
            Expansion candidate. Detailed scoring covers the utilities Base works with.
            {utility.grid !== "ERCOT"
              ? ` This territory is on the ${utility.grid} grid, outside ERCOT.`
              : ""}
          </p>
        </div>
      ) : (
        <>
          <Breakdown
            layers={data.layers}
            rows={activeLayers.map((id) => ({
              id,
              ...utilityLayerSummary(utility, countiesByFips, id),
            }))}
          />

          <RightNow data={data} fips={utility.counties} />

          <div className="bp-dark space-y-4 p-5">
            <div className="space-y-1">
              <p className="text-[20px] leading-[27px] font-semibold">What if Base were here</p>
              <p className="text-[14px] leading-[21px] text-white/85">
                Share of eligible homes with one Core. Estimates; scales linearly.
              </p>
            </div>
            <div className="flex gap-2" role="group" aria-label="Fleet size">
              {FLEET_SHARES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={share === value}
                  onClick={() => setShare(value)}
                  className="bp-pill flex-1"
                >
                  {Math.round(value * 100)}%
                </button>
              ))}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Stat label="Homes" value={number.format(fleet.homes)} />
              <Stat label="Storage" value={`${oneDecimal.format(fleet.storageMwh)} MWh`} />
              <Stat label="Peak support, up to" value={`${oneDecimal.format(fleet.peakMw)} MW`} />
              <Stat
                label="Outage hours covered / yr"
                value={number.format(fleet.outageHoursCovered)}
              />
            </dl>
            <p className="text-[12px] leading-[18px] text-white/75">
              For scale: Base serves 30,000+ homes today. Peak support is an upper bound at{" "}
              {data.battery.kw_per_core} kW per Core.
            </p>
          </div>
        </>
      )}

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
  county,
  utility,
  onSelectCounty,
}: DetailPanelProps & { county: CountyRecord; utility: UtilityRecord }) {
  const scored = model.county.get(county.fips);
  return (
    <div className="space-y-6">
      <BackButton label={utility.name} onClick={() => onSelectCounty(null)} />
      <div className="space-y-3">
        <h2 className="text-[30px] leading-[1.2]">{county.name} County</h2>
        <LevelChip level={scored?.level ?? null} />
        <p className="text-[14px] leading-[21px] text-muted-foreground">
          Served by {utility.name} · {number.format(county.customers)} customers
          {county.load_zone ? ` · ${county.load_zone}` : ""}
        </p>
      </div>
      <Breakdown
        layers={data.layers}
        rows={activeLayers.map((id) => ({
          id,
          value: county.values[id],
          rank: county.ranks[id],
        }))}
      />
      <RightNow data={data} fips={[county.fips]} />
      <p className="text-[12px] leading-[18px] text-muted-foreground">
        Homes in this county, not any single home. Every value is an estimate.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] leading-[18px] font-medium text-white/85">{label}</dt>
      <dd className="text-[20px] leading-[27px] font-semibold text-[var(--bp-green-20)] tabular-nums">
        {value}
      </dd>
    </div>
  );
}
