import { describeView, scoreLayers } from "./describe-view.ts";
import { fleetScenario } from "./fleet.ts";
import { formatLayerValue } from "./format.ts";
import { HAZARDS, type SpotlightStorm } from "./hazard-style.ts";
import { riskRows, type RiskRow } from "./risk-table.ts";
import { worstStorm } from "./score-card.ts";
import { buildScoreModel } from "./scoring.ts";
import type { CountyRecord, LayerId, UtilityMapData, UtilityRecord } from "./types.ts";
import { QUESTIONS, type ViewState } from "./view.ts";

/**
 * The facts the chat may answer from, as plain text. Everything is taken from the release as
 * published; the model only restates it (CLAUDE.md: the LLM never calculates).
 * statewideFacts is the same for every question (so it can be cached); viewFacts is what's on screen.
 */

const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const fmt = (value: number | null | undefined) => (value == null ? "no data" : num.format(value));

const FACTORS: [LayerId, string][] = [
  ["flood", "flood"], ["tornado", "tornado"], ["severe_storm", "hail/wind"], ["hurricane", "hurricane"],
  ["winter", "freeze"], ["heat", "heat"], ["outages", "long outages"], ["price_spikes", "price spikes"],
  ["peak_demand", "summer peak"],
];

const BASE_FACTS = [
  "Base Core: 39.2 kWh and 20 kW per Core.",
  "About 12-18 h of backup for a typical home on one Core, up to 36 h with reduced use; Base's reduced-use headline is 36-72 h for 1-2 Cores.",
  "Base keeps about a 20% backup reserve.",
  "Never quote prices. Label every estimate as an estimate. Outage data is county-level: say homes in the county, never your home.",
].join("\n");

function riskText(r: RiskRow, of: number): string {
  if (r.index == null) return "Grid Risk Index: no data";
  return `Grid Risk Index ${r.index} of 100 (${r.band}), #${r.rank} of ${of}; hazard half ${fmt(r.hazard)}, grid stress half ${fmt(r.stress)}; ${r.sources} of ${r.sourcesTotal} sources`;
}

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const cell = (value: number | null | undefined) => (value == null ? "-" : num.format(value));
const wholeCell = (value: number | null | undefined) => (value == null ? "-" : whole.format(value));
const percentiles = (r: RiskRow) => FACTORS.map(([id]) => cell(r.factors[id])).join(", ");
const UNITS: Record<string, string> = {
  flood: "flood days / yr", tornado: "EF-km / 1,000 km2 / yr", severe_storm: "reports / 1,000 km2 / yr",
  hurricane: "passes / decade", winter: "event days / yr", heat: "event days / yr",
  outages: "h per customer / yr", price_spikes: "h / yr", peak_demand: "MW, estimated",
};

function factorText(r: RiskRow): string {
  return FACTORS.map(([id, label]) => `${label} ${r.factors[id] == null ? "no data" : cell(r.factors[id])}`).join(", ");
}

function layerValue(data: UtilityMapData, county: CountyRecord, id: LayerId): string {
  const meta = data.layers.find((l) => l.id === id);
  return meta ? formatLayerValue(meta, county.values[id] ?? null, county.quality[id]) : "no data";
}

