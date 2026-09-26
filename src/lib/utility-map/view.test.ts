import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultViewState,
  selectableFactors,
  selectCounty,
  selectScenario,
  selectUtility,
  setGridLayer,
  setQuestion,
  setShare,
  showPatterns,
  showStorm,
  toggleFactor,
  toggleHazard,
  viewFromUrl,
  viewToUrl,
  type ViewContext,
} from "./view.ts";
import type { LayerId, MapLayerMeta, Preset } from "./types.ts";

const PRESETS: Preset[] = [
  { id: "winter", label: "Winter freeze", layers: ["winter", "outages", "price_spikes", "homes"] },
  { id: "hurricane", label: "Hurricane season", layers: ["hurricane", "flood", "outages", "homes"] },
  { id: "summer", label: "Summer peak", layers: ["heat", "peak_demand", "price_spikes", "homes"] },
];
const IDS: LayerId[] = [
  "peak_demand", "generation", "price_spikes", "outages", "flood", "tornado",
  "severe_storm", "hurricane", "winter", "heat", "weather", "homes",
];
const LAYERS = IDS.map((id) => ({ id, available: true }) as MapLayerMeta);
const CTX: ViewContext = {
  presets: PRESETS,
  layers: LAYERS,
  utilityIds: new Set(["austin-energy", "centerpoint"]),
  countyFips: new Set(["48453", "48201"]),
  utilityCounties: new Map([
    ["austin-energy", ["48453"]],
    ["centerpoint", ["48201", "48453"]],
  ]),
};

const start = () => defaultViewState(PRESETS);

test("the default view is the winter scenario in Find opportunities", () => {
  const s = start();
  assert.equal(s.question, "opportunities");
  assert.equal(s.scenario, "winter");
  assert.deepEqual(s.factors, ["winter", "outages", "price_spikes", "homes"]);
  assert.equal(s.share, 0.01);
});

test("the FEMA weather composite is not offered as a factor", () => {
  assert.ok(!selectableFactors(LAYERS).includes("weather"));
  assert.ok(selectableFactors(LAYERS).includes("flood"));
});

test("a scenario sets its factors; toggling a factor marks the view customized, then matches again", () => {
  const s = selectScenario(start(), PRESETS[1]);
  assert.equal(s.scenario, "hurricane");
  assert.deepEqual(s.factors, ["hurricane", "flood", "outages", "homes"]);
  const custom = toggleFactor(s, "tornado", true, CTX);
  assert.equal(custom.scenario, null);
  assert.equal(toggleFactor(custom, "tornado", false, CTX).scenario, "hurricane");
});

test("entering Explore hazards seeds the scenario's hazards, never an empty map", () => {
  const s = setQuestion(selectScenario(start(), PRESETS[1]), "hazards", CTX);
  assert.equal(s.question, "hazards");
  assert.equal(s.hazardSub, "patterns");
  assert.deepEqual(s.hazards, ["hurricane", "flood"]);
});

test("a scenario with no hazards seeds Flood", () => {
  const noHazards: Preset = { id: "grid", label: "Grid", layers: ["peak_demand", "homes"] };
  const s = setQuestion(selectScenario(start(), noHazards), "hazards", CTX);
  assert.deepEqual(s.hazards, ["flood"]);
});

test("hazards already picked are kept when coming back to Explore hazards", () => {
  let s = setQuestion(start(), "hazards", CTX);
  s = toggleHazard(s, "tornado");
  s = setQuestion(setQuestion(s, "grid", CTX), "hazards", CTX);
  assert.deepEqual(s.hazards, ["winter", "tornado"]);
});

test("deselecting the last hazard leaves an empty selection rather than reseeding", () => {
  let s = setQuestion(start(), "hazards", CTX);
  s = toggleHazard(s, "winter");
  assert.deepEqual(s.hazards, []);
});

