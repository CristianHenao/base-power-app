import assert from "node:assert/strict";
import { test } from "node:test";
import { filterRiskRows, riskRows, sortRiskRows } from "./risk-table.ts";
import type { CountyRecord, LayerId, RiskIndex, UtilityMapData, UtilityRecord } from "./types.ts";

const IDS: LayerId[] = [
  "peak_demand", "generation", "price_spikes", "outages", "flood", "tornado",
  "severe_storm", "hurricane", "winter", "heat", "weather", "homes",
];
const risk = (index: number | null, rank: number | null, of: number, sources = 9) =>
  ({ index, level: index == null ? null : Math.min(5, Math.floor((index - 1) / 20) + 1), band: null, rank, of,
    hazard: index, stress: index, raw: null, sources, sources_total: 9 }) as RiskIndex;

function county(fips: string, name: string, rank: number, index: number | null, place: number | null): CountyRecord {
  const ranks = Object.fromEntries(IDS.map((id) => [id, rank])) as Record<LayerId, number | null>;
  ranks.price_spikes = null;
  return {
    fips, name, utilities: ["u1"], primary_utility: "u1", customers: 10, load_zone: null, load_zone_method: null,
    grid_status: "ercot", centroid: [0, 0], values: ranks, ranks,
    quality: Object.fromEntries(IDS.map((id) => [id, "ok"])) as CountyRecord["quality"],
    risk: risk(index, place, 3, 8),
  };
}
const A = county("48001", "Anderson", 0.9, 90, 1);
const B = county("48003", "Andrews", 0.2, 20, 2);
const C = county("48005", "Angelina", 0.5, null, null);
const U1 = {
  id: "u1", name: "Oncor", counties: ["48001", "48003"],
  county_weights: [{ fips: "48001", customers_est: 900, share: 1 }, { fips: "48003", customers_est: 100, share: 1 }],
  risk: risk(81, 1, 1),
} as unknown as UtilityRecord;
const DATA = { counties: [A, B, C], utilities: [U1] } as unknown as UtilityMapData;
const BY_FIPS = new Map([A, B, C].map((c) => [c.fips, c]));

test("county rows carry the index, both halves and every factor as a Texas percentile", () => {
  const rows = riskRows(DATA, "county", BY_FIPS);
  const a = rows.find((r) => r.id === "48001")!;
  assert.equal(a.name, "Anderson County");
  assert.equal(a.index, 90);
  assert.equal(a.band, "Severe");
  assert.equal(a.factors.flood, 90);
  assert.equal(a.factors.price_spikes, null);
  assert.equal(a.sources, 8);
  assert.equal(a.utility, "u1");
});

test("utility rows use customer-weighted county percentiles", () => {
  const [u] = riskRows(DATA, "utility", BY_FIPS);
  assert.equal(u.name, "Oncor");
  assert.equal(u.factors.flood, 83); // 0.9 * 0.9 + 0.2 * 0.1
  assert.equal(u.utility, "u1");
});

test("sorting keeps places without data last in both directions", () => {
  const rows = riskRows(DATA, "county", BY_FIPS);
  assert.deepEqual(sortRiskRows(rows, "index", "desc").map((r) => r.id), ["48001", "48003", "48005"]);
  assert.deepEqual(sortRiskRows(rows, "index", "asc").map((r) => r.id), ["48003", "48001", "48005"]);
  assert.deepEqual(sortRiskRows(rows, "rank", "asc").map((r) => r.id), ["48001", "48003", "48005"]);
  assert.deepEqual(sortRiskRows(rows, "name", "asc").map((r) => r.name), ["Anderson County", "Andrews County", "Angelina County"]);
  assert.deepEqual(sortRiskRows(rows, "flood", "desc").map((r) => r.id), ["48001", "48005", "48003"]);
});

test("search matches names, ignoring case", () => {
  const rows = riskRows(DATA, "county", BY_FIPS);
  assert.deepEqual(filterRiskRows(rows, "  andr ").map((r) => r.id), ["48003"]);
  assert.equal(filterRiskRows(rows, "").length, 3);
});
