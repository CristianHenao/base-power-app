import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildScoreModel,
  offerLabel,
  rankGroup,
  utilityLayerQuality,
  utilityLayerSummary,
} from "./scoring.ts";
import type { CountyRecord, LayerId, UtilityMapData, UtilityRecord } from "./types.ts";

const LAYERS: LayerId[] = ["outages", "homes"];

function county(fips: string, outagesRank: number, homes: number, utilities: string[]): CountyRecord {
  const values = { outages: outagesRank * 10, homes } as Record<LayerId, number | null>;
  const ranks = { outages: outagesRank, homes: 0.5 } as Record<LayerId, number | null>;
  return {
    fips, name: fips, utilities, primary_utility: utilities[0], customers: 1000, load_zone: "LZ_NORTH",
    load_zone_method: "approximate", grid_status: "ercot", centroid: [-97, 31],
    values, ranks, quality: { outages: "ok", homes: "ok" } as CountyRecord["quality"],
  };
}

function utility(id: string, weights: [string, number, number][], offer: UtilityRecord["base_offer"]): UtilityRecord {
  return {
    id, name: id, grid: "ERCOT", grids: ["ERCOT"], scored: true, base_offer: offer,
    offer_verification: offer ? "listed" : "unverified",
    counties: weights.map(([fips]) => fips),
    county_weights: weights.map(([fips, customers_est, share]) => ({ fips, customers_est, share })),
    customers: 1000, eligible_homes: null, label_point: [-97, 31], core_coverage_hours: null,
  };
}

// County A (rank 1.0) and B (rank 0.0) each have 1,000 customers. Alpha has 900 of A's
// customers and 100 of B's, so its outage rank should lean to A: 0.9, not the 0.5 a
// whole-county weighting gives.
const A = county("48001", 1, 1000, ["alpha", "beta"]);
const B = county("48003", 0, 400, ["beta", "alpha"]);
const alpha = utility("alpha", [["48001", 900, 0.9], ["48003", 100, 0.1]], "energy_only");
const beta = utility("beta", [["48001", 100, 0.1], ["48003", 900, 0.9]], null);

function data(): UtilityMapData {
  return { counties: [A, B], utilities: [alpha, beta] } as unknown as UtilityMapData;
}

test("a utility's layer rank is weighted by its own customers in each county", () => {
  const counties = new Map([A, B].map((c) => [c.fips, c]));
  const summary = utilityLayerSummary(alpha, counties, "outages");
  assert.ok(Math.abs((summary.rank ?? 0) - 0.9) < 1e-9);
});

test("shared-county homes are split, not counted in full for every utility", () => {
  const counties = new Map([A, B].map((c) => [c.fips, c]));
  const a = utilityLayerSummary(alpha, counties, "homes").value ?? 0;
  const b = utilityLayerSummary(beta, counties, "homes").value ?? 0;
  assert.equal(a, 0.9 * 1000 + 0.1 * 400);
  assert.equal(a + b, 1400);
});

test("utility score uses the estimated split", () => {
  const model = buildScoreModel(data(), ["outages"]);
  assert.ok(Math.abs((model.utility.get("alpha")?.score ?? 0) - 0.9) < 1e-9);
  assert.ok(Math.abs((model.utility.get("beta")?.score ?? 0) - 0.1) < 1e-9);
});

test("an unverified offer gets its own group and label, never 'not served'", () => {
  assert.equal(rankGroup(beta, 5), "unverified");
  assert.equal(rankGroup(beta, 1), "monitor");
  assert.equal(rankGroup(alpha, 5), "expansion");
  assert.equal(offerLabel(beta), "Offer not verified");
  assert.equal(offerLabel(alpha), "Energy only");
});

test("layers passed in LAYERS order give a combined score", () => {
  const model = buildScoreModel(data(), LAYERS);
  assert.ok(model.county.get("48001")?.score != null);
});

test("a utility's layer quality: ok if any county has data, not applicable only if all are", () => {
  const counties = new Map([A, B].map((c) => [c.fips, c]));
  assert.equal(utilityLayerQuality(alpha, counties, "outages"), "ok");
  const outside = { ...B, quality: { ...B.quality, price_spikes: "not_applicable" } } as CountyRecord;
  const inside = { ...A, quality: { ...A.quality, price_spikes: "missing" } } as CountyRecord;
  const onlyOutside = new Map([[B.fips, outside]]);
  const mixed = new Map([[A.fips, inside], [B.fips, outside]]);
  const west = utility("west", [["48003", 100, 1]], null);
  assert.equal(utilityLayerQuality(west, onlyOutside, "price_spikes"), "not_applicable");
  assert.equal(utilityLayerQuality(alpha, mixed, "price_spikes"), "missing");
});