test("a storm replaces the patterns view and showing patterns restores the hazards as they were", () => {
  let s = setQuestion(start(), "hazards", CTX);
  s = showStorm(s, "Hurricane Beryl");
  assert.equal(s.hazardSub, "storm");
  assert.equal(s.storm, "Hurricane Beryl");
  assert.deepEqual(s.hazards, ["winter"]);
  s = showPatterns(s);
  assert.equal(s.hazardSub, "patterns");
  assert.equal(s.storm, null);
  assert.deepEqual(s.hazards, ["winter"]);
});

test("toggling a hazard while a storm is shown goes back to patterns", () => {
  let s = showStorm(setQuestion(start(), "hazards", CTX), "Hurricane Beryl");
  s = toggleHazard(s, "flood");
  assert.equal(s.hazardSub, "patterns");
  assert.equal(s.storm, null);
});

test("grid switches and fleet share are independent settings", () => {
  let s = setGridLayer(start(), "demand", false);
  assert.equal(s.demand, false);
  assert.equal(s.plants, true);
  s = setShare(s, 0.05);
  assert.equal(s.share, 0.05);
});

test("selecting a utility clears the county; selecting a county keeps the utility", () => {
  let s = selectCounty(selectUtility(start(), "centerpoint"), "48201");
  assert.equal(s.utility, "centerpoint");
  assert.equal(s.county, "48201");
  s = selectUtility(s, "austin-energy");
  assert.equal(s.county, null);
});

test("the default view writes an empty query", () => {
  assert.equal(viewToUrl(start(), PRESETS).toString(), "");
});

test("every view survives a URL round trip", () => {
  const views = [
    selectCounty(selectUtility(setShare(setQuestion(start(), "fleet", CTX), 0.05), "austin-energy"), "48453"),
    toggleHazard(setQuestion(selectScenario(start(), PRESETS[1]), "hazards", CTX), "tornado"),
    showStorm(setQuestion(start(), "hazards", CTX), "Hurricane Beryl"),
    setGridLayer(setQuestion(start(), "grid", CTX), "plants", false),
    toggleFactor(start(), "flood", true, CTX),
  ];
  for (const view of views) {
    const url = viewToUrl(view, PRESETS);
    assert.deepEqual(viewFromUrl(new URLSearchParams(url.toString()), CTX), view, url.toString());
  }
});

test("a legacy ?mode= link still opens the matching view", () => {
  assert.equal(viewFromUrl(new URLSearchParams("mode=risk"), CTX).question, "opportunities");
  assert.equal(viewFromUrl(new URLSearchParams("mode=fleet"), CTX).question, "fleet");
  const hazards = viewFromUrl(new URLSearchParams("mode=hazards"), CTX);
  assert.equal(hazards.question, "hazards");
  assert.deepEqual(hazards.hazards, ["winter"]);
});

test("invalid URL values fall back to defaults", () => {
  const s = viewFromUrl(
    new URLSearchParams("q=nope&scenario=zzz&share=7&utility=ghost&county=99999&hazards=flood,bogus,weather"),
    CTX,
  );
  assert.equal(s.question, "opportunities");
  assert.equal(s.scenario, "winter");
  assert.equal(s.share, 0.01);
  assert.equal(s.utility, null);
  assert.equal(s.county, null);
  assert.deepEqual(s.hazards, ["flood"]);
});

test("a county without its utility is dropped", () => {
  assert.equal(viewFromUrl(new URLSearchParams("county=48453"), CTX).county, null);
});

test("opening Explore hazards by link initializes the same way as navigating there", () => {
  const byLink = viewFromUrl(new URLSearchParams("q=hazards"), CTX);
  const byNav = setQuestion(start(), "hazards", CTX);
  assert.deepEqual(byLink, byNav);
});

test("a county the utility doesn't serve is dropped from a link", () => {
  const s = viewFromUrl(new URLSearchParams("utility=austin-energy&county=48201"), CTX);
  assert.equal(s.utility, "austin-energy");
  assert.equal(s.county, null);
});
