import assert from "node:assert/strict";
import { test } from "node:test";
import { RISK_LAYERS, describeView, detailLayers, hazardHighlights, overlays, scoreLayers } from "./describe-view.ts";
import { HAZARDS, outageShareLevel, type SpotlightStorm } from "./hazard-style.ts";
import { buildScoreModel } from "./scoring.ts";
import { paintLabel } from "./format.ts";
import type { CountyRecord, LayerId, MapLayerMeta, RiskIndex, UtilityMapData, UtilityRecord } from "./types.ts";
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

const risk = (index: number, rank: number, of: number) => ({
  index, level: Math.min(5, Math.floor((index - 1) / 20) + 1), band: "x", rank, of,
  hazard: index, stress: index, raw: index / 100, sources: 9, sources_total: 9,
}) as RiskIndex;

function county(fips: string, rank: number, utilities: string[], index: number, place: number): CountyRecord {
  const ranks = Object.fromEntries(IDS.map((id) => [id, rank])) as Record<LayerId, number>;
  const values = Object.fromEntries(IDS.map((id) => [id, rank * 100])) as Record<LayerId, number>;
  const quality = Object.fromEntries(IDS.map((id) => [id, "ok"])) as CountyRecord["quality"];
  return {
    fips, name: `C${fips}`, utilities, primary_utility: utilities[0], customers: 1000, load_zone: null,
    load_zone_method: null, grid_status: "ercot", centroid: [-97, 31], values, ranks, quality,
    risk: risk(index, place, 3),
  };
}
// Harris-like county is high in every hazard; the other two are low and middle.
const HIGH = county("48201", 0.9, ["cnp"], 95, 1);
const MID = county("48453", 0.5, ["aen", "cnp"], 50, 2);
const LOW = county("48001", 0.1, ["aen"], 5, 3);

function utility(id: string, counties: [string, number][], peak: number | null, index: number, place: number): UtilityRecord {
  return {
    id, name: id.toUpperCase(), grid: "ERCOT", grids: ["ERCOT"], scored: true, base_offer: "energy_only",
    offer_verification: "listed", counties: counties.map(([f]) => f),
    county_weights: counties.map(([fips, share]) => ({ fips, customers_est: share * 1000, share })),
    customers: 1000, eligible_homes: 500, label_point: [-97, 31], core_coverage_hours: null,
    grid_stats: { summer_peak_mw: peak, winter_peak_mw: null, sales_mwh: null, residential_mwh: null, peak_source: "eia861" },
    risk: risk(index, place, 2),
  };
}
const CNP = utility("cnp", [["48201", 1], ["48453", 0.5]], 20000, 90, 1);
const AEN = utility("aen", [["48453", 0.5], ["48001", 1]], 3000, 20, 2);

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
    stormsStatus: "ok",
  });
}
const start = () => defaultViewState();
const hazards = (...picks: (keyof typeof HAZARDS)[]) =>
  picks.reduce<ViewState>((s, h) => toggleHazard(s, h), { ...setQuestion(start(), "hazards", CTX), hazards: [] });

test("what ranks utilities follows the question", () => {
  assert.deepEqual(scoreLayers(start()), RISK_LAYERS);
  assert.deepEqual(scoreLayers(hazards("flood", "hurricane")), ["flood", "hurricane"]);
});

test("Grid Risk Index: map, tooltip and table all use the published index", () => {
  const s = start();
  const d = describe(s);
  assert.equal(d.caption.title, "Grid Risk Index");
  assert.deepEqual(detailLayers(s), RISK_LAYERS);
  // Counties are colored by their own index band, 1-20 Low ... 81-100 Severe.
  assert.equal(d.stateFor(HIGH).level, 5);
  assert.equal(d.stateFor(LOW).level, 1);
  assert.equal(d.labelFor(HIGH), "Grid Risk Index 95 of 100 · Severe");
  assert.deepEqual(d.table.rows.map((r) => r.id), ["cnp", "aen"]);
  assert.equal(d.table.columns[d.table.primary], "Grid Risk Index");
  assert.equal(d.table.rows[0].cells[d.table.primary], "90");
  assert.equal(d.table.rows.length, DATA.utilities.length);
});

test("Grid Risk Index: the county line counts high hazards out of all six", () => {
  assert.equal(hazardHighlights(start(), HIGH)!.label, "High in 6 of 6 hazards");
});

test("one hazard: legend, details and table name that hazard", () => {
  const s = hazards("flood");
  const d = describe(s);
  assert.equal(d.legend.kind, "sequential");
  assert.match(d.caption.title, /Flood/);
  assert.deepEqual(detailLayers(s), ["flood"]);
  assert.deepEqual(d.table.columns.slice(1), ["Flood"]);
});

test("two hazards: the bivariate legend, details and table use the same two, in order", () => {
  const s = hazards("hurricane", "flood");
  const d = describe(s);
  assert.deepEqual(d.legend, { kind: "bivariate", first: "Hurricanes", second: "Flood" });
  assert.deepEqual(detailLayers(s), ["hurricane", "flood"]);
  assert.deepEqual(d.table.columns.slice(1), ["Hurricanes", "Flood"]);
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
  assert.equal(overlays(start()).view3d, true);
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
  const d = describe(hazards("flood"));
  assert.equal(d.table.rows.length, DATA.utilities.length);
});

