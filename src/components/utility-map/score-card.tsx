"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { HazardChip } from "@/components/utility-map/hazard-chip";
import { RISK_BANDS, RISK_HAZARDS } from "@/lib/utility-map/describe-view";
import { formatLayerValue, liveSummary } from "@/lib/utility-map/format";
import type { SpotlightStorm } from "@/lib/utility-map/hazard-style";
import {
  bandMeaning,
  halfReading,
  rankSentence,
  riskSummary,
  scoreFactors,
  worstStorm,
  type Driver,
} from "@/lib/utility-map/score-card";
import { LEVEL_COLORS, type Level } from "@/lib/utility-map/scoring";
import type { LayerId, Quality, RiskIndex, UtilityMapData } from "@/lib/utility-map/types";

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const millions = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const LEVELS = [1, 2, 3, 4, 5] as Level[];

export type ScoreCardProps = {
  data: UtilityMapData;
  kind: "county" | "utility";
  name: string;
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
  /** Chapter 5, "What could Base add?": the fleet card for this place. */
  baseChapter?: React.ReactNode;
};

/**
 * One snapshot of how at risk a county or utility is, told top to bottom: the score and where it
 * stands, what the band means, what raises and lowers it, its two halves, and what's on record.
 */
export function ScoreCard(props: ScoreCardProps) {
  const { data, kind, name, risk, ranks, values, quality, fips, storms } = props;
  const peers = kind === "county" ? "counties" : "utilities";
  const level = (risk?.level ?? null) as Level | null;
  const color = level ? LEVEL_COLORS[level] : "var(--bp-grey-20)";
  // Pale bands (Low, Moderate) take dark ink; the darker bands take white.
  const ink = level != null && level >= 3 ? "#ffffff" : "var(--bp-grey-100)";
  const { raising, lowering } = scoreFactors(ranks);
  const storm = worstStorm(storms, fips);
  const highHazards = RISK_HAZARDS.filter((h) => (ranks[h] ?? 0) >= 0.8);
  const meta = (id: LayerId) => data.layers.find((l) => l.id === id)!;
  const show = (id: LayerId) => formatLayerValue(meta(id), values[id] ?? null, quality[id] ?? "missing");
  const factorLine = (f: Driver, up: boolean) => {
    const value = formatLayerValue(meta(f.id), values[f.id] ?? null, quality[f.id] ?? "missing");
    const compare =
      kind === "county"
        ? up
          ? `more than ${f.percentile}% of Texas counties`
          : `less than ${100 - f.percentile}% of Texas counties`
        : `its counties sit at the ${f.percentile}th percentile`;
    return { label: meta(f.id).label, value, compare };
  };

  if (risk?.index == null || !level || risk.rank == null) {
    return (
      <section aria-label="Grid Risk Index score card" className="space-y-2 rounded-[20px] border-2 bg-white p-5">
        <p className="text-[12px] leading-[18px] font-semibold tracking-wide text-muted-foreground uppercase">Grid Risk Index</p>
        <p className="text-[16px] leading-[24px] font-semibold">Not enough data to score {name}.</p>
        <p className="text-[13px] leading-[19px] text-muted-foreground">
          Based on {risk?.sources ?? 0} of {risk?.sources_total ?? 9} sources.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Grid Risk Index score card"
      className="space-y-5 rounded-[20px] border-2 bg-white p-5"
      style={{ borderColor: color }}
    >
      <Chapter n={1} title="How at risk is it?">
        <div
          className="flex items-end justify-between gap-3 rounded-2xl px-5 py-4"
          style={{ backgroundColor: color, color: ink }}
        >
          <div>
            <p className="text-[12px] leading-[18px] font-semibold tracking-wide uppercase opacity-85">Grid Risk Index</p>
            <p className="flex items-baseline gap-1.5">
              <span className="text-[88px] leading-[0.9] font-bold tracking-tight tabular-nums">{risk.index}</span>
              <span className="text-[20px] leading-none font-semibold opacity-75">/ 100</span>
            </p>
          </div>
          <div className="pb-1 text-right">
            <p className="text-[22px] leading-[26px] font-bold">{RISK_BANDS[level - 1]}</p>
            <p className="text-[13px] leading-[18px] font-semibold opacity-85">
              #{risk.rank} of {risk.of} {peers}
            </p>
          </div>
        </div>
        <p className="text-[15px] leading-[22px] font-semibold">
          {rankSentence(name, { rank: risk.rank, of: risk.of, level }, kind)}
        </p>
        <IndexScale index={risk.index} level={level} />
        <p className="text-[12px] leading-[18px] text-muted-foreground">{bandMeaning(level, kind)}</p>
        <div className="space-y-1.5 rounded-2xl bg-[var(--bp-grey-5)] p-4">
          <p className="text-[12px] leading-[18px] font-semibold tracking-wide text-muted-foreground uppercase">In short</p>
          <p className="text-[14px] leading-[22px]">
            {riskSummary({
              name,
              kind,
              risk: { hazard: risk.hazard, stress: risk.stress },
              ranks,
              format: show,
              storm,
              outagesHours: values.outages ?? null,
            }).join(" ")}
          </p>
        </div>
      </Chapter>

      <Chapter n={2} title="Why does it score this way?">
      <div className="grid gap-4 sm:grid-cols-2">
        <FactorList
          title="Raising the risk"
          icon={<ArrowUp className="size-4" aria-hidden />}
          empty={`Nothing here ranks in the upper 40% of Texas ${peers}.`}
          items={raising.map((f) => factorLine(f, true))}
        />
        <FactorList
          title="Keeping it down"
          icon={<ArrowDown className="size-4" aria-hidden />}
          empty={`Nothing here ranks in the lower 40% of Texas ${peers}.`}
          items={lowering.map((f) => factorLine(f, false))}
        />
      </div>

      <div className="space-y-3">
        <p className="text-[14px] leading-[21px] font-semibold">Two equal halves</p>
        <HalfBar
          label="Hazard exposure"
          hint="Flood, tornadoes, hail and wind, hurricanes, winter freeze, extreme heat"
          value={risk.hazard}
          reading={halfReading(risk.hazard, kind)}
        />
        <HalfBar
          label="Grid stress"
          hint="Long outages, price spikes, summer peak demand"
          value={risk.stress}
          reading={halfReading(risk.stress, kind)}
        />
      </div>

      </Chapter>

      <Chapter n={3} title="What has happened here?">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] leading-[19px]">
        <Fact label={kind === "county" ? "Worst storm on record" : "Worst storm on record in its counties (all utilities)"} wide>
          {storm
            ? `${storm.name}: ${whole.format(storm.peakOut)} customers out at peak${
                storm.peakPct != null ? ` (${whole.format(storm.peakPct)}%)` : ""
              }, ${millions.format(storm.customerHours / 1e6)}M customer-hours`
            : storms.length === 0
              ? "Loading storm records"
              : "No labeled storm outages here since 2018"}
        </Fact>
        <Fact label="Long outages">
          {formatLayerValue(meta("outages"), values.outages ?? null, quality.outages ?? "missing")}
        </Fact>
        <Fact label="Hazards in Texas's top fifth">
          {highHazards.length === 0 ? (
            "None"
          ) : (
            <span className="flex flex-wrap gap-x-2 gap-y-1">
              {highHazards.map((h) => (
                <HazardChip key={h} hazard={h} />
              ))}
            </span>
          )}
        </Fact>
        {props.floodplainPct != null ? (
          <Fact label="In FEMA 100-year floodplain">{Math.round(props.floodplainPct)}% of land</Fact>
        ) : null}
        {props.summerPeakMw != null ? <Fact label="Summer peak (2024)">{whole.format(props.summerPeakMw)} MW</Fact> : null}
        {props.customers != null ? <Fact label="Customers">{whole.format(props.customers)}</Fact> : null}
      </dl>
      </Chapter>

      <Chapter n={4} title="What's happening right now?">
        <p className="text-[14px] leading-[21px] font-semibold">{liveSummary(data.live, fips)}</p>
        <p className="text-[12px] leading-[18px] text-muted-foreground">
          Live National Weather Service warnings, checked every minute. Not part of the index.
        </p>
      </Chapter>

      {props.baseChapter ? (
        <Chapter n={5} title="What could Base add?">
          {props.baseChapter}
        </Chapter>
      ) : null}

      <details className="group text-[12px] leading-[18px] text-muted-foreground">
        <summary className="cursor-pointer list-none underline [&::-webkit-details-marker]:hidden">
          Based on {risk.sources} of {risk.sources_total} sources · how the index is computed
        </summary>
        <p className="pt-2">
          Each source ranks every Texas county from 0 to 100%. Hazard exposure averages the six hazards; grid stress
          averages long outages, price spikes (ERCOT only) and summer peak demand. The index is half each, then ranked
          1–100 against the other Texas {peers}
          {kind === "utility" ? ", with each county weighted by the utility's estimated customers there" : ""}. A{" "}
          {risk.index} means riskier than about {Math.round(((risk.index - 1) / 99) * 100)}% of them. Missing sources
          are left out, never counted as zero. Historical, not a forecast.
        </p>
      </details>
    </section>
  );
}

