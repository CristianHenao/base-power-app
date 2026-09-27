import assert from "node:assert/strict";
import { test } from "node:test";
import { isPublicPath } from "./public-paths.ts";

test("the report, embed, and report API are open without a sign-in", () => {
  for (const path of ["/report", "/embed", "/api/report", "/api/report/rpt_1/narrative", "/api/events"]) {
    assert.equal(isPublicPath(path), true, path);
  }
});

test("the map and onboarding still require a sign-in", () => {
  for (const path of ["/outlook", "/risk", "/onboarding/address", "/crm"]) {
    assert.equal(isPublicPath(path), false, path);
  }
});

test("the home page and existing public prefixes stay open", () => {
  assert.equal(isPublicPath("/"), true);
  assert.equal(isPublicPath("/sign-in"), true);
  assert.equal(isPublicPath("/api/map/token"), true);
});
