export const MAP_DEFAULTS = {
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-97.7431, 30.2672] as [number, number], // Austin, TX
  zoom: 11,
  homeZoom: 16,
  pitch: 45,
  bearing: -17.6,
  antialias: true,
} as const;

/** Server-only Mapbox token. Do not call from client components. */
export function getMapboxToken(): string | undefined {
  return process.env.NEXT_MAPBOX_ACCESS_TOKEN;
}
