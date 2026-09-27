import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyNameplateToDevice,
  drawWatts,
  parseDeviceNameplateResult,
  type HomeDevice,
} from "./devices.ts";

function device(partial: Partial<HomeDevice> = {}): HomeDevice {
  return {
    id: "d",
    name: "Over-the-Range Microwave",
    kind: "appliance",
    category: "kitchen",
    brand: null,
    model: null,
    watts: 1000,
    wattsExact: false,
    confidence: 0.5,
    notes: null,
    isMedical: false,
    needsRefrigeration: false,
    isPriority: false,
    thumbnailUrl: null,
    specs: [],
    nameplateScannedAt: null,
    breakers: [],
    panelScannedAt: null,
    scannedAt: "2026-01-01T00:00:00.000Z",
    source: "scan",
    ...partial,
  };
}

test("a category estimate stays an estimate until a nameplate is scanned", () => {
  assert.deepEqual(drawWatts(device()), { watts: 1000, exact: false });
});

test("nameplate input watts replace the estimate and are exact", () => {
  const saved = device({
    nameplateScannedAt: "2026-01-02T00:00:00.000Z",
    specs: [
      { key: "inputWatts", label: "Input power", value: "1,580 W" },
      { key: "outputWatts", label: "Output power", value: "1000 W" },
    ],
  });
  assert.deepEqual(drawWatts(saved), { watts: 1580, exact: true });
});

test("generator backup uses running output, not starting watts", () => {
  const saved = device({
    kind: "generator",
    name: "Dual Fuel Inverter Generator",
    category: "generator",
    watts: 3500,
    nameplateScannedAt: "2026-01-02T00:00:00.000Z",
    specs: [
      { key: "outputWatts", label: "Output power", value: "5.1 kW" },
      { key: "starting", label: "Starting watts", value: "6800 W" },
    ],
  });
  assert.deepEqual(drawWatts(saved), { watts: 5100, exact: true });
});

test("a nameplate scan stores the plate watts on the device", () => {
  const plate = parseDeviceNameplateResult({
    brand: "Whirlpool",
    inputWatts: "1580 W",
    outputWatts: 1000,
    confidence: 0.9,
  });
  assert.ok(plate);
  const next = applyNameplateToDevice(device(), plate);
  assert.equal(next.watts, 1580);
  assert.equal(next.wattsExact, true);
});
