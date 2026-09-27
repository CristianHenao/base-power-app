import assert from "node:assert/strict";
import { test } from "node:test";
import { breakerForDevice } from "./breaker-for-device.ts";
import type { HomeDevice, PanelBreaker } from "./devices.ts";

function device(partial: Partial<HomeDevice> = {}): HomeDevice {
  return {
    id: "d",
    name: "Refrigerator",
    kind: "appliance",
    category: "kitchen",
    brand: null,
    model: null,
    watts: 150,
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

function breaker(partial: Partial<PanelBreaker> = {}): PanelBreaker {
  return {
    id: "b",
    position: "12",
    amps: 20,
    label: "Refrigerator",
    side: "left",
    isMain: false,
    isSpare: false,
    confidence: 0.8,
    ...partial,
  };
}

function panel(breakers: PanelBreaker[]): HomeDevice {
  return device({
    id: "panel",
    name: "Electrical Breaker Panel",
    kind: "panel",
    category: "panel",
    breakers,
    panelScannedAt: "2026-01-02T00:00:00.000Z",
  });
}

test("a scanned directory label matches the device and returns its slot", () => {
  const fridge = device({ name: "Refrigerator" });
  const match = breakerForDevice(fridge, [
    fridge,
    panel([breaker({ position: "12", label: "Fridge" })]),
  ]);
  assert.equal(match?.position, "12");
});

test("a short panel label matches the longer device name", () => {
  const microwave = device({ name: "Over-the-Range Microwave" });
  const match = breakerForDevice(microwave, [
    microwave,
    panel([breaker({ position: "8", label: "Microwave" })]),
  ]);
  assert.equal(match?.position, "8");
});

test("an outdoor condenser matches an A/C breaker", () => {
  const ac = device({ name: "Outdoor AC Condenser Unit" });
  const match = breakerForDevice(ac, [
    ac,
    panel([breaker({ position: "3/5", label: "A/C" })]),
  ]);
  assert.equal(match?.position, "3/5");
});

test("spares, mains, and unlabeled slots are not a match", () => {
  const fridge = device({ name: "Refrigerator" });
  const match = breakerForDevice(fridge, [
    fridge,
    panel([
      breaker({ position: "1", label: "Main", isMain: true }),
      breaker({ position: "2", label: "Spare", isSpare: true }),
      breaker({ position: "4", label: "Unlabeled" }),
    ]),
  ]);
  assert.equal(match, null);
});

test("a device with no matching circuit returns null", () => {
  const cpap = device({ name: "CPAP Machine", kind: "medical" });
  const match = breakerForDevice(cpap, [
    cpap,
    panel([breaker({ position: "6", label: "Dishwasher" })]),
  ]);
  assert.equal(match, null);
});
