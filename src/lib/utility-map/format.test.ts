import assert from "node:assert/strict";
import { test } from "node:test";
import { dataModeLabel, formatLayerValue, formatPeriod, generationSummary, liveSummary } from "./format.ts";
import type { MapLayerMeta } from "./types.ts";

function meta(id: MapLayerMeta["id"], extra: Partial<MapLayerMeta> = {}): MapLayerMeta {
  return {
    id, group: "grid", label: id, unit: "u", period_start: null, period_end: null, source_ids: [],
    method: null, available: true, coverage: { ok: 1, missing: 0, not_applicable: 0 }, ...extra,
  };
}

test("values read in their own unit", () => {
  assert.equal(formatLayerValue(meta("outages"), 13.038, "ok"), "13 h per customer / yr");
  assert.equal(formatLayerValue(meta("price_spikes"), 12.4, "ok"), "12 h / yr");
  assert.equal(formatLayerValue(meta("homes"), 1533623, "ok"), "1,533,623 homes");
  assert.equal(formatLayerValue(meta("flood"), 5.077, "ok"), "5.1 flood days / yr");
  assert.equal(formatLayerValue(meta("weather"), 41.26, "ok"), "41.3 / 100");
});

test("missing and not-applicable values say so instead of showing zero", () => {
  assert.equal(formatLayerValue(meta("price_spikes"), null, "not_applicable"), "Not applicable outside ERCOT");
  assert.equal(formatLayerValue(meta("flood"), null, "missing"), "No data");
  assert.equal(formatLayerValue(meta("outages"), 0, "ok"), "0 h per customer / yr");
});

test("periods print as years", () => {
  assert.equal(formatPeriod(meta("outages", { period_start: "2018-01-01", period_end: "2025-12-31" })), "2018–2025");
  assert.equal(formatPeriod(meta("flood", { period_start: null, period_end: "2025-12-01" })), "as of Dec 2025");
  assert.equal(formatPeriod(meta("flood", { period_start: null, period_end: null })), "period not recorded");
});

test("the stamp tells mock, partial and real apart", () => {
  assert.equal(dataModeLabel("mock"), "Mockup · dummy data");
  assert.equal(dataModeLabel("partial"), "Partial release · estimates");
  assert.equal(dataModeLabel("real"), "Real data · estimates");
});

test("live warnings never claim all-clear when the feed is down", () => {
  assert.equal(liveSummary({ status: "unavailable", as_of: null, ercot: null, alerts: [] }, ["48001"]),
    "Live warnings unavailable");
  assert.equal(liveSummary({ status: "ok", as_of: "x", ercot: null, alerts: [] }, ["48001"]),
    "No active NWS warnings");
  assert.equal(
    liveSummary({ status: "ok", as_of: "x", ercot: null,
      alerts: [{ fips: "48001", event: "Heat Advisory" }, { fips: "48999", event: "Flood Warning" }] }, ["48001"]),
    "1 county under Heat Advisory");
});

test("generation mix reads as words, biggest first, zeros left out", () => {
  assert.equal(
    generationSummary({ solar: 120, wind: 0, gas: 7927.1, coal: 0, nuclear: 0, storage: 413.5, other: 0 }),
    "8,461 MW: gas 7,927, storage 414, solar 120",
  );
  assert.equal(generationSummary({ solar: 0, wind: 0, gas: 0, coal: 0, nuclear: 0, storage: 0, other: 0 }), "No power plants");
  assert.equal(generationSummary(undefined), null);
});

test("two warnings in one county count as one county", () => {
  assert.equal(
    liveSummary({ status: "ok", as_of: "x", ercot: null,
      alerts: [{ fips: "48371", event: "Flash Flood Warning" }, { fips: "48371", event: "Flash Flood Warning" }] }, ["48371"]),
    "1 county under Flash Flood Warning");
});
