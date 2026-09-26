import assert from "node:assert/strict";
import { test } from "node:test";
import { describeView, detailLayers, hazardHighlights, overlays, scoreLayers } from "./describe-view.ts";
import { HAZARDS, outageShareLevel, type SpotlightStorm } from "./hazard-style.ts";
import { buildScoreModel } from "./scoring.ts";
import type { CountyRecord, LayerId, MapLayerMeta, UtilityMapData, UtilityRecord } from "./types.ts";
import {
  defaultViewState,
  selectUtility,
  setGridLayer,
  setQuestion,
  setShare,
  showStorm,
  toggleHazard,
  type ViewContext,
  type ViewState,
} from "./view.ts";

const IDS: LayerId[] = [
  "peak_demand", "generation", "price_spikes", "outages", "flood", "tornado",
  "severe_storm", "hurricane", "winter", "heat", "weather", "homes",
];
const LABELS: Partial<Record<LayerId, string>> = {
  peak_demand: "Peak demand", generation: "Local generation", price_spikes: "Price spikes",
  outages: "Long outages", homes: "Potential homes", weather: "Weather hazard (FEMA)",
};
const LAYERS = IDS.map(
  (id) =>
    ({
      id, label: LABELS[id] ?? HAZARDS[id as keyof typeof HAZARDS]?.label ?? id,
      group: "hazard", unit: "u", available: true, coverage: { ok: 3, missing: 0, not_applicable: 0 },
    }) as unknown as MapLayerMeta,
);

function county(fips: string, rank: number, utilities: string[]): CountyRecord {
  const ranks = Object.fromEntries(IDS.map((id) => [id, rank])) as Record<LayerId, number>;
  const values = Object.fromEntries(IDS.map((id) => [id, rank * 100])) as Record<LayerId, number>;
  const quality = Object.fromEntries(IDS.map((id) => [id, "ok"])) as CountyRecord["quality"];
  return {
    fips, name: `C${fips}`, utilities, primary_utility: utilities[0], customers: 1000, load_zone: null,
    load_zone_method: null, grid_status: "ercot", centroid: [-97, 31], values, ranks, quality,
  };
}
// Harris-like county is high in every hazard; the other two are low and middle.
const HIGH = county("48201", 0.9, ["cnp"]);
const MID = county("48453", 0.5, ["aen", "cnp"]);
const LOW = county("48001", 0.1, ["aen"]);

function utility(id: string, counties: [string, number][], peak: number | null): UtilityRecord {
  return {
    id, name: id.toUpperCase(), grid: "ERCOT", grids: ["ERCOT"], scored: true, base_offer: "energy_only",
    offer_verification: "listed", counties: counties.map(([f]) => f),
    county_weights: counties.map(([fips, share]) => ({ fips, customers_est: share * 1000, share })),
    customers: 1000, eligible_homes: 500, label_point: [-97, 31], core_coverage_hours: null,
    grid_stats: { summer_peak_mw: peak, winter_peak_mw: null, sales_mwh: null, residential_mwh: null, peak_source: "eia861" },
  };
}
const CNP = utility("cnp", [["48201", 1], ["48453", 0.5]], 20000);
const AEN = utility("aen", [["48453", 0.5], ["48001", 1]], 3000);

const DATA = {
  layers: LAYERS,
  presets: [
    { id: "winter", label: "Winter freeze", layers: ["winter", "outages", "price_spikes", "homes"] },
    { id: "hurricane", label: "Hurricane season", layers: ["hurricane", "flood", "outages", "homes"] },
  ],
  counties: [HIGH, MID, LOW],
  utilities: [CNP, AEN],
  battery: { kwh_per_core: 39.2, kw_per_core: 20, reserve_fraction: 0.2, backup_hours_assumed: 12, dispatch_window_h: 2 },
  sources: [],
} as unknown as UtilityMapData;

const CTX: ViewContext = {
  presets: DATA.presets,
  layers: LAYERS,
  utilityIds: new Set(["cnp", "aen"]),
  countyFips: new Set(["48201", "48453", "48001"]),
};

const BERYL: SpotlightStorm = {
  name: "Hurricane Beryl", start: "2024-07-08", end: "2024-07-15", source: null, note: null,
  track_storm_id: "AL022024",
  counties: [
    { fips: "48453", peak_out: 100, peak_out_pct: 12, customer_hours: 500 },
    { fips: "48201", peak_out: 900, peak_out_pct: 64, customer_hours: 9000 },
  ],
};

function describe(state: ViewState) {
  return describeView(state, {
    data: DATA,
    model: buildScoreModel(DATA, scoreLayers(state)),
    countiesByFips: new Map(DATA.counties.map((c) => [c.fips, c])),
    utilitiesById: new Map(DATA.utilities.map((u) => [u.id, u])),
    storms: [BERYL],
  });
}
const label = (id: LayerId) => LAYERS.find((l) => l.id === id)!.label;
const start = () => defaultViewState(DATA.presets);
const hazards = (...picks: (keyof typeof HAZARDS)[]) =>
  picks.reduce<ViewState>((s, h) => toggleHazard(s, h), { ...setQuestion(start(), "hazards", CTX), hazards: [] });

