import assert from "node:assert/strict";
import { test } from "node:test";
import { centralRange } from "./format.ts";

test("centralRange shows both ends of an outage in Central time", () => {
  const range = centralRange("2024-07-08T09:15:00-05:00", "2024-07-17T14:30:00-05:00");
  assert.match(range, /Jul 8.*9:15\s?AM/);
  assert.match(range, /Jul 17, 2024.*2:30\s?PM/);
});
