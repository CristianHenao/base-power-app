import { FLEET_COLORS, fleetLevel, fleetScenario } from "./fleet.ts";
import { formatLayerValue, type PaintContext } from "./format.ts";
import {
  BIVARIATE_COLORS,
  HAZARDS,
  bivariateClass,
  hazardLevel,
  isHazard,
  outageShareLevel,
  overlapCount,
  type HazardId,
  type SpotlightStorm,
} from "./hazard-style.ts";
import {
  LEVEL_COLORS,
  LEVEL_LABELS,
  offerLabel,
  utilityLayerQuality,
  utilityLayerSummary,
  type Level,
  type ScoreModel,
} from "./scoring.ts";
import { countyPaintState, type CountyPaintState } from "./selection.ts";
import type { CountyRecord, LayerId, UtilityMapData, UtilityRecord } from "./types.ts";
import type { ViewState } from "./view.ts";

/**
 * Everything the screen says about the current view, from one function: caption, legend,
 * county fill, detail rows and table. The map, tooltip, details and table all read this,
 * so they can't describe different questions.
 */

export type LegendSpec =
  | { kind: "sequential"; title: string; colors: readonly string[]; labels: readonly string[]; note?: string }
  | { kind: "bivariate"; first: string; second: string }
  | { kind: "empty"; message: string };

export type TableSpec = {
  caption: string;
  rowKind: "utility" | "county";
  columns: string[];
  rows: { id: string; name: string; cells: string[] }[];
};

export type ViewDescription = {
  caption: { title: string; qualifier: string };
  legend: LegendSpec;
  colors: readonly string[];
  context: PaintContext;
  stateFor: (county: CountyRecord) => CountyPaintState;
  table: TableSpec;
};

export type DescribeInput = {
  data: UtilityMapData;
  model: ScoreModel;
  countiesByFips: Map<string, CountyRecord>;
  utilitiesById: Map<string, UtilityRecord>;
  storms: SpotlightStorm[];
};

const SCORE_COLORS = [LEVEL_COLORS[1], LEVEL_COLORS[2], LEVEL_COLORS[3], LEVEL_COLORS[4], LEVEL_COLORS[5]] as const;
/** Blue ramp for peak demand, distinct from the orange screening score. */
export const GRID_COLORS = ["#e6edf3", "#bccddb", "#8aa6bf", "#557da0", "#07314b"] as const;
const PLAIN_COLORS = ["#f0eeeb", "#f0eeeb", "#f0eeeb", "#f0eeeb", "#f0eeeb"] as const;
const FIFTHS = ["Lowest", "", "Middle", "", "Top fifth"];
const GRID_LAYERS: LayerId[] = ["peak_demand", "generation"];
const FLEET_LAYERS: LayerId[] = ["peak_demand", "homes"];
const TRACKED: HazardId[] = ["tornado", "hurricane", "severe_storm"];

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
  return patternsNow(state) ? state.hazards : state.factors;
}

/** The layer rows the details show, the same ones the table lists. */
export function detailLayers(state: ViewState): LayerId[] {
  if (state.question === "opportunities") return state.factors;
  if (stormNow(state)) return [];
  if (patternsNow(state)) return state.hazards;
  if (state.question === "grid") return GRID_LAYERS;
  return FLEET_LAYERS;
}