export function statewideFacts(data: UtilityMapData, storms: SpotlightStorm[]): string {
  const byFips = new Map(data.counties.map((c) => [c.fips, c]));
  const utilityRows = riskRows(data, "utility", byFips);
  const countyRows = riskRows(data, "county", byFips);
  const utilities = new Map(data.utilities.map((u) => [u.id, u]));
  const out: string[] = [];

  out.push(
    "# Release",
    `Release ${data.release_id ?? "unknown"}, as of ${data.as_of}, data mode ${data.data_mode}. ${data.note}`,
    "",
    "# Grid Risk Index method",
    data.scoring?.risk_index ?? "",
    "Bands: Low 1-20, Moderate 21-40, Elevated 41-60, High 61-80, Severe 81-100. Rank 1 is the most at risk.",
    "Factor numbers below are Texas percentiles (0-100): higher means more exposed or more stressed than that share of Texas counties; utilities use their counties weighted by customers.",
    "",
    "# Layers (what each measures, and how)",
    ...data.layers.map(
      (l) =>
        `${l.label} [${l.id}]: ${l.unit ?? ""}${l.period_start ? `, ${l.period_start} to ${l.period_end}` : ""}. ${l.method ?? ""}${l.available ? "" : ` Not available: ${l.unavailable_reason ?? "not built"}.`}`,
    ),
    "",
    "# Sources",
    ...data.sources.map((s) => `${s.name}`),
    "",
    "# Base facts (the only Base numbers you may use)",
    BASE_FACTS,
    `Fleet model: one Core per home, ${data.battery.kwh_per_core} kWh and ${data.battery.kw_per_core} kW per Core, ${num.format(data.battery.reserve_fraction * 100)}% reserve, dispatched over ${data.battery.dispatch_window_h} hours. Eligible homes are owner-occupied single-family homes (ACS). All fleet numbers are estimates.`,
    "",
    `# All ${utilityRows.length} utilities`,
    `Columns: id | name | Grid Risk Index | band | rank of ${utilityRows.length} | hazard half | grid stress half | customers | summer peak MW (2024; e = estimated) | percentiles: ${FACTORS.map(([, l]) => l).join(", ")}. "-" = no data.`,
    ...utilityRows.map((r) => {
      const u = utilities.get(r.id);
      const peak = u?.grid_stats?.summer_peak_mw;
      const est = u?.grid_stats?.peak_source === "ercot_zone_estimate" ? " e" : "";
      return [r.id, r.name, cell(r.index), r.band ?? "-", cell(r.rank), cell(r.hazard), cell(r.stress), wholeCell(u?.customers), peak == null ? "-" : `${whole.format(peak)}${est}`, percentiles(r)].join(" | ");
    }),
    "",
    `# All ${countyRows.length} counties`,
    `Columns: fips | name | main utility id | Grid Risk Index | band | rank of ${countyRows.length} | hazard half | grid stress half | customers | percentiles (same order as utilities) | values: ${FACTORS.map(([id, l]) => `${l} (${UNITS[id]})`).join(", ")}. "-" = no data.`,
    ...countyRows.map((r) => {
      const c = byFips.get(r.id)!;
      const values = FACTORS.map(([id]) => (id === "peak_demand" ? wholeCell(c.values[id]) : cell(c.values[id]))).join(", ");
      return [r.id, r.name, c.primary_utility ?? "-", cell(r.index), r.band ?? "-", cell(r.rank), cell(r.hazard), cell(r.stress), wholeCell(c.customers), percentiles(r), values].join(" | ");
    }),
    "",
    "# Labeled storms (EAGLE-I outage records; peak = most customers out at one time)",
    ...storms.map((s) => {
      const top = [...s.counties].sort((a, b) => b.peak_out - a.peak_out).slice(0, 8);
      const hits = top
        .map((c) => {
          const name = byFips.get(c.fips)?.name ?? c.fips;
          const share = c.peak_out_pct == null ? "share unknown" : `${fmt(c.peak_out_pct)}%`;
          return `${name} County ${fmt(c.peak_out)} out (${share}), ${fmt(c.customer_hours)} customer-hours`;
        })
        .join("; ");
      return `${s.name} (${s.start} to ${s.end}): ${s.counties.length} counties with outages. Largest: ${hits}.`;
    }),
  );
  return out.join("\n");
}

function utilityFacts(data: UtilityMapData, storms: SpotlightStorm[], u: UtilityRecord, view: ViewState): string[] {
  const byFips = new Map(data.counties.map((c) => [c.fips, c]));
  const row = riskRows(data, "utility", byFips).find((r) => r.id === u.id)!;
  const lines = [
    `Selected utility: ${u.name} (${u.id})`,
    riskText(row, data.utilities.length),
    `Factor percentiles: ${factorText(row)}`,
    `${wholeCell(u.customers)} customers; ${u.grid_stats?.summer_peak_mw == null ? "summer peak not known" : `${whole.format(u.grid_stats.summer_peak_mw)} MW summer peak (2024)`}; grid ${u.grid}`,
    `Counties served: ${u.counties.map((f) => `${byFips.get(f)?.name ?? f} County`).join(", ")}`,
  ];
  const worst = worstStorm(storms, u.counties);
  if (worst) lines.push(`Worst labeled storm in its counties: ${worst.name}, ${fmt(worst.peakOut)} customers out at peak, ${fmt(worst.customerHours)} customer-hours.`);
  if (view.question === "fleet") {
    const byId = new Map(data.counties.map((c) => [c.fips, c]));
    const f = fleetScenario(u, byId, view.share, data.battery);
    const share = `${num.format(view.share * 100)}%`;
    lines.push(
      `${share} Base fleet for ${u.name}: ${fmt(f.cores)} Cores, ${fmt(f.storageMwh)} MWh stored, ${fmt(f.dispatchMw2h)} MW for ${data.battery.dispatch_window_h} hours, ${f.peakShare == null ? "share of summer peak not known" : `${num.format(f.peakShare * 100)}% of summer peak`} (estimates).`,
    );
  }
  return tagged(u.name, lines);
}

/** Starts every line with the place's name unless it already has it, so each number is tied to its place. */
const tagged = (name: string, lines: string[]) => lines.map((l) => (l.includes(name) ? l : `${name}: ${l}`));

