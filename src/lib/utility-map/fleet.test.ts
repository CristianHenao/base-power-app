import assert from "node:assert/strict";
import { test } from "node:test";
import { FLEET_BINS, fleetLevel, fleetScenario } from "./fleet.ts";
import type { CountyRecord, UtilityRecord } from "./types.ts";

const BATTERY = { kwh_per_core: 39.2, kw_per_core: 20, reserve_fraction: 0.2, backup_hours_assumed: 12, dispatch_window_h: 2 };

function county(fips: string, homes: number, outages: number | null, coverage: number | null): CountyRecord {
  return {
    fips, values: { homes, outages }, quality: { homes: "ok", outages: outages == null ? "missing" : "ok" },
    outage_coverage_12h: coverage,
  } as unknown as CountyRecord;
}

function utility(weights: [string, number][], peak: number | null): UtilityRecord {
  return {
    id: "u", county_weights: weights.map(([fips, share]) => ({ fips, customers_est: 1, share })),
    grid_stats: peak == null ? null : { summer_peak_mw: peak, winter_peak_mw: null, sales_mwh: null,
      residential_mwh: null, peak_source: "eia861" },
  } as unknown as UtilityRecord;
}

const near = (a: number | null, b: number, tol = 1e-6) => assert.ok(a != null && Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("Oncor worked example: 1% of 1.53M homes is about 240 MW for two hours", () => {
  const counties = new Map([["48113", county("48113", 1_533_623, 3, 0.3)]]);
  const f = fleetScenario(utility([["48113", 1]], 30_509.7), counties, 0.01, BATTERY);
  assert.equal(f.cores, 15_336);
  near(f.storageMwh, 601.1712);
  near(f.nameplateMw, 306.72);
  near(f.dispatchMw2h, 240.46848);
  near(f.peakShare, 240.46848 / 30_509.7);
  near(f.spikeMwh, 480.93696);
});

test("more homes never means less", () => {
  const counties = new Map([["48113", county("48113", 100_000, 3, 0.3)]]);
  const u = utility([["48113", 1]], 1000);
  const [a, b, c] = [0.01, 0.05, 0.1].map((s) => fleetScenario(u, counties, s, BATTERY));
  assert.ok(a.cores < b.cores && b.cores < c.cores);
  assert.ok((a.peakShare ?? 0) < (b.peakShare ?? 0) && (b.peakShare ?? 0) < (c.peakShare ?? 0));
});

test("a utility's share of a county's homes is what counts", () => {
  const counties = new Map([["48001", county("48001", 10_000, 3, 0.3)]]);
  assert.equal(fleetScenario(utility([["48001", 0.25]], null), counties, 0.1, BATTERY).cores, 250);
});

test("unknown peak leaves the share of peak unknown, not zero", () => {
  const counties = new Map([["48001", county("48001", 10_000, 3, 0.3)]]);
  assert.equal(fleetScenario(utility([["48001", 1]], null), counties, 0.1, BATTERY).peakShare, null);
});

test("backup hours are summed county by county, never from averaged inputs", () => {
  const counties = new Map([
    ["48001", county("48001", 10_000, 10, 0.2)],
    ["48003", county("48003", 10_000, 2, 0.9)],
  ]);
  const f = fleetScenario(utility([["48001", 1], ["48003", 1]], null), counties, 0.1, BATTERY);
  // 1,000 Cores in each: 1000 × 10 × 0.2 + 1000 × 2 × 0.9 = 3,800 (averaging first would give 6,600)
  near(f.backupCustomerHours, 3800);
});

test("no outage or coverage data means no backup-hours claim", () => {
  const counties = new Map([["48001", county("48001", 10_000, null, null)]]);
  assert.equal(fleetScenario(utility([["48001", 1]], null), counties, 0.1, BATTERY).backupCustomerHours, null);
});

test("fleet levels use fixed bins so a bigger fleet visibly recolors", () => {
  assert.equal(fleetLevel(null), null);
  assert.equal(fleetLevel(0.004), 1);
  assert.equal(fleetLevel(0.0079), 2);
  assert.equal(fleetLevel(0.015), 3);
  assert.equal(fleetLevel(0.03), 4);
  assert.equal(fleetLevel(0.079), 5);
  assert.deepEqual(FLEET_BINS, [0.005, 0.01, 0.02, 0.05]);
});