/** A numbered step in the card's story. */
function Chapter({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
      <h3 className="flex items-center gap-2 text-[16px] leading-[24px] font-semibold">
        <span className="flex size-6 items-center justify-center rounded-full bg-[var(--bp-grey-100)] text-[12px] leading-none text-white">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </div>
  );
}

/** 1-100 as five colored bands, a marker at this index and a tick at the Texas middle. */
function IndexScale({ index, level }: { index: number; level: Level }) {
  return (
    <div className="space-y-1" role="img" aria-label={`Index ${index} of 100, in the ${RISK_BANDS[level - 1]} band`}>
      <div className="relative">
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {LEVELS.map((l) => (
            <span key={l} className="flex-1" style={{ backgroundColor: LEVEL_COLORS[l], opacity: l === level ? 1 : 0.45 }} />
          ))}
        </div>
        <span className="absolute top-[-3px] h-4 w-0.5 bg-[var(--bp-grey-60)]" style={{ left: "50%" }} aria-hidden />
        <span
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-[var(--bp-grey-100)] shadow"
          style={{ left: `${index}%` }}
          aria-hidden
        />
      </div>
      <div className="flex justify-between text-[11px] leading-tight text-muted-foreground">
        <span>1 · least at risk</span>
        <span>Texas middle</span>
        <span>most at risk · 100</span>
      </div>
    </div>
  );
}

function FactorList({
  title,
  icon,
  items,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  items: { label: string; value: string; compare: string }[];
  empty: string;
}) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-[14px] leading-[21px] font-semibold">
        {icon}
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-[12px] leading-[18px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.label} className="text-[13px] leading-[19px]">
              <span className="block font-semibold">{item.label}</span>
              <span className="block text-muted-foreground">
                {item.value} · {item.compare}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HalfBar({ label, hint, value, reading }: { label: string; hint: string; value: number | null; reading: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-[13px] leading-[19px]">
        <span className="font-semibold">{label}</span>
        <span className="font-semibold tabular-nums">{value ?? "—"} / 100</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--bp-grey-20)]" role="img" aria-label={`${label}: ${value ?? "no data"} of 100`}>
        <div className="h-full rounded-full bg-[var(--bp-grey-100)]" style={{ width: `${value ?? 0}%` }} />
      </div>
      <p className="text-[12px] leading-[18px] text-muted-foreground">
        {reading}. {hint}.
      </p>
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
