"use client";

import { HazardChip } from "@/components/utility-map/hazard-chip";
import { RISK_BANDS, RISK_HAZARDS } from "@/lib/utility-map/describe-view";
import { formatLayerValue, liveSummary } from "@/lib/utility-map/format";
import type { SpotlightStorm } from "@/lib/utility-map/hazard-style";
import { riskDrivers, worstStorm } from "@/lib/utility-map/score-card";
import { LEVEL_COLORS, type Level } from "@/lib/utility-map/scoring";
import type { LayerId, Quality, RiskIndex, UtilityMapData } from "@/lib/utility-map/types";

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const millions = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export type ScoreCardProps = {
  data: UtilityMapData;
  kind: "county" | "utility";
  risk: RiskIndex | undefined;
  /** Rank (0-1) and display value of each layer for this place. */
  ranks: Partial<Record<LayerId, number | null>>;
  values: Partial<Record<LayerId, number | null>>;
  quality: Partial<Record<LayerId, Quality>>;
  fips: string[];
  storms: SpotlightStorm[];
  customers: number | null;
  summerPeakMw?: number | null;
  floodplainPct?: number | null;
};

/** One snapshot of how at risk a county or utility is, from every source the map uses. */
export function ScoreCard(props: ScoreCardProps) {
  const { data, kind, risk, ranks, values, quality, fips, storms } = props;
  const peers = kind === "county" ? "Texas counties" : "Texas utilities";
  const level = (risk?.level ?? null) as Level | null;
  const color = level ? LEVEL_COLORS[level] : "var(--bp-grey-20)";
  const drivers = riskDrivers(ranks);
  const storm = worstStorm(storms, fips);
  const highHazards = RISK_HAZARDS.filter((h) => (ranks[h] ?? 0) >= 0.8);
  const meta = (id: LayerId) => data.layers.find((l) => l.id === id)!;

  return (
    <section
      aria-label="Grid Risk Index score card"
      className="space-y-5 rounded-[20px] border-2 bg-white p-5"
      style={{ borderColor: color }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] leading-[18px] font-semibold tracking-wide text-muted-foreground uppercase">
            Grid Risk Index
          </p>
          {risk?.index != null ? (
            <p className="flex items-baseline gap-1">
              <span className="text-[56px] leading-none font-semibold tabular-nums">{risk.index}</span>
              <span className="text-[16px] leading-none font-semibold text-muted-foreground">/ 100</span>
            </p>
          ) : (
            <p className="text-[20px] leading-[27px] font-semibold text-muted-foreground">Not enough data</p>
          )}
        </div>
        {risk?.index != null && level ? (
          <div className="space-y-1 text-right">
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-[14px] leading-[21px] font-semibold"
              style={{ backgroundColor: color, color: level >= 3 ? "white" : "var(--bp-grey-100)" }}
            >
              {RISK_BANDS[level - 1]}
            </span>
            {risk.rank ? (
              <p className="text-[12px] leading-[18px] text-muted-foreground">
                #{risk.rank} of {risk.of} {peers}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {risk?.index != null ? (
        <div className="space-y-2.5">
          <HalfBar label="Hazard exposure" hint="flood, tornado, hail and wind, hurricane, freeze, heat" value={risk.hazard} />
          <HalfBar label="Grid stress" hint="long outages, price spikes, summer peak" value={risk.stress} />
        </div>
      ) : null}

      {drivers.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[14px] leading-[21px] font-semibold">Top risk drivers</p>
          <ol className="space-y-1">
            {drivers.map((d) => (
              <li key={d.id} className="flex items-baseline justify-between gap-3 text-[13px] leading-[19px]">
                <span className="font-semibold">{meta(d.id).label}</span>
                <span className="text-right text-muted-foreground">
                  {formatLayerValue(meta(d.id), values[d.id] ?? null, quality[d.id] ?? "missing")} ·{" "}
                  {kind === "county"
                    ? `higher than ${d.percentile}% of Texas counties`
                    : `its counties average the ${d.percentile}th percentile`}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 text-[13px] leading-[19px]">
        <Fact label="Long outages">
          {formatLayerValue(meta("outages"), values.outages ?? null, quality.outages ?? "missing")}
        </Fact>
        <Fact label="High-risk hazards">
          {highHazards.length === 0 ? (
            "None in Texas's top fifth"
          ) : (
            <span className="flex flex-wrap gap-x-2 gap-y-1">
              {highHazards.map((h) => (
                <HazardChip key={h} hazard={h} />
              ))}
            </span>
          )}
        </Fact>
        <Fact label={kind === "county" ? "Worst storm on record" : "Worst storm on record in its counties (all utilities)"} wide>
          {storm
            ? `${storm.name}: ${whole.format(storm.peakOut)} customers out at peak${
                storm.peakPct != null ? ` (${whole.format(storm.peakPct)}%)` : ""
              }, ${millions.format(storm.customerHours / 1e6)}M customer-hours`
            : storms.length === 0
              ? "Loading storm records"
              : "No labeled storm outages here since 2018"}
        </Fact>
        {props.floodplainPct != null ? (
          <Fact label="In FEMA 100-year floodplain">{Math.round(props.floodplainPct)}% of land</Fact>
        ) : null}
        {props.summerPeakMw != null ? <Fact label="Summer peak (2024)">{whole.format(props.summerPeakMw)} MW</Fact> : null}
        {props.customers != null ? <Fact label="Customers">{whole.format(props.customers)}</Fact> : null}
        <Fact label="Right now">{liveSummary(data.live, fips)}</Fact>
      </dl>

      <details className="group text-[12px] leading-[18px] text-muted-foreground">
        <summary className="cursor-pointer list-none underline [&::-webkit-details-marker]:hidden">
          Based on {risk?.sources ?? 0} of {risk?.sources_total ?? 9} sources · how it&apos;s computed
        </summary>
        <p className="pt-2">
          Each source is a county&apos;s rank against Texas. Hazard exposure averages the six hazards; grid stress
          averages long outages, price spikes (ERCOT only) and summer peak demand. The index is half each, ranked 1–100
          against {peers}
          {kind === "utility" ? ", with each county weighted by the utility's estimated customers there" : ""}. Missing
          sources are left out, never counted as zero. Historical relative risk, not a forecast.
        </p>
      </details>
    </section>
  );
}

function HalfBar({ label, hint, value }: { label: string; hint: string; value: number | null }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-[13px] leading-[19px]">
        <span>
          <span className="font-semibold">{label}</span> <span className="text-muted-foreground">({hint})</span>
        </span>
        <span className="font-semibold tabular-nums">{value ?? "—"}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--bp-grey-20)]" role="img" aria-label={`${label}: ${value ?? "no data"} of 100`}>
        <div className="h-full rounded-full bg-[var(--bp-grey-100)]" style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}

function Fact({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-[12px] leading-[18px] text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}