test("what ranks utilities follows the question", () => {
  assert.deepEqual(scoreLayers(start()), ["winter", "outages", "price_spikes", "homes"]);
  assert.deepEqual(scoreLayers(hazards("flood", "hurricane")), ["flood", "hurricane"]);
});

test("Find opportunities: caption, details and table all use the scenario's factors", () => {
  const s = start();
  const d = describe(s);
  assert.match(d.caption.title, /Screening score/);
  assert.match(d.caption.qualifier, /4 factors/);
  assert.deepEqual(detailLayers(s), s.factors);
  assert.deepEqual(d.table.columns.slice(2), s.factors.map(label));
});

test("one hazard: legend, details and table name that hazard", () => {
  const s = hazards("flood");
  const d = describe(s);
  assert.equal(d.legend.kind, "sequential");
  assert.match(d.caption.title, /Flood/);
  assert.deepEqual(detailLayers(s), ["flood"]);
  assert.deepEqual(d.table.columns.slice(2), ["Flood"]);
});

test("two hazards: the bivariate legend, details and table use the same two, in order", () => {
  const s = hazards("hurricane", "flood");
  const d = describe(s);
  assert.deepEqual(d.legend, { kind: "bivariate", first: "Hurricanes", second: "Flood" });
  assert.deepEqual(detailLayers(s), ["hurricane", "flood"]);
  assert.deepEqual(d.table.columns.slice(2), ["Hurricanes", "Flood"]);
});

test("three hazards: the county line counts and names exactly the selected hazards", () => {
  const s = hazards("flood", "hurricane", "winter");
  const d = describe(s);
  assert.match(d.caption.qualifier, /not the odds/);
  const high = hazardHighlights(s, HIGH)!;
  assert.deepEqual(high.scope, ["flood", "hurricane", "winter"]);
  assert.equal(high.label, "High in 3 of 3 selected hazards");
  assert.equal(hazardHighlights(s, LOW)!.label, "High in 0 of 3 selected hazards");
});

test("no hazards picked: an explicit empty state, never the screening score", () => {
  const s = hazards();
  const d = describe(s);
  assert.equal(d.legend.kind, "empty");
  assert.ok(DATA.counties.every((c) => d.stateFor(c).level == null));
  assert.equal(d.table.rows.length, 0);
});

test("past storm: map, caption and table all describe that storm's outages", () => {
  const s = showStorm(hazards("winter"), "Hurricane Beryl");
  const d = describe(s);
  assert.equal(d.caption.title, "Hurricane Beryl 2024");
  assert.match(d.caption.qualifier, /Peak customers without power/);
  assert.equal(d.stateFor(HIGH).level, outageShareLevel(64));
  assert.equal(d.stateFor(LOW).level, null);
  assert.deepEqual(d.table.rows.map((r) => r.id), ["48201", "48453"]);
  assert.equal(d.table.columns[d.table.primary], "Peak share out");
  assert.deepEqual(detailLayers(s), []);
  assert.equal(hazardHighlights(s, HIGH), null);
});

test("grid: demand shading and plants follow their switches", () => {
  const on = setQuestion(start(), "grid", CTX);
  assert.deepEqual(overlays(on), { demand: true, plants: true, tracks: [], stormTrack: null, flood: false, view3d: false });
  const off = setGridLayer(on, "demand", false);
  const d = describe(off);
  assert.equal(overlays(off).demand, false);
  assert.ok(DATA.counties.every((c) => d.stateFor(c).level === 1));
  assert.equal(d.context.kind, "plain");
  assert.equal(overlays(setGridLayer(on, "plants", false)).plants, false);
});

test("hazard tracks and flood zones are drawn only for the hazards picked", () => {
  const s = hazards("tornado", "flood");
  assert.deepEqual(overlays(s).tracks, ["tornado"]);
  assert.equal(overlays(s).flood, true);
  assert.equal(overlays(start()).flood, false);
  const storm = showStorm(s, "Hurricane Beryl");
  assert.deepEqual(overlays(storm).tracks, []);
});

test("fleet: caption names the share and the table covers every utility, sorted by share of peak", () => {
  const s = setShare(setQuestion(start(), "fleet", CTX), 0.05);
  const d = describe(s);
  assert.match(d.caption.title, /5% Base fleet/);
  assert.equal(d.table.rows.length, DATA.utilities.length);
  assert.deepEqual(d.table.rows.map((r) => r.id), ["aen", "cnp"]);
  assert.equal(d.table.columns[d.table.primary], "Share of summer peak");
});

test("the table holds every utility, not a top slice", () => {
  const d = describe(start());
  assert.equal(d.table.rows.length, DATA.utilities.length);
});

test("a selected utility's counties show county levels; others are dimmed", () => {
  const s = selectUtility(hazards("flood"), "aen");
  const d = describe(s);
  assert.deepEqual(d.stateFor(LOW), { level: 1, dim: false, inSelection: true });
  assert.equal(d.stateFor(HIGH).dim, true);
});
