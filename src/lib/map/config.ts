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
  /** Close zoom while scrubbing an outage that hit the home block */
  outageHomeZoom: 17.55,
  /** FitBounds caps while paging outage cards (closer than full radius) */
  cardScrubMaxZoom: 17.55,
  cardScrubMinZoom: 16.55,
  /** Neighborhood pullback during battery capacity focus */
  batteryRevealZoom: 16.05,
  pitch: 60,
  bearing: -20,
  /** Shallower pitch so the block and nearby streets read clearly */
  batteryRevealPitch: 52,
  /** Mild angle over the neighborhood in capacity mode */
  batteryRevealBearing: -10,
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
  /** Neighborhood blackout look while replaying an outage — dark, not pitch-black */
  outageBasemap: {
    lightPreset: "night",
    show3dObjects: true,
    show3dBuildings: true,
    show3dTrees: true,
    show3dLandmarks: true,
    show3dFacades: true,
    showPointOfInterestLabels: false,
    showPlaceLabels: true,
    showRoadLabels: true,
    showTransitLabels: false,
    showLandmarkIcons: false,
  } satisfies MapBasemapConfig,
} as const;

/** Server-only Mapbox token. Do not call from client components. */
export function getMapboxToken(): string | undefined {
  return process.env.NEXT_MAPBOX_ACCESS_TOKEN;
}
