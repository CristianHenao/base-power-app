export type MapBasemapConfig = {
  lightPreset?: "dawn" | "day" | "dusk" | "night";
  show3dObjects?: boolean;
  show3dBuildings?: boolean;
  show3dTrees?: boolean;
  show3dLandmarks?: boolean;
  show3dFacades?: boolean;
  showPointOfInterestLabels?: boolean;
  showPlaceLabels?: boolean;
  showRoadLabels?: boolean;
  showTransitLabels?: boolean;
  showLandmarkIcons?: boolean;
};

export const MAP_DEFAULTS = {
  /** Mapbox Standard — includes 3D buildings, trees, landmarks, bridges. */
  style: "mapbox://styles/mapbox/standard",
  center: [-97.7431, 30.2672] as [number, number], // Austin, TX
  zoom: 11,
  homeZoom: 16.5,
  pitch: 60,
  bearing: -20,
  antialias: true,
  basemap: {
    lightPreset: "dusk",
    show3dObjects: true,
    show3dBuildings: true,
    show3dTrees: true,
    show3dLandmarks: true,
    show3dFacades: true,
    showPointOfInterestLabels: true,
    showPlaceLabels: true,
    showRoadLabels: true,
    showTransitLabels: false,
    showLandmarkIcons: true,
  } satisfies MapBasemapConfig,
} as const;

/** Server-only Mapbox token. Do not call from client components. */
export function getMapboxToken(): string | undefined {
  return process.env.NEXT_MAPBOX_ACCESS_TOKEN;
}
