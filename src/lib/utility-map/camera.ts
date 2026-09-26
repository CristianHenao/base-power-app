/** Camera choices for the utility map: the opening flight from the globe, and the 3D tilt. */

export const GLOBE_START: { center: [number, number]; zoom: number } = { center: [-98, 22], zoom: 1.2 };

const INTRO_DURATION_MS = 3000;

/** How long the opening flight takes; reduced-motion users land on Texas directly. */
export function introDuration(reducedMotion: boolean): number {
  return reducedMotion ? 0 : INTRO_DURATION_MS;
}

type Tilt = { pitch: number; bearing: number };

/** Where the camera should tilt for 3D on or off, or null when it is already there (so no move cancels a flight). */
export function tiltTarget(current: Tilt, on: boolean): Tilt | null {
  const target = on ? { pitch: 50, bearing: -12 } : { pitch: 0, bearing: 0 };
  const close = Math.abs(current.pitch - target.pitch) < 0.5 && Math.abs(current.bearing - target.bearing) < 0.5;
  return close ? null : target;
}
