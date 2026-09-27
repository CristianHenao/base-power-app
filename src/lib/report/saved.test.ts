import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import demoZipCounty from "../../../data/processed/reports/demo_zip_county.json" with { type: "json" };
import { countyFor, savedReport } from "./saved.ts";

const DEMO = new Set(["48085", "48201", "48453"]);

test("persona ZIPs still resolve to their demo counties", () => {
  assert.equal(countyFor({ zip: "75025" }), "48085");
  assert.equal(countyFor({ zip: "77084" }), "48201");
  assert.equal(countyFor({ zip: "78745" }), "48453");
});

test("a non-persona Harris ZIP resolves to 48201 and loads the saved report", () => {
  assert.equal(countyFor({ zip: "77002" }), "48201");
  const report = savedReport({ zip: "77002" });
  assert.ok(report);
  assert.equal(report.location.county_fips, "48201");
  assert.equal(report.report_id, "saved_48201");
});

test("a ZIP outside Collin, Harris, and Travis returns null", () => {
  assert.equal(countyFor({ zip: "75001" }), null); // Dallas majority
  assert.equal(countyFor({ zip: "73949" }), null);
  assert.equal(savedReport({ zip: "75001" }), null);
});

test("demo_zip_county.json matches the three-county rows of zip_county.csv", () => {
  const csv = readFileSync(join(process.cwd(), "data/processed/zip_county.csv"), "utf8");
  const fromCsv: Record<string, string> = {};
  for (const line of csv.trim().split("\n").slice(1)) {
    const [zip, countyFips] = line.split(",");
    if (DEMO.has(countyFips)) fromCsv[zip] = countyFips;
  }
  assert.deepEqual(demoZipCounty, fromCsv);
});
