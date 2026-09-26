/** Placeholder home devices — eventually from My Home scan / profile. */

export type HomeDeviceKind = "appliance" | "panel" | "battery";

export type HomeDevice = {
  id: string;
  name: string;
  kind: HomeDeviceKind;
  /** Continuous draw estimate; 0 for panel / storage capacity devices */
  watts: number;
  scannedAt: string;
};

/** Catalog used when the camera “locks” an outline during scan. */
export const SCAN_DEVICE_CATALOG: ReadonlyArray<
  Omit<HomeDevice, "id" | "scannedAt">
> = [
  { name: "Refrigerator", kind: "appliance", watts: 150 },
  { name: "Electrical panel", kind: "panel", watts: 0 },
  { name: "Wi‑Fi router", kind: "appliance", watts: 12 },
  { name: "Television", kind: "appliance", watts: 100 },
  { name: "Base Core", kind: "battery", watts: 0 },
  { name: "LED lighting", kind: "appliance", watts: 60 },
  { name: "Laptop charger", kind: "appliance", watts: 65 },
  { name: "Ceiling fans", kind: "appliance", watts: 140 },
];

export function createScannedDevice(
  template: Omit<HomeDevice, "id" | "scannedAt">,
  index: number,
): HomeDevice {
  return {
    ...template,
    id: `device-${Date.now()}-${index}`,
    scannedAt: new Date().toISOString(),
  };
}
