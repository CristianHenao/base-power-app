import assert from "node:assert/strict";
import { test } from "node:test";
import { MODES, lensCoverage, matchPreset, parseMode, toggleLayer } from "./controls.ts";
import type { MapLayerMeta, Preset } from "./types.ts";

const layer = (id: MapLayerMeta["id"], available = true) =>
  ({ id, available }) as MapLayerMeta;
const LAYERS = [layer("price_spikes"), layer("outages"), layer("tornado", false), layer("homes")];
const PRESETS: Preset[] = [
  { id: "storms", label: "Severe storms", layers: ["outages", "homes"], requested: ["tornado", "outages", "homes"] },
];

test("turning a layer on keeps the registry order", () => {
  assert.deepEqual(toggleLayer(["homes"], "price_spikes", true, LAYERS), ["price_spikes", "homes"]);
  assert.deepEqual(toggleLayer(["price_spikes", "homes"], "price_spikes", false, LAYERS), ["homes"]);
});

test("an unavailable layer can't be turned on", () => {
  assert.deepEqual(toggleLayer(["homes"], "tornado", true, LAYERS), ["homes"]);
});

test("a manual set matches a lens only when it is exactly the lens", () => {
  assert.equal(matchPreset(["homes", "outages"], PRESETS), "storms");
  assert.equal(matchPreset(["outages"], PRESETS), null);
});

test("lens coverage says how many designed layers are live", () => {
  assert.deepEqual(lensCoverage(PRESETS[0], LAYERS), { available: 2, requested: 3, missing: ["tornado"] });
});

test("mode comes from the URL and falls back to risk", () => {
  assert.deepEqual(MODES.map((m) => m.id), ["risk", "hazards", "grid", "fleet"]);
  assert.equal(parseMode(new URLSearchParams("mode=grid")), "grid");
  assert.equal(parseMode(new URLSearchParams("mode=nope")), "risk");
  assert.equal(parseMode(new URLSearchParams()), "risk");
});
