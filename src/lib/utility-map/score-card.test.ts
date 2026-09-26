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

import { riskSummary } from "./score-card.ts";

const fmt = (id: string) =>
  ({ peak_demand: "20,697 MW", price_spikes: "41 h / yr", hurricane: "2.7 passes / decade", winter: "0.5 event days / yr", outages: "11 h per customer / yr" })[id] ?? "?";

test("the summary says where the risk comes from, what drives it, and what happened", () => {
  const text = riskSummary({
    name: "CenterPoint Energy",
    kind: "utility",
    risk: { hazard: 78, stress: 98 },
    ranks: { peak_demand: 0.98, hurricane: 0.97, price_spikes: 0.96, winter: 0.19, outages: 0.9 },
    format: fmt,
    storm: { name: "Hurricane Beryl 2024", peakOut: 2589770, peakPct: null, customerHours: 2.0e8 },
    outagesHours: 11.2,
  });
  assert.deepEqual(text, [
    "CenterPoint Energy's risk comes more from its grid than from the weather.",
    "Its peak demand (20,697 MW) and hurricanes (2.7 passes / decade) rank among the highest in Texas.",
    "Winter freeze (0.5 event days / yr) is lower than most of Texas.",
    "Hurricane Beryl 2024 left 2,589,770 customers in its counties without power at peak.",
    "Customers in its counties average 11 hours of long outages a year.",
  ]);
});

test("a county whose weather and grid are both low says neither stands out", () => {
  const text = riskSummary({
    name: "Coleman County",
    kind: "county",
    risk: { hazard: 27, stress: 32 },
    ranks: { price_spikes: 0.79, outages: 0.04 },
    format: (id) => (({ price_spikes: "40 h / yr", outages: "0.3 h per customer / yr" }) as Record<string, string>)[id] ?? "?",
    storm: null,
    outagesHours: 0.32,
  });
  assert.equal(text[0], "Neither weather nor the grid stands out in Coleman County compared with the rest of Texas.");
  assert.equal(text[1], "Its price spikes (40 h / yr) are above most of Texas.");
  assert.equal(text[2], "Long outages (0.3 h per customer / yr) are lower than most of Texas.");
  assert.equal(text[3], "Homes in this county average 0.3 hours of long outages a year.");
  assert.equal(text.length, 4);
});

import { chapterFor, gridStory } from "./score-card.ts";

test("each question opens the score card at its own chapter", () => {
  assert.equal(chapterFor("risk"), "risk");
  assert.equal(chapterFor("hazards"), "why");
  assert.equal(chapterFor("grid"), "grid");
  assert.equal(chapterFor("fleet"), "base");
});

test("the grid story gives size, rank and local generation for a utility", () => {
  assert.deepEqual(
    gridStory({
      kind: "utility", name: "CenterPoint Energy", customers: 2811820, peakMw: 20697, estimated: false,
      peakRank: 3, peakOf: 150, plantsMw: 18400,
    }),
    [
      "CenterPoint Energy serves 2,811,820 customers with a 20,697 MW summer peak (2024), the 3rd largest of 150 Texas utilities with a known peak.",
      "Power plants in its counties can supply 18,400 MW (all owners, net summer capacity).",
    ],
  );
});

test("the grid story for a county uses its estimated share and says when there are no plants", () => {
  assert.deepEqual(
    gridStory({
      kind: "county", name: "Coleman County", customers: 4018, peakMw: null, estimated: true,
      peakRank: null, peakOf: 254, plantsMw: 0,
    }),
    [
      "Coleman County has 4,018 customers; its share of summer peak demand isn't known (its utilities don't publish one).",
      "No power plants in the county; it draws on the wider grid.",
    ],
  );
  assert.equal(
    gridStory({ kind: "county", name: "Harris County", customers: 1827686, peakMw: 15000, estimated: true, peakRank: 1, peakOf: 254, plantsMw: 9000 })[0],
    "Harris County has 1,827,686 customers and an estimated 15,000 MW of summer peak demand, the largest of 254 Texas counties with a known peak.",
  );
});
