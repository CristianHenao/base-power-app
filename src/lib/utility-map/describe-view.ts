import { FLEET_COLORS, fleetLevel, fleetScenario } from "./fleet.ts";
import { formatLayerValue, paintLabel, type PaintContext } from "./format.ts";
import {
  BIVARIATE_COLORS,
  HAZARDS,
  SHARE_UNKNOWN_COLOR,
  SHARE_UNKNOWN_LEVEL,
  bivariateClass,
  hazardLevel,
  outageShareLevel,
  overlapCount,
  type HazardId,
  type SpotlightStorm,
} from "./hazard-style.ts";
import {
  LEVEL_COLORS,
  utilityLayerQuality,
  utilityLayerSummary,
  type Level,
  type ScoreModel,
} from "./scoring.ts";
import type { CountyPaintState } from "./selection.ts";
import type { CountyRecord, LayerId, UtilityMapData, UtilityRecord } from "./types.ts";
import type { ViewState } from "./view.ts";

/**
 * Everything the screen says about the current view, from one function: caption, legend,
 * county fill, detail rows and table. The map, tooltip, details and table all read this,
 * so they can't describe different questions.
 */

export type LegendSpec =
  | {
      kind: "sequential";
      title: string;
      colors: readonly string[];
      labels: readonly string[];
      note?: string;
      /** One more swatch outside the ramp, e.g. "share unknown". */
      extra?: { color: string; label: string };
    }
  | { kind: "bivariate"; first: string; second: string }
  | { kind: "empty"; message: string };

export type TableSpec = {
  caption: string;
  rowKind: "utility" | "county";
  columns: string[];
  /** The column that matches the map's color, shown first in short lists. */
  primary: number;
  rows: { id: string; name: string; cells: string[] }[];
};

