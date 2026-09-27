import assert from "node:assert/strict";
import { test } from "node:test";
import { dropUnverified, numbersIn, parseAnswer, unverifiedNumbers } from "./chat-guard.ts";

const allowed = new Set(numbersIn("Harris peak out 1,660,703 (91%). Index 98 of 150. Outages 2.7 h."));

test("numbers are read the same way however they're written", () => {
  assert.deepEqual(numbersIn("1,660,703 customers, 91% and 2.70 h, rank #4"), ["1660703", "91", "2.7", "4"]);
  assert.deepEqual(numbersIn("no numbers here"), []);
});

test("only numbers missing from the facts are flagged", () => {
  assert.deepEqual(unverifiedNumbers("Harris had 1660703 out (91%), index 98.", allowed), []);
  assert.deepEqual(unverifiedNumbers("About 2 million were out, 45% of homes.", allowed), ["2", "45"]);
});

test("place links don't count as numbers: their ids are FIPS codes", () => {
  assert.deepEqual(unverifiedNumbers("[[county:48201|Harris County]] scored 98.", allowed), []);
});

test("sentences with unverified numbers are dropped, the rest kept", () => {
  const out = dropUnverified("Harris scored 98. It lost 45% of power. Hurricanes drive it.", ["45"]);
  assert.equal(out, "Harris scored 98. Hurricanes drive it.");
  assert.equal(dropUnverified("Line one has 7.\nLine two is fine.", ["7"]), "Line two is fine.");
});

test("answers split into text and place links; unknown ids stay plain text", () => {
  const ids = { county: new Set(["48201"]), utility: new Set(["oncor"]) };
  assert.deepEqual(parseAnswer("See [[county:48201|Harris County]] and [[utility:nope|Nope Co]].", ids), [
    { type: "text", text: "See " },
    { type: "place", kind: "county", id: "48201", label: "Harris County" },
    { type: "text", text: " and Nope Co." },
  ]);
});
