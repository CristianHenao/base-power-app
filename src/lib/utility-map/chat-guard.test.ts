import assert from "node:assert/strict";
import { test } from "node:test";
import { makeChecker, numbersIn, parseAnswer, type Place } from "./chat-guard.ts";

const PLACES: Place[] = [
  { kind: "county", id: "48201", name: "Harris County" },
  { kind: "county", id: "48453", name: "Travis County" },
  { kind: "utility", id: "centerpoint", name: "CenterPoint Energy" },
];
const FACTS = [
  "Bands: Low 1-20, Severe 81-100.",
  "centerpoint | CenterPoint Energy | 98 | Severe | 4",
  "48201 | Harris County | centerpoint | 100 | Severe | 1",
  "48453 | Travis County | austin | 12 | Low | 200",
  "Hurricane Beryl: Harris County 1,660,703 out (90.9%).",
].join("\n");
const check = (question = "") => makeChecker({ facts: FACTS, places: PLACES, userText: question });

test("numbers are read the same way however they're written", () => {
  assert.deepEqual(numbersIn("1,660,703 customers, 91% and 2.70 h, rank #4"), ["1660703", "91", "2.7", "4"]);
  assert.deepEqual(numbersIn("no numbers here"), []);
});

test("a number must belong to the place the sentence is about", () => {
  assert.deepEqual(check().badIn("CenterPoint Energy scores 98, #4."), []);
  assert.deepEqual(check().badIn("Harris County scores 100 and lost 1,660,703 in Beryl."), []);
  // 12 is in the facts, but it's Travis's score, not Harris's.
  assert.deepEqual(check().badIn("Harris County scores 12."), ["12"]);
  assert.deepEqual(check().badIn("[[county:48201|Harris County]] scores 12."), ["12"]);
});

test("general lines (methods, bands) count for any sentence; sentences naming no place use all the facts", () => {
  assert.deepEqual(check().badIn("Harris County is Severe, which is 81-100."), []);
  assert.deepEqual(check().badIn("The top utility scores 98."), []);
  assert.deepEqual(check().badIn("The top utility scores 97."), ["97"]);
});

test("scale words and multipliers can't sneak a new number past the check", () => {
  assert.deepEqual(check().badIn("Harris County lost 1.6 million customers."), ["1.6 million"]);
  assert.deepEqual(check().badIn("Harris County had twice as many outages."), ["twice"]);
});

test("numbers the user wrote are allowed", () => {
  assert.deepEqual(check("What if 5% of homes had a Core?").badIn("At 5% of homes, Harris County would see more backup."), []);
});

test("sentences with unverified numbers are dropped, the rest kept", () => {
  assert.equal(check().drop("Harris County scores 100. Harris County scores 12. Hurricanes drive it."), "Harris County scores 100. Hurricanes drive it.");
  assert.equal(check().drop("The top utility scores 97.\nTravis County scores 12."), "Travis County scores 12.");
});

test("place links show the place's real name and unknown ids stay plain text", () => {
  assert.deepEqual(parseAnswer("See [[county:48201|Travis County]] and [[utility:nope|Nope Co]].", PLACES), [
    { type: "text", text: "See " },
    { type: "place", kind: "county", id: "48201", label: "Harris County" },
    { type: "text", text: " and Nope Co." },
  ]);
});

test("signs and leading decimals are kept, ranges and dates aren't read as negatives", () => {
  assert.deepEqual(numbersIn("-5 and .5 and (−) 1-20 on 2024-07-07"), ["-5", "0.5", "1", "20", "2024", "7", "7"]);
  assert.deepEqual(numbersIn("1,2 and 10,20,30 and 1,660,703"), ["1", "2", "10", "20", "30", "1660703"]);
});

test("broken link syntax from the model shows just the name", () => {
  assert.deepEqual(parseAnswer("See [[county:48201|Harris County] now.", PLACES), [{ type: "text", text: "See Harris County now." }]);
});