export function detailHeading(state: ViewState): string {
  if (state.question === "opportunities") return "What drives the score";
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
    : state.question === "opportunities"
      ? (state.factors.filter(isHazard) as HazardId[])
      : [];
  if (scope.length === 0) return null;
  const high = scope.filter((h) => (county.ranks[h] ?? 0) >= 0.8);
  const noun = patternsNow(state) ? "selected hazards" : "hazard factors";
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
    flood: patterns
      ? state.hazards.includes("flood")
      : state.question === "opportunities" && state.factors.includes("flood"),
    view3d: state.question === "opportunities",
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
  levelOf: (u: UtilityRecord) => number | null,
  scoreOf: (u: UtilityRecord) => number | null,
): TableSpec["rows"] {
  const { data, countiesByFips } = input;
  return [...data.utilities]
    .sort((a, b) => (scoreOf(b) ?? -Infinity) - (scoreOf(a) ?? -Infinity) || a.name.localeCompare(b.name))
    .map((u) => {
      const level = levelOf(u);
      return {
        id: u.id,
        name: u.name,
        cells: [
          level == null ? "—" : `${level} · ${LEVEL_LABELS[level as Level]}`,
          offerLabel(u),
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
  const { data, model, utilitiesById, countiesByFips } = input;
  const byScore = (u: UtilityRecord) => model.utility.get(u.id)?.score ?? null;
  const byLevel = (u: UtilityRecord) => model.utility.get(u.id)?.level ?? null;
  const scoreTable = (caption: string, layers: LayerId[]): TableSpec => ({
    caption: `All ${data.utilities.length} utilities · ${caption}`,
    rowKind: "utility",
    columns: ["Level", "Base offer", ...layers.map((id) => layerLabel(data, id))],
    rows: utilityRows(input, layers, byLevel, byScore),
  });

  if (stormNow(state)) {
    const storm = input.storms.find((s) => s.name === state.storm);
    const title = storm ? `${storm.name} ${storm.start.slice(0, 4)}` : state.storm!;
    const byFips = new Map((storm?.counties ?? []).map((c) => [c.fips, c]));
    return {
      caption: { title, qualifier: "Peak customers without power (%) · EAGLE-I outage records" },
      legend: storm
        ? {
            kind: "sequential",
            title: `${title}: peak share of customers out`,
            colors: SCORE_COLORS,
            labels: ["< 5%", "5–15%", "15–30%", "30–50%", "50%+"],
            note: "Grey: no outage event labeled with this storm.",
          }
        : { kind: "empty", message: "Loading storm records." },
      colors: SCORE_COLORS,
      context: { kind: "storm", name: title },
      stateFor: withSelection(state, utilitiesById, (c) => {
        const hit = byFips.get(c.fips);
        return hit ? outageShareLevel(hit.peak_out_pct) : null;
      }),
      table: {
        caption: `${title} · counties with outages, largest share out first`,
        rowKind: "county",
        columns: ["Peak share out", "Peak customers out", "Customer-hours out"],
        rows: [...(storm?.counties ?? [])]
          .sort((a, b) => b.peak_out_pct - a.peak_out_pct)
          .map((c) => ({
            id: c.fips,
            name: `${countiesByFips.get(c.fips)?.name ?? c.fips} County`,
            cells: [`${whole.format(c.peak_out_pct)}%`, whole.format(c.peak_out), whole.format(c.customer_hours)],
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
        legend: { kind: "empty", message: "Pick a hazard to color the map." },
        colors: PLAIN_COLORS,
        context: { kind: "plain", label: "Pick a hazard to color the map" },
        stateFor: withSelection(state, utilitiesById, () => null),
        table: { caption: "Pick a hazard to list utilities.", rowKind: "utility", columns: [], rows: [] },
      };
    }
    const historical = "Historical relative exposure";
    if (picks.length === 1) {
      const style = HAZARDS[picks[0]];
      return {
        caption: { title: style.label, qualifier: `${historical} · Texas rank in fifths` },
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
        table: scoreTable(style.label, picks),
      };
    }
    if (picks.length === 2) {
      return {
        caption: { title: `${names[0]} × ${names[1]}`, qualifier: `${historical} · each in Texas thirds` },
        legend: { kind: "bivariate", first: names[0], second: names[1] },
        colors: BIVARIATE_COLORS,
        context: { kind: "bivariate", first: names[0], second: names[1] },
        stateFor: withSelection(state, utilitiesById, (c) => bivariateClass(c.ranks[picks[0]], c.ranks[picks[1]])),
        table: scoreTable(`${names[0]} and ${names[1]}`, picks),
      };
    }
    return {
      caption: {
        title: `High in how many of ${picks.length} selected hazards`,
        qualifier: `${historical} (Texas top fifth), not the odds of events at the same time`,
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
      table: scoreTable(names.join(", "), picks),
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
      rows,
    };
    if (!state.demand) {
      return {
        caption: state.plants
          ? { title: "Power plants", qualifier: "Net summer capacity, MW · EIA-860 2024" }
          : { title: "Understand the grid", qualifier: "Turn on demand shading or power plants" },
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

  // Find opportunities: the screening score over the scenario's factors.
  const factors = state.factors;
  if (factors.length === 0) {
    return {
      caption: { title: "Screening score", qualifier: "Pick at least one factor" },
      legend: { kind: "empty", message: "Pick at least one factor to rank utilities." },
      colors: PLAIN_COLORS,
      context: { kind: "plain", label: "Pick at least one factor" },
      stateFor: withSelection(state, utilitiesById, () => null),
      table: { caption: "Pick at least one factor to list utilities.", rowKind: "utility", columns: [], rows: [] },
    };
  }
  const names = factors.map((id) => layerLabel(data, id));
  return {
    caption: {
      title: "Screening score",
      qualifier: `Average Texas rank of ${factors.length} factors: ${names.join(", ")}. Not an outage forecast.`,
    },
    legend: {
      kind: "sequential",
      title: "Screening level (Texas fifths)",
      colors: SCORE_COLORS,
      labels: ["1 Low", "2 Moderate", "3 Elevated", "4 High", "5 Very high"],
      note: factors.includes("price_spikes")
        ? "Price spikes apply only inside ERCOT, so utilities outside it are leveled among themselves."
        : undefined,
    },
    colors: SCORE_COLORS,
    context: { kind: "risk" },
    stateFor: (county) => countyPaintState(county, utilitiesById, state.utility, model),
    table: scoreTable(names.join(", "), factors),
  };
}
