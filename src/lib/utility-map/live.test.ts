import assert from "node:assert/strict";
import { test } from "node:test";
import { parseNwsAlerts } from "./live.ts";

const NOW = new Date("2026-09-26T22:00:00Z");

function alert(id: string, event: string, same: string[], extra: Record<string, unknown> = {}) {
  return {
    id,
    properties: {
      id,
      event,
      status: "Actual",
      messageType: "Alert",
      expires: "2026-09-26T23:00:00Z",
      ends: null,
      geocode: { SAME: same },
      ...extra,
    },
  };
}

test("keeps actual Texas warnings, one row per county, SAME codes turned into FIPS", () => {
  const alerts = parseNwsAlerts(
    {
      features: [
        alert("a1", "Flash Flood Warning", ["048201", "048167", "022001"]),
        alert("a2", "Heat Advisory", ["048453"]),
        alert("a3", "Tornado Warning", ["048085"], { status: "Test" }),
        alert("a4", "Severe Thunderstorm Warning", ["048355"], { expires: "2026-09-26T21:00:00Z" }),
        alert("a1", "Flash Flood Warning", ["048201"]),
      ],
    },
    NOW,
  );
  assert.deepEqual(alerts, [
    { id: "a1", fips: "48167", event: "Flash Flood Warning", expires: "2026-09-26T23:00:00Z" },
    { id: "a1", fips: "48201", event: "Flash Flood Warning", expires: "2026-09-26T23:00:00Z" },
  ]);
});

test("an alert that has ended is gone even if it has not expired", () => {
  const alerts = parseNwsAlerts(
    { features: [alert("b1", "Flood Warning", ["048201"], { ends: "2026-09-26T21:30:00Z" })] },
    NOW,
  );
  assert.deepEqual(alerts, []);
});

test("a payload without features is an error, not an empty all-clear", () => {
  assert.throws(() => parseNwsAlerts({ title: "error" }, NOW));
});