test("a selected utility's counties show county levels; others are dimmed", () => {
  const s = selectUtility(hazards("flood"), "aen");
  const d = describe(s);
  assert.deepEqual(d.stateFor(LOW), { level: 1, dim: false, inSelection: true });
  assert.equal(d.stateFor(HIGH).dim, true);
});

test("hazard patterns never borrow the screening score's levels in the table", () => {
  const d = describe(hazards("flood"));
  assert.equal(d.table.columns[0], "Average Texas rank");
  assert.ok(d.table.rows.every((r) => !/Low|Moderate|Elevated|High/.test(r.cells[0])), d.table.rows[0].cells[0]);
});

test("a storm missing from the release says so instead of loading forever", () => {
  const s = showStorm(hazards("winter"), "Hurricane Ghost");
  const input = {
    data: DATA,
    model: buildScoreModel(DATA, scoreLayers(s)),
    countiesByFips: new Map(DATA.counties.map((c) => [c.fips, c])),
    utilitiesById: new Map(DATA.utilities.map((u) => [u.id, u])),
    storms: [BERYL],
  };
  const missing = describeView(s, { ...input, stormsStatus: "ok" });
  assert.equal(missing.legend.kind, "empty");
  assert.match((missing.legend as { message: string }).message, /isn't in this release/);
  const failed = describeView(s, { ...input, storms: [], stormsStatus: "failed" });
  assert.match((failed.legend as { message: string }).message, /Couldn't load/);
  const loading = describeView(s, { ...input, storms: [], stormsStatus: "loading" });
  assert.match((loading.legend as { message: string }).message, /Loading/);
});

test("a county whose share out is unknown gets its own color, legend entry and place in the table", () => {
  const storm: SpotlightStorm = {
    ...BERYL,
    counties: [
      { fips: "48001", peak_out: 5000, peak_out_pct: null, customers_floored: true, customer_hours: 99999 },
      ...BERYL.counties,
    ],
  };
  const s = showStorm(hazards("winter"), "Hurricane Beryl");
  const d = describeView(s, {
    data: DATA,
    model: buildScoreModel(DATA, scoreLayers(s)),
    countiesByFips: new Map(DATA.counties.map((c) => [c.fips, c])),
    utilitiesById: new Map(DATA.utilities.map((u) => [u.id, u])),
    storms: [storm],
    stormsStatus: "ok",
  });
  assert.equal(d.stateFor(LOW).level, 6);
  assert.equal(d.colors.length, 6);
  assert.equal(d.legend.kind, "sequential");
  assert.match((d.legend as { extra?: { label: string } }).extra?.label ?? "", /unknown/i);
  assert.deepEqual(d.table.rows.map((r) => r.id), ["48201", "48453", "48001"]);
  assert.match(d.table.rows[2].cells[0], /Unknown/);
  assert.equal(paintLabel(d.context, 6), "Hurricane Beryl 2024: customers out, share unknown");
});

test("every statewide card says what it is, what it shows and how to read it", () => {
  const cases: [ViewState, RegExp][] = [
    [start(), /Which Texas utilities are most at risk\?/],
    [hazards("flood"), /Where is flood exposure highest\?/],
    [hazards("flood", "hurricane"), /Where do flood and hurricanes overlap\?/],
    [hazards("flood", "hurricane", "winter"), /Which places face the most hazards\?/],
    [showStorm(hazards("winter"), "Hurricane Beryl"), /Where did Hurricane Beryl 2024 knock out power\?/],
    [setQuestion(start(), "grid", CTX), /How big is each utility's grid\?/],
    [setShare(setQuestion(start(), "fleet", CTX), 0.01), /What could a 1% Base fleet add\?/],
  ];
  for (const [state, title] of cases) {
    const { intro } = describe(state);
    assert.match(intro.title, title);
    assert.ok(intro.eyebrow.length > 0 && intro.lead.length > 40 && intro.read.length > 20, intro.title);
    assert.doesNotMatch(`${intro.title} ${intro.lead} ${intro.read}`, /customer-weighted|High in how many/);
  }
});

test("the several-hazards card names every hazard and says it is past exposure, not odds", () => {
  const { intro } = describe(hazards("flood", "hurricane", "winter"));
  assert.match(intro.lead, /3 hazards/);
  for (const name of ["flood", "hurricanes", "winter freeze"]) assert.match(intro.lead.toLowerCase(), new RegExp(name));
  assert.match(intro.lead, /not the odds/);
});

test("the fleet card spells out the assumptions behind the numbers", () => {
  const { intro } = describe(setShare(setQuestion(start(), "fleet", CTX), 0.01));
  assert.match(intro.lead, /1% of each utility's owner-occupied single-family homes/);
  assert.match(intro.lead, /39\.2 kWh/);
  assert.match(intro.lead, /20% kept for backup/);
  assert.match(intro.read, /2 hours/);
});
