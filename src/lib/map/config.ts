export const MAP_DEFAULTS = {
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-97.7431, 30.2672] as [number, number], // Austin, TX
  zoom: 11,
  homeZoom: 16,
  pitch: 45,
  bearing: -17.6,
  antialias: true,
} as const;

export function getMapboxToken(): string | undefined {
  return process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
}
