import assert from "node:assert/strict";
import { test } from "node:test";
import { GLOBE_START, introDuration, tiltTarget } from "./camera.ts";

test("the page opens on the whole Earth, over the Americas", () => {
  assert.ok(GLOBE_START.zoom <= 1.5);
  const [lng, lat] = GLOBE_START.center;
  assert.ok(lng < -60 && lng > -130 && lat > 0 && lat < 45);
});

test("the flight into Texas takes 3 seconds, or none with reduced motion", () => {
  assert.equal(introDuration(false), 3000);
  assert.equal(introDuration(true), 0);
});

test("the tilt only moves when it has to, so it never interrupts the opening flight", () => {
  assert.equal(tiltTarget({ pitch: 0, bearing: 0 }, false), null);
  assert.deepEqual(tiltTarget({ pitch: 0, bearing: 0 }, true), { pitch: 50, bearing: -12 });
  assert.equal(tiltTarget({ pitch: 50, bearing: -12 }, true), null);
  assert.deepEqual(tiltTarget({ pitch: 50, bearing: -12 }, false), { pitch: 0, bearing: 0 });
});
