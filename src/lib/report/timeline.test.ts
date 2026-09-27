import assert from "node:assert/strict";
import { test } from "node:test";
import { reportToTimeline } from "./timeline.ts";
import type { Report } from "./types.ts";

function reportWithEvent(overrides: {
  label?: string;
  duration_h?: Report["events"][number]["duration_h"];
}): Report {
  return {
    report_id: "test",
    location: {
      county_fips: "48453",
      county: "Travis",
      tract_geoid: null,
      weather_zone: "SOUTH_CENTRAL",
      load_zone: "LZ_SOUTH",
      utility: {
        name: null,
        eia_utility_id: null,
        detected_from: "county",
        confirmed: false,
      },
    },
    home: { profile_type: "RESHIWR", label: "test" },
    base_offer: { product: "none", url: null },
    outlook: {
      level: 3,
      label: "Elevated",
      long_outages_per_year: 1,
      interval_90: [0.5, 2],
      once_every_years: 1,
      years_of_data: 10,
      since: 2014,
      customers_floored: false,
    },
    events: [
      {
        id: "48453-2021-02-14-2",
        label: overrides.label ?? "Winter Storm Uri",
        storm: "Winter Storm Uri",
        start: "2021-02-14T12:30:00-06:00",
        end: "2021-02-21T08:45:00-06:00",
        peak_out: 273849,
        peak_out_pct: 42.7,
        duration_h: overrides.duration_h ?? {
          p50: [59.2, 67.3],
          p90: [66.5, 95.9],
        },
        covered: null,
        covered_order: null,
        backup_h: null,
      },
    ],
    backup: {
      hours_by_month: { cores_1: [], cores_2: [] },
      assumptions: {
        kwh_per_core: 39.2,
        kw_per_core: 20,
        start_soc: 0.8,
        mode: "normal",
        profile_year: 2018,
      },
      surprise: {
        start_soc: 0.2,
        hours_by_month: { cores_1: [], cores_2: [] },
      },
    },
    sizing: { cores: null, reason: "test", share: null },
    household_gap: null,
    live: { alerts: [], grid: null },
    narrative: { status: "template", url: null },
    sources: [],
  };
}

test("reportToTimeline maps duration_h.p90 onto durationHours with impactedHome false", () => {
  const [card] = reportToTimeline(reportWithEvent({}));
  assert.equal(card.durationHours, 95.9);
  assert.equal(card.impactedHome, false);
  assert.equal(card.title, "Winter Storm Uri");
  assert.equal(card.scope, "county");
  assert.equal(card.endedAt.getTime(), Date.parse("2021-02-21T08:45:00-06:00"));
});

test("reportToTimeline uses the larger p90 bound when both are present", () => {
  const [card] = reportToTimeline(
    reportWithEvent({
      duration_h: { p50: [10, 12], p90: [20, 40] },
    }),
  );
  assert.equal(card.durationHours, 40);
  assert.equal(card.impactedHome, false);
});

test("reportToTimeline sets durationHours to 0 when p90 values are missing", () => {
  const [card] = reportToTimeline(
    reportWithEvent({
      duration_h: { p50: [null, null], p90: [null, null] },
    }),
  );
  assert.equal(card.durationHours, 0);
  assert.equal(card.impactedHome, false);
});