/** "a, b and c" */
function listOf(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The statewide card's opening: which view, a plain question, what the list shows, how to read it. */
export type ViewIntro = { eyebrow: string; title: string; lead: string; read: string };

export type ViewDescription = {
  caption: { title: string; qualifier: string };
  intro: ViewIntro;
  legend: LegendSpec;
  colors: readonly string[];
  context: PaintContext;
  stateFor: (county: CountyRecord) => CountyPaintState;
  /** The tooltip's words for a county, the same ones the map color stands for. */
  labelFor: (county: CountyRecord) => string;
  table: TableSpec;
};

export type DescribeInput = {
  data: UtilityMapData;
  model: ScoreModel;
  countiesByFips: Map<string, CountyRecord>;
  utilitiesById: Map<string, UtilityRecord>;
  storms: SpotlightStorm[];
  stormsStatus: "loading" | "ok" | "failed";
};

const SCORE_COLORS = [LEVEL_COLORS[1], LEVEL_COLORS[2], LEVEL_COLORS[3], LEVEL_COLORS[4], LEVEL_COLORS[5]] as const;
/** Blue ramp for peak demand, distinct from the orange screening score. */
export const GRID_COLORS = ["#e6edf3", "#bccddb", "#8aa6bf", "#557da0", "#07314b"] as const;
const PLAIN_COLORS = ["#f0eeeb", "#f0eeeb", "#f0eeeb", "#f0eeeb", "#f0eeeb"] as const;
const FIFTHS = ["Lowest", "", "Middle", "", "Top fifth"];
const GRID_LAYERS: LayerId[] = ["peak_demand", "generation"];
const FLEET_LAYERS: LayerId[] = ["peak_demand", "homes"];
const TRACKED: HazardId[] = ["tornado", "hurricane", "severe_storm"];
/** The nine layers behind the Grid Risk Index (pipeline/utility_map/risk_index.py). */
export const RISK_HAZARDS: HazardId[] = ["flood", "tornado", "severe_storm", "hurricane", "winter", "heat"];
export const RISK_STRESS: LayerId[] = ["outages", "price_spikes", "peak_demand"];
export const RISK_LAYERS: LayerId[] = [...RISK_HAZARDS, ...RISK_STRESS];
export const RISK_BANDS = ["Low", "Moderate", "Elevated", "High", "Severe"] as const;

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

function stormNow(state: ViewState): boolean {
  return state.question === "hazards" && state.hazardSub === "storm" && state.storm != null;
}

function patternsNow(state: ViewState): boolean {
  return state.question === "hazards" && !stormNow(state);
}

/** The layers that rank utilities and counties in this view. */
export function scoreLayers(state: ViewState): LayerId[] {
  return patternsNow(state) ? state.hazards : RISK_LAYERS;
}

/** The layer rows the details show, the same ones the table lists. */
export function detailLayers(state: ViewState): LayerId[] {
  if (state.question === "risk") return RISK_LAYERS;
  if (stormNow(state)) return [];
  if (patternsNow(state)) return state.hazards;
  if (state.question === "grid") return GRID_LAYERS;
  return FLEET_LAYERS;
}

export function detailHeading(state: ViewState): string {
  if (state.question === "risk") return "What makes up the index";
  if (patternsNow(state)) return "Selected hazards";
  if (state.question === "grid") return "Grid";
  return "What the fleet math uses";
}

/** "High in 2 of 3 selected hazards": top fifth of Texas, counted over exactly the hazards in view. */
export function hazardHighlights(
  state: ViewState,
  county: CountyRecord,
): { scope: HazardId[]; high: HazardId[]; label: string } | null {
  const scope = patternsNow(state)
    ? state.hazards
    : state.question === "risk"
      ? RISK_HAZARDS
      : [];
  if (scope.length === 0) return null;
  const high = scope.filter((h) => (county.ranks[h] ?? 0) >= 0.8);
  const noun = patternsNow(state) ? "selected hazards" : "hazards";
  return { scope, high, label: `High in ${high.length} of ${scope.length} ${noun}` };
}

/** What gets drawn on top of the county fill. */
export function overlays(state: ViewState): {
  demand: boolean;
  plants: boolean;
  tracks: HazardId[];
  stormTrack: string | null;
  flood: boolean;
  view3d: boolean;
} {
  const grid = state.question === "grid";
  const patterns = patternsNow(state);
  return {
    demand: grid && state.demand,
    plants: grid && state.plants,
    tracks: patterns ? state.hazards.filter((h) => TRACKED.includes(h)) : [],
    stormTrack: stormNow(state) ? state.storm : null,
    flood: patterns && state.hazards.includes("flood"),
    view3d: state.question === "risk",
  };
}

function withSelection(
  state: ViewState,
  utilities: Map<string, UtilityRecord>,
  levelFor: (county: CountyRecord) => number | null,
): (county: CountyRecord) => CountyPaintState {
  const selected = state.utility ? utilities.get(state.utility) : undefined;
  return (county) => {
    const inSelection = selected?.counties.includes(county.fips) ?? false;
    return { level: levelFor(county) as Level | null, dim: selected != null && !inSelection, inSelection };
  };
}

function utilityRows(
  input: DescribeInput,
  layers: LayerId[],
  firstCell: (u: UtilityRecord) => string,
  scoreOf: (u: UtilityRecord) => number | null,
): TableSpec["rows"] {
  const { data, countiesByFips } = input;
  return [...data.utilities]
    .sort((a, b) => (scoreOf(b) ?? -Infinity) - (scoreOf(a) ?? -Infinity) || a.name.localeCompare(b.name))
    .map((u) => {
      return {
        id: u.id,
        name: u.name,
        cells: [
          firstCell(u),
          ...layers.map((id) => {
            const meta = data.layers.find((l) => l.id === id)!;
            return formatLayerValue(meta, utilityLayerSummary(u, countiesByFips, id).value, utilityLayerQuality(u, countiesByFips, id));
          }),
        ],
      };
    });
}

const layerLabel = (data: UtilityMapData, id: LayerId) => data.layers.find((l) => l.id === id)?.label ?? id;

export function describeView(state: ViewState, input: DescribeInput): ViewDescription {
  const core = describeCore(state, input);
  return {
    ...core,
    labelFor: core.labelFor ?? ((county: CountyRecord) => paintLabel(core.context, core.stateFor(county).level)),
  };
}

function describeCore(
  state: ViewState,
  input: DescribeInput,
): Omit<ViewDescription, "labelFor"> & { labelFor?: ViewDescription["labelFor"] } {
  const { data, model, utilitiesById, countiesByFips } = input;
  const byScore = (u: UtilityRecord) => model.utility.get(u.id)?.score ?? null;
  // Hazard patterns rank utilities by their average Texas rank across the picked hazards.
  const averageRank = (u: UtilityRecord) => {
    const score = byScore(u);
    return score == null ? "—" : `${Math.round(score * 100)}%`;
  };
  const scoreTable = (caption: string, layers: LayerId[]): TableSpec => ({
    caption: `All ${data.utilities.length} utilities by average Texas rank across ${caption} (customer-weighted)`,
    rowKind: "utility",
    columns: ["Average Texas rank", ...layers.map((id) => layerLabel(data, id))],
    primary: 0,
    rows: utilityRows(input, layers, averageRank, byScore),
  });
  const utilityCount = data.utilities.length;
  const pick = "Select one to open its score card.";
  // Explained with the top row's own number, so the example matches what's on screen.
  const exposureRead = (table: TableSpec) => {
    const top = table.rows[0];
    const value = top?.cells[table.primary];
    return value && value !== "—"
      ? `The percentage is the average Texas rank: ${top.name} at ${value} means its counties have been more exposed than about ${value} of Texas counties. ${pick}`
      : pick;
  };

  if (stormNow(state)) {
    const storm = input.storms.find((s) => s.name === state.storm);
    const title = storm ? `${storm.name} ${storm.start.slice(0, 4)}` : state.storm!;
    const byFips = new Map((storm?.counties ?? []).map((c) => [c.fips, c]));
    return {
      caption: { title, qualifier: "Peak customers without power (%) · EAGLE-I outage records" },
      intro: {
        eyebrow: "Explore hazards · Past storm",
        title: `Where did ${title} knock out power?`,
        lead: `Every county with outages during ${title}, from EAGLE-I outage records, largest share of customers out first.`,
        read: "Peak share out is the most customers without power at one time, as a share of the county's customers. Select a county to open its score card.",
      },
      legend: storm
        ? {
            kind: "sequential",
            title: `${title}: peak share of customers out`,
            colors: SCORE_COLORS,
            labels: ["< 5%", "5–15%", "15–30%", "30–50%", "50%+"],
            note: "Light grey: no outage event labeled with this storm.",
            extra: {
              color: SHARE_UNKNOWN_COLOR,
              label: "Customers out, share unknown: more were out than the county's modeled customer count",
            },
          }
        : {
            kind: "empty",
            message:
              input.stormsStatus === "failed"
                ? "Couldn't load storm records. Refresh the page, or pick Historical patterns."
                : input.stormsStatus === "ok"
                  ? `${state.storm} isn't in this release. Pick another storm or Historical patterns.`
                  : "Loading storm records.",
          },
      colors: [...SCORE_COLORS, SHARE_UNKNOWN_COLOR],
      context: { kind: "storm", name: title },
      stateFor: withSelection(state, utilitiesById, (c) => {
        const hit = byFips.get(c.fips);
        if (!hit) return null;
        return hit.peak_out_pct == null ? SHARE_UNKNOWN_LEVEL : outageShareLevel(hit.peak_out_pct);
      }),
      table: {
        caption: `${title} · counties with outages, largest share out first`,
        rowKind: "county",
        columns: ["Peak share out", "Peak customers out", "Customer-hours out"],
        primary: 0,
        rows: [...(storm?.counties ?? [])]
          // Known shares first, largest first; then unknown shares by customers out.
          .sort(
            (a, b) =>
              Number(a.peak_out_pct == null) - Number(b.peak_out_pct == null) ||
              (b.peak_out_pct ?? 0) - (a.peak_out_pct ?? 0) ||
              b.peak_out - a.peak_out,
          )
          .map((c) => ({
            id: c.fips,
            name: `${countiesByFips.get(c.fips)?.name ?? c.fips} County`,
            cells: [
              c.peak_out_pct == null ? "Unknown (customer count below the peak)" : `${whole.format(c.peak_out_pct)}%`,
              whole.format(c.peak_out),
              whole.format(c.customer_hours),
            ],
          })),
      },
    };
  }

  if (patternsNow(state)) {
    const picks = state.hazards;
    const names = picks.map((h) => HAZARDS[h].label);
    if (picks.length === 0) {
      return {
        caption: { title: "Explore hazards", qualifier: "Pick a hazard to color the map" },
        intro: {
          eyebrow: "Explore hazards · Historical patterns",
          title: "Which hazards do you want to compare?",
          lead: "Pick one or more hazards on the left to see where Texas has been most exposed to them in the past.",
          read: "One hazard shows its fifths, two show how they overlap, three or more count how many each county ranks high on.",
        },
        legend: { kind: "empty", message: "Pick a hazard to color the map." },
        colors: PLAIN_COLORS,
        context: { kind: "plain", label: "Pick a hazard to color the map" },
        stateFor: withSelection(state, utilitiesById, () => null),
        table: { caption: "Pick a hazard to list utilities.", rowKind: "utility", columns: [], primary: 0, rows: [] },
      };
    }
    const historical = "Historical relative exposure";
    if (picks.length === 1) {
      const style = HAZARDS[picks[0]];
      const table = scoreTable(style.label, picks);
      return {
        caption: { title: style.label, qualifier: `${historical} · Texas rank in fifths` },
        intro: {
          eyebrow: "Explore hazards · Historical patterns",
          title: `Where is ${style.label.toLowerCase()} exposure highest?`,
          lead: `All ${utilityCount} utilities ranked by how exposed their counties have been to ${style.label.toLowerCase()} in past weather records, compared with the rest of Texas. Darker counties on the map rank higher.`,
          read: exposureRead(table),
        },
        legend: {
          kind: "sequential",
          title: `${style.label}: Texas rank, in fifths`,
          colors: style.ramp,
          labels: FIFTHS,
          note: data.layers.find((l) => l.id === picks[0])?.unit ?? undefined,
        },
        colors: style.ramp,
        context: { kind: "hazard", label: style.label },
        stateFor: withSelection(state, utilitiesById, (c) => hazardLevel(c.ranks[picks[0]])),
        table,
      };
    }
    if (picks.length === 2) {
      const table = scoreTable(`${names[0]} and ${names[1]}`, picks);
      return {
        caption: { title: `${names[0]} × ${names[1]}`, qualifier: `${historical} · each in Texas thirds` },
        intro: {
          eyebrow: "Explore hazards · Historical patterns",
          title: `Where do ${names[0].toLowerCase()} and ${names[1].toLowerCase()} overlap?`,
          lead: `The map shows each county's mix of the two, from past weather records: the darkest corner of the key is high on both. The list ranks all ${utilityCount} utilities by their average exposure across both.`,
          read: exposureRead(table),
        },
        legend: { kind: "bivariate", first: names[0], second: names[1] },
        colors: BIVARIATE_COLORS,
        context: { kind: "bivariate", first: names[0], second: names[1] },
        stateFor: withSelection(state, utilitiesById, (c) => bivariateClass(c.ranks[picks[0]], c.ranks[picks[1]])),
        table,
      };
    }
    const table = scoreTable(names.join(", "), picks);
    return {
      caption: {
        title: `High in how many of ${picks.length} selected hazards`,
        qualifier: `${historical} (Texas top fifth), not the odds of events at the same time`,
      },
      intro: {
        eyebrow: "Explore hazards · Historical patterns",
        title: "Which places face the most hazards?",
        lead: `For each county, the map counts how many of your ${picks.length} hazards (${listOf(names.map((n) => n.toLowerCase()))}) it ranks high on: the most-exposed fifth of Texas in past weather records. Darker means more hazards. This is past exposure, not the odds of them happening together.`,
        read: `The list ranks all ${utilityCount} utilities by their overall exposure across these hazards. ${exposureRead(table)}`,
      },
      legend: {
        kind: "sequential",
        title: `Selected hazards where the county is in Texas's top fifth: ${names.join(", ")}`,
        colors: SCORE_COLORS,
        labels: ["0", "1", "2", "3", "4+"],
      },
      colors: SCORE_COLORS,
      context: { kind: "overlap", of: picks.length },
      stateFor: withSelection(state, utilitiesById, (c) => Math.min(overlapCount(c, picks), 4) + 1),
      table,
    };
  }

  if (state.question === "grid") {
    const plantsNote = state.plants ? "Circles: power plants by net summer MW (EIA-860 2024)." : undefined;
    const rows = [...data.utilities]
      .map((u) => ({ u, peak: utilityLayerSummary(u, countiesByFips, "peak_demand").value }))
      .sort((a, b) => (b.peak ?? -Infinity) - (a.peak ?? -Infinity) || a.u.name.localeCompare(b.u.name))
      .map(({ u }) => ({
        id: u.id,
        name: u.name,
        cells: GRID_LAYERS.map((id) =>
          formatLayerValue(
            data.layers.find((l) => l.id === id)!,
            utilityLayerSummary(u, countiesByFips, id).value,
            utilityLayerQuality(u, countiesByFips, id),
          ),
        ),
      }));
    const table: TableSpec = {
      caption: `All ${data.utilities.length} utilities · summer peak demand (2024) and local generation`,
      rowKind: "utility",
      columns: GRID_LAYERS.map((id) => layerLabel(data, id)),
      primary: 0,
      rows,
    };
    if (!state.demand) {
      return {
        caption: state.plants
          ? { title: "Power plants", qualifier: "Net summer capacity, MW · EIA-860 2024" }
          : { title: "Understand the grid", qualifier: "Turn on demand shading or power plants" },
        intro: {
          eyebrow: "Understand the grid",
          title: "How big is each utility's grid?",
          lead: `All ${utilityCount} utilities by estimated 2024 summer peak demand, the most power their customers drew at one time, next to the power plant capacity in their counties.`,
          read: `Bigger peaks mean more load to serve on the hottest days. Peaks for utilities that don't publish one are estimated. ${pick}`,
        },
        legend: state.plants
          ? { kind: "empty", message: "Counties are not shaded. " + plantsNote }
          : { kind: "empty", message: "Turn on demand shading or power plants." },
        colors: PLAIN_COLORS,
        context: { kind: "plain", label: "Demand shading is off" },
        stateFor: withSelection(state, utilitiesById, () => 1),
        table,
      };
    }
    return {
      caption: {
        title: "Summer peak demand (estimated)",
        qualifier: "Each utility's 2024 peak split across its counties by customers · Texas fifths",
      },
      intro: {
        eyebrow: "Understand the grid",
        title: "How big is each utility's grid?",
        lead: `All ${utilityCount} utilities by estimated 2024 summer peak demand, the most power their customers drew at one time, next to the power plant capacity in their counties.`,
        read: `Bigger peaks mean more load to serve on the hottest days. Peaks for utilities that don't publish one are estimated. ${pick}`,
      },
      legend: { kind: "sequential", title: "Estimated summer peak demand, Texas fifths", colors: GRID_COLORS, labels: FIFTHS, note: plantsNote },
      colors: GRID_COLORS,
      context: { kind: "grid" },
      stateFor: withSelection(state, utilitiesById, (c) => hazardLevel(c.ranks.peak_demand)),
      table,
    };
  }

  if (state.question === "fleet") {
    const share = `${Math.round(state.share * 100)}%`;
    const fleets = new Map(
      data.utilities.map((u) => [u.id, fleetScenario(u, countiesByFips, state.share, data.battery)]),
    );
    const utilityLevel = (id: string) => fleetLevel(fleets.get(id)?.peakShare ?? null);
    const selected = state.utility;
    return {
      caption: {
        title: `${share} Base fleet`,
        qualifier: `Share of each utility's summer peak it could supply for ${data.battery.dispatch_window_h} hours · estimate`,
      },
      intro: {
        eyebrow: "Model Base impact",
        title: `What could a ${share} Base fleet add?`,
        lead: `Suppose ${share} of each utility's owner-occupied single-family homes had one Base Core (${data.battery.kwh_per_core} kWh, ${data.battery.kw_per_core} kW, ${Math.round(data.battery.reserve_fraction * 100)}% kept for backup). All numbers are estimates.`,
        read: `The big number is the share of the utility's summer peak the fleet could cover for ${data.battery.dispatch_window_h} hours. Cores is how many homes that is; MW is the power they could supply together. ${pick}`,
      },
      legend: {
        kind: "sequential",
        title: `Share of summer peak a ${share} Base fleet could supply for ${data.battery.dispatch_window_h} h`,
        colors: FLEET_COLORS,
        labels: ["< 0.5%", "0.5–1%", "1–2%", "2–5%", "5%+"],
        note: "Grey: peak demand not known.",
      },
      colors: FLEET_COLORS,
      context: { kind: "fleet" },
      stateFor: (county) => {
        const u = selected ? utilitiesById.get(selected) : undefined;
        const inSelection = u?.counties.includes(county.fips) ?? false;
        const owner = inSelection ? selected! : county.primary_utility ?? county.utilities[0];
        return { level: utilityLevel(owner), dim: u != null && !inSelection, inSelection };
      },
      table: {
        caption: `All ${data.utilities.length} utilities · ${share} of eligible homes with one Core, estimates`,
        rowKind: "utility",
        columns: ["Cores", `MW for ${data.battery.dispatch_window_h} h`, "Share of summer peak"],
        primary: 2,
        rows: [...data.utilities]
          .sort(
            (a, b) =>
              (fleets.get(b.id)?.peakShare ?? -Infinity) - (fleets.get(a.id)?.peakShare ?? -Infinity) ||
              a.name.localeCompare(b.name),
          )
          .map((u) => {
            const f = fleets.get(u.id)!;
            return {
              id: u.id,
              name: u.name,
              cells: [
                whole.format(f.cores),
                oneDecimal.format(f.dispatchMw2h),
                f.peakShare == null ? "Peak not known" : pct.format(f.peakShare),
              ],
            };
          }),
      },
    };
  }

  // Grid Risk Index: the published 1-100 score, counties colored by their own index band.
  const levelOf = (index: number | null | undefined) => (index == null ? null : Math.min(5, Math.floor((index - 1) / 20) + 1));
  const bandOf = (index: number) => RISK_BANDS[levelOf(index)! - 1];
  const num = (value: number | null | undefined) => (value == null ? "—" : String(value));
  return {
    caption: {
      title: "Grid Risk Index",
      qualifier: "1–100 against Texas: half hazard exposure, half grid stress. Higher is more at risk.",
    },
    intro: {
      eyebrow: "Grid Risk Index",
      title: "Which Texas utilities are most at risk?",
      lead: `All ${utilityCount} utilities ranked on a 1–100 score against the rest of Texas: half weather hazards (flood, tornadoes, hail and wind, hurricanes, winter freeze, extreme heat), half grid stress (long outages, price spikes, summer peak demand).`,
      read: `Higher is more at risk, and #1 is the most at risk. The map colors each county by its own score. ${pick}`,
    },
    legend: {
      kind: "sequential",
      title: "Grid Risk Index, by county",
      colors: SCORE_COLORS,
      labels: ["1–20 Low", "21–40 Moderate", "41–60 Elevated", "61–80 High", "81–100 Severe"],
      note: "Each county against the other 253. Select a utility for its own index.",
    },
    colors: SCORE_COLORS,
    context: { kind: "index" },
    stateFor: withSelection(state, utilitiesById, (c) => levelOf(c.risk?.index)),
    labelFor: (c) =>
      c.risk?.index == null ? "Grid Risk Index: no data" : `Grid Risk Index ${c.risk.index} of 100 · ${bandOf(c.risk.index)}`,
    table: {
      caption: `All ${data.utilities.length} utilities ranked by Grid Risk Index (1 = most at risk)`,
      rowKind: "utility",
      columns: ["Grid Risk Index", "Band", "Hazard exposure", "Grid stress", "Sources"],
      primary: 0,
      rows: [...data.utilities]
        .sort(
          (a, b) =>
            (a.risk?.rank ?? Infinity) - (b.risk?.rank ?? Infinity) || a.name.localeCompare(b.name),
        )
        .map((u) => ({
          id: u.id,
          name: u.name,
          cells: [
            num(u.risk?.index),
            u.risk?.index == null ? "—" : bandOf(u.risk.index),
            num(u.risk?.hazard),
            num(u.risk?.stress),
            u.risk ? `${u.risk.sources} of ${u.risk.sources_total}` : "—",
          ],
        })),
    },
  };
}
