import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BIVARIATE_COLORS,
  HAZARDS,
  bivariateClass,
  efWidth,
  fingerprintRows,
  outageShareLevel,
  hazardLevel,
  overlapCount,
} from "./hazard-style.ts";
import type { CountyRecord } from "./types.ts";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test("every hazard has an identity color, an icon and a light-to-dark five-step ramp", () => {
  for (const hazard of Object.values(HAZARDS)) {
    assert.equal(hazard.ramp.length, 5);
    assert.ok(hazard.ramp.includes(hazard.color), `${hazard.label} ramp includes its color`);
    assert.ok(hazard.icon);
    const lum = hazard.ramp.map(luminance);
    assert.ok(lum.every((l, i) => i === 0 || l < lum[i - 1]), `${hazard.label} ramp gets darker`);
  }
});

test("identity colors are the validated palette from PRD v3 §12.5", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(HAZARDS).map(([id, h]) => [id, h.color])),
    { flood: "#2166ac", severe_storm: "#b07a00", tornado: "#9c3fb0", hurricane: "#00897b", heat: "#d6452b", winter: "#5b8fd9" },
  );
});

test("hazard level is the rank's fifth, 1 to 5", () => {
  assert.deepEqual([0, 0.19, 0.2, 0.55, 0.8, 1].map(hazardLevel), [1, 1, 2, 3, 5, 5]);
  assert.equal(hazardLevel(null), null);
});

test("bivariate class pairs the two ranks' thirds", () => {
  assert.equal(bivariateClass(0.1, 0.1), 1);
  assert.equal(bivariateClass(0.1, 0.9), 3);
  assert.equal(bivariateClass(0.9, 0.1), 7);
  assert.equal(bivariateClass(0.9, 0.9), 9);
  assert.equal(bivariateClass(0.5, null), null);
  assert.equal(BIVARIATE_COLORS.length, 9);
});

test("overlap counts active hazards where the county is in the top fifth", () => {
  const county = { ranks: { flood: 0.95, tornado: 0.8, hurricane: 0.4, outages: 0.99 } } as unknown as CountyRecord;
  assert.equal(overlapCount(county, ["flood", "tornado", "hurricane", "outages"]), 2);
});

test("tornado line width grows with EF rating", () => {
  assert.deepEqual([-9, 0, 1, 2, 3, 4, 5].map(efWidth), [1, 1, 1.5, 2.5, 3.5, 4.5, 4.5]);
});

test("fingerprint rows sort by rank, flag the top fifth and keep unknowns last", () => {
  const rows = fingerprintRows({ flood: 0.95, tornado: 0.3, hurricane: null, heat: 0.8 });
  assert.deepEqual(rows.map((r) => [r.hazard, r.topFifth]), [
    ["flood", true], ["heat", true], ["tornado", false], ["hurricane", false],
  ]);
});

test("storm outage levels use fixed share-out bins", () => {
  assert.deepEqual([0.5, 5, 14.9, 15, 30, 49, 50, 99].map(outageShareLevel), [1, 2, 2, 3, 4, 4, 5, 5]);
});
