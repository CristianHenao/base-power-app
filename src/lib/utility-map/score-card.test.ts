import assert from "node:assert/strict";
import { test } from "node:test";
import { riskDrivers, worstStorm } from "./score-card.ts";
import type { SpotlightStorm } from "./hazard-style.ts";

const storm = (name: string, start: string, counties: [string, number, number | null, number][]): SpotlightStorm => ({
  name, start, end: start, source: null, note: null, track_storm_id: null,
  counties: counties.map(([fips, peak_out, peak_out_pct, customer_hours]) => ({ fips, peak_out, peak_out_pct, customer_hours })),
});

test("risk drivers are the three highest-ranked of the nine index layers, unknowns left out", () => {
  const drivers = riskDrivers({
    flood: 0.2, tornado: 0.95, severe_storm: null, hurricane: 0.9, winter: 0.1, heat: 0.5,
    outages: 0.97, price_spikes: null, peak_demand: 0.4, homes: 1, generation: 1, weather: 1,
  });
  assert.deepEqual(drivers.map((d) => d.id), ["outages", "tornado", "hurricane"]);
  assert.equal(drivers[0].percentile, 97);
});

test("the worst recorded storm is the one with the most customer-hours out in these counties", () => {
  const storms = [
    storm("Winter Storm Uri", "2021-02-13", [["48201", 1000, 50, 9000], ["48001", 10, 1, 10]]),
    storm("Hurricane Beryl", "2024-07-08", [["48201", 1500, 60, 5000], ["48453", 900, null, 8000]]),
  ];
  const worst = worstStorm(storms, ["48201", "48453"])!;
  assert.equal(worst.name, "Hurricane Beryl 2024");
  assert.equal(worst.peakOut, 2400);
  assert.equal(worst.customerHours, 13000);
  assert.equal(worst.peakPct, null); // a share can't be summed across counties
  const single = worstStorm(storms, ["48201"])!;
  assert.equal(single.name, "Winter Storm Uri 2021");
  assert.equal(single.peakPct, 50);
  assert.equal(worstStorm(storms, ["48999"]), null);
});

import { bandMeaning, halfReading, rankSentence, scoreFactors } from "./score-card.ts";

test("the headline says where the place stands among its Texas peers", () => {
  assert.equal(
    rankSentence("Coleman County", { rank: 221, of: 254, level: 1 }, "county"),
    "Coleman County is at lower grid risk than most of Texas: #221 of 254 counties, and only 33 score lower.",
  );
  assert.equal(
    rankSentence("CenterPoint Energy", { rank: 4, of: 150, level: 5 }, "utility"),
    "CenterPoint Energy is among the most at-risk grids in Texas: #4 of 150 utilities.",
  );
  assert.equal(
    rankSentence("Travis County", { rank: 120, of: 254, level: 3 }, "county"),
    "Travis County is near the Texas middle for grid risk: #120 of 254 counties.",
  );
});

test("each band says what it means, and that it is relative", () => {
  assert.match(bandMeaning(1, "county"), /least at-risk fifth of Texas counties/);
  assert.match(bandMeaning(1, "county"), /not no risk/);
  assert.match(bandMeaning(5, "utility"), /most at-risk fifth of Texas utilities/);
});

test("each half reads as a share of peers", () => {
  assert.equal(halfReading(27, "county"), "Riskier than about 26% of Texas counties");
  assert.equal(halfReading(100, "utility"), "Riskier than about 100% of Texas utilities");
  assert.equal(halfReading(null, "county"), "No data");
});

test("factors split into what raises the risk and what keeps it down, strongest first", () => {
  const { raising, lowering } = scoreFactors({
    flood: 0.41, tornado: 0.51, severe_storm: 0.54, hurricane: 0.24, winter: 0.66, heat: 0.09,
    outages: 0.04, price_spikes: 0.79, peak_demand: 0.08,
  });
  assert.deepEqual(raising.map((f) => f.id), ["price_spikes", "winter"]);
  assert.deepEqual(lowering.map((f) => f.id), ["outages", "peak_demand", "heat"]);
  assert.equal(raising[0].percentile, 79);
});
