import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildScoreModel,
  fleetEstimate,
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

test("fleet estimate tolerates unknown homes and coverage", () => {
  const counties = new Map([A, B].map((c) => [c.fips, c]));
  const fleet = fleetEstimate(alpha, counties, 0.1, { kwh_per_core: 39.2, kw_per_core: 20 });
  assert.equal(fleet.homes, Math.round(0.1 * 940));
  assert.equal(fleet.outageHoursCovered, null);
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