function countyFacts(data: UtilityMapData, storms: SpotlightStorm[], c: CountyRecord): string[] {
  const byFips = new Map(data.counties.map((x) => [x.fips, x]));
  const row = riskRows(data, "county", byFips).find((r) => r.id === c.fips)!;
  const utilities = new Map(data.utilities.map((u) => [u.id, u.name]));
  const hits = storms
    .map((s) => ({ s, hit: s.counties.find((h) => h.fips === c.fips) }))
    .filter((x) => x.hit)
    .sort((a, b) => b.hit!.peak_out - a.hit!.peak_out)
    .slice(0, 5)
    .map(({ s, hit }) => `${s.name} ${fmt(hit!.peak_out)} out (${hit!.peak_out_pct == null ? "share unknown" : `${fmt(hit!.peak_out_pct)}%`})`);
  return tagged(`${c.name} County`, [
    `Selected county: ${c.name} County (${c.fips})`,
    riskText(row, data.counties.length),
    `Factor percentiles: ${factorText(row)}`,
    `Values: ${data.layers.map((l) => `${l.label} ${layerValue(data, c, l.id)}`).join("; ")}`,
    `${fmt(c.customers)} customers; utilities: ${c.utilities.map((id) => utilities.get(id) ?? id).join(", ")}`,
    ...(c.sfha_land_pct != null ? [`${fmt(c.sfha_land_pct)}% of land in FEMA's 1% annual-chance floodplain`] : []),
    ...(hits.length ? [`Labeled storms here: ${hits.join("; ")}`] : []),
  ]);
}

export function viewFacts(data: UtilityMapData, storms: SpotlightStorm[], input: ViewState): string {
  // Only a storm in the release may be named; anything else from the request is left out.
  const view = input.storm && !storms.some((s) => s.name === input.storm) ? { ...input, hazardSub: "patterns" as const, storm: null } : input;
  const q = QUESTIONS.find((x) => x.id === view.question)!;
  const byFips = new Map(data.counties.map((c) => [c.fips, c]));
  const byId = new Map(data.utilities.map((u) => [u.id, u]));
  const described = describeView(view, {
    data,
    model: buildScoreModel(data, scoreLayers(view)),
    countiesByFips: byFips,
    utilitiesById: byId,
    storms,
    stormsStatus: "ok",
  });
  const t = described.table;
  const lines = [
    "# On screen now",
    `Question: ${q.label} (${q.question})`,
    ...(view.question === "hazards"
      ? [view.hazardSub === "storm" ? `Past storm: ${view.storm ?? "none picked"}` : `Hazards picked: ${view.hazards.map((h) => HAZARDS[h].label).join(", ") || "none"}`]
      : []),
    ...(view.question === "fleet" ? [`Fleet share: ${num.format(view.share * 100)}% of eligible homes`] : []),
    `Card: ${described.intro.title} ${described.intro.lead}`,
    `The list on screen shows: ${t.columns.join(", ")}.`,
    ...t.rows.slice(0, 10).map((r) => `On the list: ${r.name}: ${r.cells.join(", ")}`),
  ];
  const u = view.utility ? byId.get(view.utility) : undefined;
  const c = view.county ? byFips.get(view.county) : undefined;
  if (u) lines.push("", ...utilityFacts(data, storms, u, view));
  if (c) lines.push("", ...countyFacts(data, storms, c));
  return lines.join("\n");
}

/** Three or four questions worth asking about what's on screen. */
export function chatSuggestions(data: UtilityMapData, view: ViewState): string[] {
  const county = view.county ? data.counties.find((c) => c.fips === view.county) : undefined;
  const utility = view.utility ? data.utilities.find((u) => u.id === view.utility) : undefined;
  const share = `${num.format(view.share * 100)}%`;
  if (county) {
    const name = `${county.name} County`;
    return [
      county.risk?.index != null ? `Why is ${name} ${county.risk.index} out of 100?` : `How at risk is ${name}?`,
      `Which hazards matter most in ${name}?`,
      `How often do homes in ${name} lose power for long stretches?`,
    ];
  }
  if (utility) {
    const name = utility.name;
    return [
      utility.risk?.index != null ? `Why is ${name} ${utility.risk.index} out of 100?` : `How at risk is ${name}?`,
      view.question === "fleet" ? `What could a ${share} Base fleet add for ${name}?` : `Which of ${name}'s counties are most at risk?`,
      `What was the worst storm for ${name}?`,
      `How big is ${name}'s grid compared with others in Texas?`,
    ];
  }
  if (view.question === "hazards" && view.hazardSub === "storm" && view.storm) {
    return [`Which counties did ${view.storm} hit hardest?`, `How does ${view.storm} compare with other storms?`, "Where does the outage data come from?"];
  }
  if (view.question === "hazards") {
    return ["Which counties face the most hazards?", "Where is flood exposure highest?", "Where does the hazard data come from?"];
  }
  if (view.question === "grid") {
    return ["Which utilities have the biggest summer peak?", "What does summer peak demand tell us about risk?", "Where are the power plants?"];
  }
  if (view.question === "fleet") {
    return [`What does a ${share} Base fleet mean?`, "Which utilities would a fleet help most?", "What are the fleet assumptions?"];
  }
  return ["Which utilities are most at risk, and why?", "What goes into the Grid Risk Index?", "Which counties are at the lowest risk?"];
}
