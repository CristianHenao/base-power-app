import assert from "node:assert/strict";
import { test } from "node:test";
import { chatSuggestions, statewideFacts, viewFacts } from "./chat-facts.ts";
import type { SpotlightStorm } from "./hazard-style.ts";
import type { CountyRecord, LayerId, MapLayerMeta, RiskIndex, UtilityMapData, UtilityRecord } from "./types.ts";
import { defaultViewState, selectCounty, selectUtility, setQuestion, setShare, showStorm, type ViewContext } from "./view.ts";

const IDS: LayerId[] = ["peak_demand", "generation", "price_spikes", "outages", "flood", "tornado", "severe_storm", "hurricane", "winter", "heat", "homes"];
const LAYERS = IDS.map((id) => ({ id, label: id, unit: "per yr", method: `method for ${id}`, available: true, group: "hazard", coverage: { ok: 2, missing: 0, not_applicable: 0 } }) as unknown as MapLayerMeta);
const risk = (index: number, rank: number, of: number) =>
  ({ index, level: 5, band: "Severe", rank, of, hazard: 74, stress: 83, raw: 0.634333, sources: 9, sources_total: 9 }) as RiskIndex;
const county = (fips: string, name: string, index: number, rank: number): CountyRecord => ({
  fips, name, utilities: ["cnp"], primary_utility: "cnp", customers: 1_234_567, load_zone: null, load_zone_method: null,
  grid_status: "ercot", centroid: [0, 0],
  values: Object.fromEntries(IDS.map((id) => [id, 4.8])) as CountyRecord["values"],
  ranks: Object.fromEntries(IDS.map((id) => [id, 0.9])) as CountyRecord["ranks"],
  quality: Object.fromEntries(IDS.map((id) => [id, "ok"])) as CountyRecord["quality"],
  risk: risk(index, rank, 2),
});
const HARRIS = county("48201", "Harris", 95, 1);
const TRAVIS = county("48453", "Travis", 40, 2);
const CNP = {
  id: "cnp", name: "CenterPoint Energy", counties: ["48201", "48453"], customers: 2_700_000, eligible_homes: 900_000,
  county_weights: [{ fips: "48201", customers_est: 2_000_000, share: 1 }, { fips: "48453", customers_est: 700_000, share: 0.2 }],
  grid_stats: { summer_peak_mw: 20697, winter_peak_mw: null, sales_mwh: null, residential_mwh: null, peak_source: "eia861" },
  risk: risk(98, 4, 150),
} as unknown as UtilityRecord;
const DATA = {
  release_id: "2026-09-26-f7c399ec", as_of: "2026-09-26", data_mode: "partial", note: "Partial release.",
  layers: LAYERS, presets: [], scoring: { risk_index: "Grid Risk Index 1-100: half hazard, half stress." },
  battery: { kwh_per_core: 39.2, kw_per_core: 20, reserve_fraction: 0.2, backup_hours_assumed: 12, dispatch_window_h: 2 },
  sources: [{ id: "eaglei", name: "EAGLE-I outage records", url: "https://example" }],
  live: { status: "ok", as_of: null, ercot: null, alerts: [] }, counties: [HARRIS, TRAVIS], utilities: [CNP],
} as unknown as UtilityMapData;
const BERYL: SpotlightStorm = {
  name: "Hurricane Beryl", start: "2024-07-08", end: "2024-07-15", source: null, note: null, track_storm_id: null,
  counties: [{ fips: "48201", peak_out: 1_660_703, peak_out_pct: 91, customer_hours: 137_454_626 }],
};
const CTX: ViewContext = { layers: LAYERS, utilityIds: new Set(["cnp"]), countyFips: new Set(["48201", "48453"]) };

test("the statewide facts list every utility and county with its index, plus methods, storms and Base facts", () => {
  const facts = statewideFacts(DATA, [BERYL]);
  for (const id of ["cnp", "48201", "48453"]) assert.match(facts, new RegExp(`\\b${id}\\b`));
  assert.match(facts, /CenterPoint Energy/);
  assert.match(facts, /Harris County/);
  assert.match(facts, /Hurricane Beryl/);
  assert.match(facts, /1,660,703/);
  assert.match(facts, /half hazard, half stress/);
  assert.match(facts, /39\.2 kWh/);
  assert.match(facts, /EAGLE-I outage records/);
  assert.doesNotMatch(facts, /0\.634333/); // the raw score is internal, not a fact to quote
});

test("the view facts say what's on screen and give the selected place in full", () => {
  const view = selectUtility(defaultViewState(), "cnp");
  const facts = viewFacts(DATA, [BERYL], view);
  assert.match(facts, /Grid Risk Index/);
  assert.match(facts, /Selected utility: CenterPoint Energy \(cnp\)/);
  assert.match(facts, /98/);
  assert.match(facts, /20,697 MW/);

  const county = viewFacts(DATA, [BERYL], selectCounty(selectUtility(defaultViewState(), "cnp"), "48201"));
  assert.match(county, /Selected county: Harris County \(48201\)/);
});

test("the fleet view gives that utility's fleet numbers at the chosen share", () => {
  const view = selectUtility(setShare(setQuestion(defaultViewState(), "fleet", CTX), 0.05), "cnp");
  assert.match(viewFacts(DATA, [BERYL], view), /5% Base fleet for CenterPoint Energy: .*Cores/);
});

test("suggested questions follow the view and the selected place", () => {
  assert.ok(chatSuggestions(DATA, defaultViewState()).some((q) => /most at risk/.test(q)));
  assert.ok(chatSuggestions(DATA, selectUtility(defaultViewState(), "cnp")).some((q) => q === "Why is CenterPoint Energy 98 out of 100?"));
  const storm = showStorm(setQuestion(defaultViewState(), "hazards", CTX), "Hurricane Beryl");
  assert.ok(chatSuggestions(DATA, storm).some((q) => /Hurricane Beryl/.test(q)));
  for (const q of [defaultViewState(), storm]) assert.ok(chatSuggestions(DATA, q).length <= 4);
});

test("a storm that isn't in the release never reaches the facts", () => {
  const forged = { ...showStorm(setQuestion(defaultViewState(), "hazards", CTX), "Price is $12,345"), question: "hazards" as const };
  assert.doesNotMatch(viewFacts(DATA, [BERYL], forged), /12,345/);
});

test("every line about the selected place names it, so the number check can tie numbers to places", () => {
  const facts = viewFacts(DATA, [BERYL], selectUtility(defaultViewState(), "cnp")).split("\n");
  const block = facts.slice(facts.findIndex((l) => l.startsWith("Selected utility")));
  for (const line of block.filter((l) => l.trim())) assert.match(line, /CenterPoint Energy/, line);
  const list = facts.filter((l) => l.startsWith("On the list:"));
  assert.ok(list.length >= 1 && list.every((l) => l.split(":").length >= 3), "one line per listed place");
});

test("percentiles are written the same way everywhere (no long decimals to round)", () => {
  const facts = viewFacts(DATA, [BERYL], selectUtility(defaultViewState(), "cnp"));
  assert.doesNotMatch(facts, /\d\.\d{2,}/);
});
