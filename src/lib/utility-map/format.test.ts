import assert from "node:assert/strict";
import { test } from "node:test";
import { dataModeLabel, formatLayerValue, formatPeriod, liveSummary } from "./format.ts";
import type { MapLayerMeta } from "./types.ts";

function meta(id: MapLayerMeta["id"], extra: Partial<MapLayerMeta> = {}): MapLayerMeta {
  return {
    id, group: "grid", label: id, unit: "u", period_start: null, period_end: null, source_ids: [],
    method: null, available: true, coverage: { ok: 1, missing: 0, not_applicable: 0 }, ...extra,
  };
}

test("values read in their own unit", () => {
  assert.equal(formatLayerValue(meta("outages"), 0.2745, "ok"), "0.27 per home / yr");
  assert.equal(formatLayerValue(meta("price_spikes"), 12.4, "ok"), "12 h / yr");
  assert.equal(formatLayerValue(meta("homes"), 1533623, "ok"), "1,533,623 homes");
  assert.equal(formatLayerValue(meta("flood"), 41.26, "ok"), "41.3 / 100");
});

test("missing and not-applicable values say so instead of showing zero", () => {
  assert.equal(formatLayerValue(meta("price_spikes"), null, "not_applicable"), "Not applicable outside ERCOT");
  assert.equal(formatLayerValue(meta("flood"), null, "missing"), "No data");
  assert.equal(formatLayerValue(meta("outages"), 0, "ok"), "0 per home / yr");
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
