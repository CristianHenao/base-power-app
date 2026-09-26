import assert from "node:assert/strict";
import { test } from "node:test";
import { loadUtilityMap, upgradeV1, validateContract, type V1Data } from "./load.ts";
import type { UtilityMapData } from "./types.ts";

function v1County(fips: string, utilities: string[], scarcity: number | null) {
  return {
    fips,
    name: `County ${fips}`,
    utilities,
    customers: 1000,
    load_zone: scarcity == null ? null : "LZ_NORTH",
    centroid: [-97, 31] as [number, number],
    values: { outages: 2, weather: 50, flood: 40, scarcity, homes: 300 },
    ranks: { outages: 0.5, weather: 0.5, flood: 0.5, scarcity: scarcity == null ? null : 0.5, homes: 0.5 },
  };
}

function v1Mock(): V1Data {
  return {
    mock: true,
    as_of: "2026-09-25",
    note: "dummy",
    layers: ["outages", "weather", "flood", "scarcity", "homes"].map((id) => ({
      id, label: id, unit: "u", source: "s", as_of: "2025-01-01",
    })),
    presets: [{ id: "summer", label: "Summer peak", layers: ["scarcity", "weather", "homes"] }],
    battery: { kwh_per_core: 39.2, kw_per_core: 20 },
    live: { as_of: "2026-09-25T22:15:00-05:00", ercot: "normal", alerts: [{ fips: "48001", event: "Heat Advisory" }] },
    counties: [v1County("48001", ["alpha"], 5), v1County("48003", ["alpha", "beta"], null)],
    utilities: [
      { id: "alpha", name: "Alpha", grid: "ERCOT", scored: true, base_offer: "energy_only",
        counties: ["48001", "48003"], customers: 2000, eligible_homes: 500, label_point: [-97, 31] as [number, number],
        core_coverage_hours: 0.5 },
      { id: "beta", name: "Beta", grid: "SPP", scored: false, base_offer: "none",
        counties: ["48003"], customers: 500, eligible_homes: 100, label_point: [-97, 31] as [number, number],
        core_coverage_hours: 0.5 },
    ],
    geometry: { counties: "counties.geojson", territories: "territories.geojson" },
  } as V1Data;
}

test("upgradeV1 renames scarcity to price_spikes and marks the data as mock", () => {
  const data = upgradeV1(v1Mock());
  assert.equal(data.data_mode, "mock");
  assert.equal(data.schema_version, "1.0");
  assert.deepEqual(data.layers.map((l) => l.id), ["outages", "weather", "flood", "price_spikes", "homes"]);
  assert.deepEqual(data.presets[0].layers, ["price_spikes", "weather", "homes"]);
  assert.equal(data.counties[0].values.price_spikes, 5);
  assert.equal(data.counties[1].quality.price_spikes, "not_applicable");
  assert.ok(data.layers.every((l) => l.available));
});

test("upgradeV1 splits a shared county evenly and leaves an unlisted offer unknown", () => {
  const data = upgradeV1(v1Mock());
  const beta = data.utilities.find((u) => u.id === "beta")!;
  assert.equal(beta.base_offer, null);
  assert.equal(beta.offer_verification, "unverified");
  assert.deepEqual(beta.county_weights, [{ fips: "48003", customers_est: 500, share: 0.5 }]);
  assert.equal(data.live.status, "ok");
});

test("validateContract accepts the upgraded mock", () => {
  assert.deepEqual(validateContract(upgradeV1(v1Mock()), 2), []);
});

test("validateContract reports a non-finite value and a missing layer key", () => {
  const data = upgradeV1(v1Mock());
  data.counties[0].values.outages = Number.NaN;
  delete (data.counties[1].values as Record<string, unknown>).flood;
  const errors = validateContract(data, 2);
  assert.ok(errors.some((e) => e.includes("48001") && e.includes("outages")));
  assert.ok(errors.some((e) => e.includes("48003") && e.includes("flood")));
});

test("validateContract reports the wrong number of counties", () => {
  const errors = validateContract(upgradeV1(v1Mock()));
  assert.ok(errors.some((e) => e.includes("254")));
});

function fakeFetch(files: Record<string, unknown>) {
  const seen: string[] = [];
  const fetchJson = async (url: string) => {
    seen.push(url);
    if (!(url in files)) throw new Error(`404 ${url}`);
    return structuredClone(files[url]);
  };
  return { fetchJson, seen };
}

const geo = { type: "FeatureCollection", features: [] };

test("loadUtilityMap follows current.json to the release", async () => {
  const release = { ...upgradeV1(v1Mock()), schema_version: "3.0", release_id: "r1", data_mode: "partial" };
  const { fetchJson, seen } = fakeFetch({
    "/utility-map/current.json": { release_id: "r1", path: "releases/r1", schema_version: "3.0" },
    "/utility-map/releases/r1/utility-map.json": release,
    "/utility-map/releases/r1/counties.geojson": geo,
    "/utility-map/releases/r1/territories.geojson": geo,
  });
  const loaded = await loadUtilityMap(new URLSearchParams(), fetchJson, 2);
  assert.equal((loaded.data as UtilityMapData).release_id, "r1");
  assert.equal(loaded.base, "/utility-map/releases/r1");
  assert.ok(!seen.some((u) => u.includes("/mock/")));
});

test("loadUtilityMap only reads the mock when asked", async () => {
  const { fetchJson } = fakeFetch({
    "/utility-map/mock/utility-map.json": v1Mock(),
    "/utility-map/mock/counties.geojson": geo,
    "/utility-map/mock/territories.geojson": geo,
  });
  const loaded = await loadUtilityMap(new URLSearchParams("data=mock"), fetchJson, 2);
  assert.equal(loaded.data.data_mode, "mock");
});

test("loadUtilityMap rejects a release that fails validation", async () => {
  const bad = { ...upgradeV1(v1Mock()), schema_version: "3.0", release_id: "r2", data_mode: "partial" };
  bad.counties[0].ranks.flood = Number.POSITIVE_INFINITY;
  const { fetchJson } = fakeFetch({
    "/utility-map/current.json": { release_id: "r2", path: "releases/r2", schema_version: "3.0" },
    "/utility-map/releases/r2/utility-map.json": bad,
    "/utility-map/releases/r2/counties.geojson": geo,
    "/utility-map/releases/r2/territories.geojson": geo,
  });
  await assert.rejects(loadUtilityMap(new URLSearchParams(), fetchJson, 2), /48001.*flood/);
});
