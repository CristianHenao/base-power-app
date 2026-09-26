import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultViewState,
  selectCounty,
  selectUtility,
  setGridLayer,
  setQuestion,
  setShare,
  showPatterns,
  showStorm,
  toggleHazard,
  viewFromUrl,
  viewToUrl,
  type ViewContext,
} from "./view.ts";
import type { LayerId, MapLayerMeta } from "./types.ts";

const IDS: LayerId[] = [
  "peak_demand", "generation", "price_spikes", "outages", "flood", "tornado",
  "severe_storm", "hurricane", "winter", "heat", "weather", "homes",
];
const LAYERS = IDS.map((id) => ({ id, available: true }) as MapLayerMeta);
const CTX: ViewContext = {
  layers: LAYERS,
  utilityIds: new Set(["austin-energy", "centerpoint"]),
  countyFips: new Set(["48453", "48201"]),
  utilityCounties: new Map([
    ["austin-energy", ["48453"]],
    ["centerpoint", ["48201", "48453"]],
  ]),
};

const start = () => defaultViewState();

test("the default view is the Grid Risk Index for all of Texas", () => {
  const s = start();
  assert.equal(s.question, "risk");
  assert.equal(s.utility, null);
  assert.equal(s.share, 0.01);
});

test("entering Explore hazards seeds Flood, never an empty map", () => {
  const s = setQuestion(start(), "hazards", CTX);
  assert.equal(s.question, "hazards");
  assert.equal(s.hazardSub, "patterns");
  assert.deepEqual(s.hazards, ["flood"]);
});

test("hazards already picked are kept when coming back to Explore hazards", () => {
  let s = setQuestion(start(), "hazards", CTX);
  s = toggleHazard(s, "tornado");
  s = setQuestion(setQuestion(s, "grid", CTX), "hazards", CTX);
  assert.deepEqual(s.hazards, ["flood", "tornado"]);
});

test("deselecting the last hazard leaves an empty selection rather than reseeding", () => {
  let s = setQuestion(start(), "hazards", CTX);
  s = toggleHazard(s, "flood");
  assert.deepEqual(s.hazards, []);
});

test("a storm replaces the patterns view and showing patterns restores the hazards as they were", () => {
  let s = toggleHazard(setQuestion(start(), "hazards", CTX), "winter");
  s = showStorm(s, "Hurricane Beryl");
  assert.equal(s.hazardSub, "storm");
  assert.equal(s.storm, "Hurricane Beryl");
  s = showPatterns(s);
  assert.equal(s.hazardSub, "patterns");
  assert.equal(s.storm, null);
  assert.deepEqual(s.hazards, ["flood", "winter"]);
});

test("toggling a hazard while a storm is shown goes back to patterns", () => {
  let s = showStorm(setQuestion(start(), "hazards", CTX), "Hurricane Beryl");
  s = toggleHazard(s, "tornado");
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
  assert.equal(viewToUrl(start()).toString(), "");
});

test("every view survives a URL round trip", () => {
  const views = [
    selectCounty(selectUtility(setShare(setQuestion(start(), "fleet", CTX), 0.05), "austin-energy"), "48453"),
    toggleHazard(setQuestion(start(), "hazards", CTX), "tornado"),
    toggleHazard(setQuestion(start(), "hazards", CTX), "flood"),
    showStorm(setQuestion(start(), "hazards", CTX), "Hurricane Beryl"),
    setGridLayer(setQuestion(start(), "grid", CTX), "plants", false),
    selectUtility(start(), "centerpoint"),
  ];
  for (const view of views) {
    const url = viewToUrl(view);
    assert.deepEqual(viewFromUrl(new URLSearchParams(url.toString()), CTX), view, url.toString());
  }
});

test("old links open the matching view; screening links open the Grid Risk Index", () => {
  assert.equal(viewFromUrl(new URLSearchParams("mode=risk"), CTX).question, "risk");
  assert.equal(viewFromUrl(new URLSearchParams("q=opportunities&scenario=hurricane"), CTX).question, "risk");
  assert.equal(viewFromUrl(new URLSearchParams("mode=fleet"), CTX).question, "fleet");
  assert.deepEqual(viewFromUrl(new URLSearchParams("mode=hazards"), CTX).hazards, ["flood"]);
});

test("invalid URL values fall back to defaults", () => {
  const s = viewFromUrl(
    new URLSearchParams("q=nope&share=7&utility=ghost&county=99999&hazards=flood,bogus,weather"),
    CTX,
  );
  assert.equal(s.question, "risk");
  assert.equal(s.share, 0.01);
  assert.equal(s.utility, null);
  assert.equal(s.county, null);
  assert.deepEqual(s.hazards, ["flood"]);
});

test("a county without its utility is dropped", () => {
  assert.equal(viewFromUrl(new URLSearchParams("county=48453"), CTX).county, null);
});

test("a county the utility doesn't serve is dropped from a link", () => {
  const s = viewFromUrl(new URLSearchParams("utility=austin-energy&county=48201"), CTX);
  assert.equal(s.utility, "austin-energy");
  assert.equal(s.county, null);
});

test("opening Explore hazards by link initializes the same way as navigating there", () => {
  assert.deepEqual(viewFromUrl(new URLSearchParams("q=hazards"), CTX), setQuestion(start(), "hazards", CTX));
});
