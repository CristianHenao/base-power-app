import assert from "node:assert/strict";
import { test } from "node:test";
import { clickTarget, countyPaintState, pickerOptions, tooltipPosition } from "./selection.ts";
import type { ScoreModel } from "./scoring.ts";
import type { CountyRecord, UtilityRecord } from "./types.ts";

const shared = { fips: "48001", utilities: ["alpha", "beta"], primary_utility: "alpha" } as CountyRecord;
const solo = { fips: "48003", utilities: ["beta"], primary_utility: "beta" } as CountyRecord;
const alpha = {
  id: "alpha", name: "Alpha", counties: ["48001"],
  county_weights: [{ fips: "48001", customers_est: 800, share: 0.8 }],
} as UtilityRecord;
const beta = {
  id: "beta", name: "Beta", counties: ["48001", "48003"],
  county_weights: [{ fips: "48001", customers_est: 200, share: 0.2 }, { fips: "48003", customers_est: 500, share: 1 }],
} as UtilityRecord;
const utilities = new Map([alpha, beta].map((u) => [u.id, u]));
const model = {
  county: new Map([["48001", { score: 0.9, level: 5 }], ["48003", { score: 0.1, level: 1 }]]),
  utility: new Map([["alpha", { score: 0.8, level: 4, rank: 1 }], ["beta", { score: 0.2, level: 2, rank: 2 }]]),
  scoredUtilityCount: 2,
} as ScoreModel;

test("statewide, a shared county wears its largest utility's level", () => {
  assert.deepEqual(countyPaintState(shared, utilities, null, model), { level: 4, dim: false, inSelection: false });
});

test("a selected utility includes counties where it is not the largest", () => {
  assert.deepEqual(countyPaintState(shared, utilities, "beta", model), { level: 5, dim: false, inSelection: true });
  assert.deepEqual(countyPaintState(solo, utilities, "alpha", model), { level: 2, dim: true, inSelection: false });
});

test("clicking a shared county with nothing selected asks which utility", () => {
  assert.deepEqual(clickTarget(shared, null, utilities), { kind: "picker", fips: "48001" });
  assert.deepEqual(clickTarget(solo, null, utilities), { kind: "utility", id: "beta" });
});

test("clicking inside the selected utility opens the county", () => {
  assert.deepEqual(clickTarget(shared, "beta", utilities), { kind: "county", fips: "48001" });
  assert.deepEqual(clickTarget(solo, "alpha", utilities), { kind: "utility", id: "beta" });
});

test("picker lists every serving utility with its estimated share, largest first", () => {
  assert.deepEqual(pickerOptions(shared, utilities), [
    { id: "alpha", name: "Alpha", share: 0.8 },
    { id: "beta", name: "Beta", share: 0.2 },
  ]);
});

test("tooltip sits below-right of the cursor and flips near the edges", () => {
  assert.deepEqual(tooltipPosition(100, 100, { width: 200, height: 60 }, { width: 1000, height: 800 }), { left: 112, top: 112 });
  assert.deepEqual(tooltipPosition(950, 780, { width: 200, height: 60 }, { width: 1000, height: 800 }), { left: 738, top: 708 });
});