test("peak demand adds up across a utility's county shares like homes do", () => {
  const withPeak = (c: CountyRecord, mw: number) =>
    ({ ...c, values: { ...c.values, peak_demand: mw }, quality: { ...c.quality, peak_demand: "ok" } }) as CountyRecord;
  const counties = new Map([withPeak(A, 1000), withPeak(B, 200)].map((c) => [c.fips, c]));
  // Uneven splits, so a weighted average (600) and the additive total (75) differ.
  const gamma = utility("gamma", [["48001", 50, 0.05], ["48003", 50, 0.125]], null);
  assert.equal(utilityLayerSummary(gamma, counties, "peak_demand").value, 0.05 * 1000 + 0.125 * 200);
});

test("with price spikes on, counties outside ERCOT are leveled only among themselves", () => {
  const mk = (fips: string, rank: number, ercot: boolean): CountyRecord =>
    ({
      ...county(fips, rank, 100, ["u"]),
      ranks: { outages: rank, homes: 0.5, price_spikes: ercot ? rank : null } as CountyRecord["ranks"],
      quality: { outages: "ok", homes: "ok", price_spikes: ercot ? "ok" : "not_applicable" } as CountyRecord["quality"],
    }) as CountyRecord;
  // Five ERCOT counties with high scores and five outside ERCOT with low scores.
  const counties = [
    ...[0.6, 0.7, 0.8, 0.9, 1.0].map((r, i) => mk(`e${i}`, r, true)),
    ...[0.0, 0.1, 0.2, 0.3, 0.4].map((r, i) => mk(`n${i}`, r, false)),
  ];
  const d = { counties, utilities: [] } as unknown as UtilityMapData;
  const withSpikes = buildScoreModel(d, ["outages", "price_spikes"]);
  assert.equal(withSpikes.county.get("n4")?.level, 5); // top of its own peer group
  assert.equal(withSpikes.county.get("e4")?.level, 5);
  const without = buildScoreModel(d, ["outages"]);
  assert.equal(without.county.get("n4")?.level, 3); // statewide, the same county is mid-pack
});

test("with price spikes on, utilities outside ERCOT are leveled among themselves", () => {
  const mkCounty = (fips: string, rank: number) =>
    ({ ...county(fips, rank, 100, ["x"]), ranks: { outages: rank, price_spikes: null }, quality: { outages: "ok", price_spikes: "not_applicable" } }) as unknown as CountyRecord;
  const counties = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map((r, i) => mkCounty(`c${i}`, r));
  const utilities = counties.map((c, i) => ({
    ...utility(`u${i}`, [[c.fips, 100, 1]], null),
    grids: i < 5 ? ["SPP"] : ["ERCOT"],
  })) as UtilityRecord[];
  const d = { counties, utilities } as unknown as UtilityMapData;
  const model = buildScoreModel(d, ["outages", "price_spikes"]);
  assert.equal(model.utility.get("u4")?.level, 5); // best of the SPP five
  assert.equal(model.utility.get("u0")?.level, 1);
});

test("a utility off the ERCOT grid is 'not applicable' for price spikes even if a shared county has a value", () => {
  const shared = { ...A, values: { ...A.values, price_spikes: 40 }, quality: { ...A.quality, price_spikes: "ok" } } as CountyRecord;
  const counties = new Map([[shared.fips, shared]]);
  const wecc = { ...utility("epe", [[A.fips, 0, 0]], "backup_program"), grids: ["WECC"] } as UtilityRecord;
  assert.equal(utilityLayerQuality(wecc, counties, "price_spikes"), "not_applicable");
  assert.equal(utilityLayerQuality({ ...wecc, grids: ["ERCOT"] }, counties, "price_spikes"), "ok");
});

test("a utility's peak demand is its own reported or estimated peak, not a sum of mixed county peaks", () => {
  const withPeak = (c: CountyRecord, mw: number) =>
    ({ ...c, values: { ...c.values, peak_demand: mw }, quality: { ...c.quality, peak_demand: "ok" } }) as CountyRecord;
  const counties = new Map([withPeak(A, 1000), withPeak(B, 200)].map((c) => [c.fips, c]));
  const withStats = { ...alpha, grid_stats: { summer_peak_mw: 777, winter_peak_mw: null, sales_mwh: null,
    residential_mwh: null, peak_source: "eia861" } } as UtilityRecord;
  assert.equal(utilityLayerSummary(withStats, counties, "peak_demand").value, 777);
});

test("a utility's local generation is the plants in its counties, not split by customer share", () => {
  const withGen = (c: CountyRecord, mw: number) =>
    ({ ...c, values: { ...c.values, generation: mw }, quality: { ...c.quality, generation: "ok" } }) as CountyRecord;
  const counties = new Map([withGen(A, 1000), withGen(B, 200)].map((c) => [c.fips, c]));
  assert.equal(utilityLayerSummary(alpha, counties, "generation").value, 1200);
});
