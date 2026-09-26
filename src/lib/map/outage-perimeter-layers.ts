import type { GeoJSONSource, Map } from "mapbox-gl";
import {
  circlePolygon,
  type WeatherHazard,
} from "@/lib/risk/synthetic-weather";

const SOURCE_ID = "outage-affected-perimeter";
const FILL_ID = "outage-affected-fill";
const OUTLINE_ID = "outage-affected-outline";
const HALO_ID = "outage-affected-halo";

export type OutagePerimeterCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  {
    id: string;
    color: string;
    fillOpacity: number;
  }
>;

const EMPTY: OutagePerimeterCollection = {
  type: "FeatureCollection",
  features: [],
};

const EARTH_RADIUS_KM = 6371;

function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Build a single affected-area polygon for the active outage's linked hazard.
 * When the outage hit the home block, expand the radius so the home stays inside.
 */
export function buildOutagePerimeter(
  hazard: WeatherHazard | null | undefined,
  options?: {
    home?: [number, number] | null;
    impactedHome?: boolean;
  },
): OutagePerimeterCollection {
  if (!hazard) return EMPTY;

  const home = options?.home ?? null;
  let radiusKm = hazard.radiusKm;
  if (options?.impactedHome && home) {
    const dist = haversineKm(hazard.center, home);
    radiusKm = Math.max(radiusKm, dist + 0.45);
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          id: hazard.id,
          color: "#ef4444",
          fillOpacity: 0.14,
        },
        geometry: circlePolygon(hazard.center, radiusKm),
      },
    ],
  };
}

export function syncOutagePerimeterLayers(
  map: Map,
  data: OutagePerimeterCollection,
  visible: boolean,
) {
  const collection = visible ? data : EMPTY;

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, { type: "geojson", data: collection });
  } else {
    (map.getSource(SOURCE_ID) as GeoJSONSource).setData(collection);
  }

  if (!map.getLayer(FILL_ID)) {
    map.addLayer({
      id: FILL_ID,
      type: "fill",
      source: SOURCE_ID,
      slot: "top",
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": ["get", "fillOpacity"],
      },
    });
  }

  if (!map.getLayer(HALO_ID)) {
    map.addLayer({
      id: HALO_ID,
      type: "line",
      source: SOURCE_ID,
      slot: "top",
      paint: {
        "line-color": ["get", "color"],
        "line-width": 6,
        "line-opacity": 0.22,
        "line-blur": 1.2,
      },
    });
  }

  if (!map.getLayer(OUTLINE_ID)) {
    map.addLayer({
      id: OUTLINE_ID,
      type: "line",
      source: SOURCE_ID,
      slot: "top",
      paint: {
        "line-color": ["get", "color"],
        "line-width": 2.25,
        "line-opacity": 0.95,
        "line-dasharray": [1.2, 1.1],
      },
    });
  }

  const visibility = visible && data.features.length > 0 ? "visible" : "none";
  for (const id of [FILL_ID, HALO_ID, OUTLINE_ID]) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", visibility);
    }
  }
}

export function removeOutagePerimeterLayers(map: Map) {
  for (const id of [OUTLINE_ID, HALO_ID, FILL_ID]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}
