import { HAZARD_IDS, isHazard, type HazardId } from "./hazard-style.ts";
import type { LayerId, MapLayerMeta } from "./types.ts";

/**
 * The one state behind the utility map (docs/superpowers/specs/2026-09-26-utility-map-coherent-views-design.md).
 * The question picks what the map answers; each question keeps its own settings, so switching
 * questions never erases another's. Controls, map, legend, details, table and URL all read this.
 */

export type Question = "risk" | "hazards" | "grid" | "fleet";

export const QUESTIONS: { id: Question; label: string; question: string }[] = [
  { id: "risk", label: "Grid Risk Index", question: "How at risk is each grid?" },
  { id: "hazards", label: "Explore hazards", question: "What happened here?" },
  { id: "grid", label: "Understand the grid", question: "How large is the system?" },
  { id: "fleet", label: "Model Base impact", question: "What could a fleet add?" },
];

export const FLEET_SHARES = [0.01, 0.05, 0.1] as const;
export type FleetShare = (typeof FLEET_SHARES)[number];

export type ViewState = {
  question: Question;
  /** Explore hazards: long-term patterns for the picked hazards, or one past storm. */
  hazardSub: "patterns" | "storm";
  hazards: HazardId[];
  storm: string | null;
  /** Understand the grid: what is drawn. */
  demand: boolean;
  plants: boolean;
  /** Model Base impact: share of eligible homes with one Core. */
  share: FleetShare;
  utility: string | null;
  county: string | null;
};

export type ViewContext = {
  layers: Pick<MapLayerMeta, "id" | "available">[];
  utilityIds: Set<string>;
  countyFips: Set<string>;
  /** Counties each utility serves; a linked county must belong to the linked utility. */
  utilityCounties?: Map<string, string[]>;
};

/** Superseded by the event-based hazards; never offered. */
const RETIRED: LayerId[] = ["weather"];

export function defaultViewState(): ViewState {
  return {
    question: "risk",
    hazardSub: "patterns",
    hazards: [],
    storm: null,
    demand: true,
    plants: true,
    share: 0.01,
    utility: null,
    county: null,
  };
}

function availableHazards(ctx: ViewContext): HazardId[] {
  return HAZARD_IDS.filter((h) => ctx.layers.some((l) => l.id === h && l.available));
}

export function setQuestion(state: ViewState, question: Question, ctx: ViewContext): ViewState {
  if (question !== "hazards" || state.hazards.length > 0 || state.hazardSub === "storm") {
    return { ...state, question };
  }
  const available = availableHazards(ctx);
  const seed = available.includes("flood") ? ["flood" as const] : available.slice(0, 1);
  return { ...state, question, hazards: seed };
}

export function toggleHazard(state: ViewState, hazard: HazardId): ViewState {
  const hazards = state.hazards.includes(hazard)
    ? state.hazards.filter((h) => h !== hazard)
    : [...state.hazards, hazard];
  return { ...state, hazards, hazardSub: "patterns", storm: null };
}

export function showStorm(state: ViewState, storm: string): ViewState {
  return { ...state, hazardSub: "storm", storm };
}

export function showPatterns(state: ViewState): ViewState {
  return { ...state, hazardSub: "patterns", storm: null };
}

export function setGridLayer(state: ViewState, layer: "demand" | "plants", on: boolean): ViewState {
  return { ...state, [layer]: on };
}

export function setShare(state: ViewState, share: FleetShare): ViewState {
  return { ...state, share };
}

export function selectUtility(state: ViewState, utility: string | null): ViewState {
  return { ...state, utility, county: null };
}

export function selectCounty(state: ViewState, county: string | null): ViewState {
  return { ...state, county };
}

/** Old links: ?mode= (first release) and ?q=opportunities (screening score) open the Grid Risk Index. */
const LEGACY_QUESTIONS: Record<string, Question> = {
  risk: "risk",
  opportunities: "risk",
  hazards: "hazards",
  grid: "grid",
  fleet: "fleet",
};

/** Only what differs from the default view, so a plain link stays plain. */
export function viewToUrl(state: ViewState): URLSearchParams {
  const base = defaultViewState();
  const url = new URLSearchParams();
  if (state.question !== base.question) url.set("q", state.question);
  if (state.hazards.length) url.set("hazards", state.hazards.join(","));
  else if (state.question === "hazards" && state.hazardSub === "patterns") url.set("hazards", "none");
  if (state.hazardSub === "storm" && state.storm) {
    url.set("sub", "storm");
    url.set("storm", state.storm);
  }
  if (!state.demand) url.set("demand", "0");
  if (!state.plants) url.set("plants", "0");
  if (state.share !== base.share) url.set("share", String(Math.round(state.share * 100)));
  if (state.utility) url.set("utility", state.utility);
  if (state.utility && state.county) url.set("county", state.county);
  return url;
}

export function viewFromUrl(search: URLSearchParams, ctx: ViewContext): ViewState {
  let state = defaultViewState();
  const offered = new Set(ctx.layers.filter((l) => l.available && !RETIRED.includes(l.id)).map((l) => l.id));

  const hazardParam = search.get("hazards");
  const explicitNone = hazardParam === "none";
  if (hazardParam && !explicitNone) {
    const seen = new Set<HazardId>();
    for (const id of hazardParam.split(",")) {
      if (isHazard(id as LayerId) && offered.has(id as LayerId)) seen.add(id as HazardId);
    }
    state = { ...state, hazards: [...seen] };
  }
  const storm = search.get("storm");
  if (search.get("sub") === "storm" && storm) state = showStorm(state, storm);

  if (search.get("demand") === "0") state = setGridLayer(state, "demand", false);
  if (search.get("plants") === "0") state = setGridLayer(state, "plants", false);
  const share = FLEET_SHARES.find((s) => String(Math.round(s * 100)) === search.get("share"));
  if (share) state = setShare(state, share);

  const utility = search.get("utility");
  if (utility && ctx.utilityIds.has(utility)) {
    state = selectUtility(state, utility);
    const county = search.get("county");
    const served = ctx.utilityCounties?.get(utility);
    if (county && ctx.countyFips.has(county) && (!served || served.includes(county))) {
      state = selectCounty(state, county);
    }
  }

  const question = LEGACY_QUESTIONS[search.get("q") ?? search.get("mode") ?? ""];
  if (question) state = explicitNone ? { ...state, question } : setQuestion(state, question, ctx);
  return state;
}
