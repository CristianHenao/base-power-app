import type { GeoJSONSource, Map } from "mapbox-gl";
import {
  circlePolygon,
  type WeatherHazard,
} from "@/lib/risk/synthetic-weather";

const SOURCE_ID = "outage-affected-perimeter";
const FILL_ID = "outage-affected-fill-ground";
const OUTLINE_ID = "outage-affected-outline-ground";
const HALO_ID = "outage-affected-halo-ground";
/** Prior slot:"top" layers that tinted buildings — strip on sync */
const LEGACY_LAYER_IDS = [
  "outage-affected-fill",
  "outage-affected-outline",
  "outage-affected-halo",
] as const;

/** Under Standard 3D buildings so rings read as ground impact, not a facade tint */
const GROUND_SLOT = "bottom";

export type OutageLikelihood = "high" | "medium" | "low";

export type OutagePerimeterCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  {
    id: string;
    color: string;
    fillOpacity: number;
    lineOpacity: number;
    lineWidth: number;
    likelihood: OutageLikelihood;
    sort: number;
  }
>;

const EMPTY: OutagePerimeterCollection = {
  type: "FeatureCollection",
  features: [],
};

function bandPolygon(
  center: [number, number],
  outerKm: number,
  innerKm: number,
): GeoJSON.Polygon {
  const outer = circlePolygon(center, outerKm).coordinates[0]!;
  if (innerKm <= 0.02) {
    return { type: "Polygon", coordinates: [outer] };
  }
  const inner = [...circlePolygon(center, innerKm).coordinates[0]!].reverse();
  return { type: "Polygon", coordinates: [outer, inner] };
}

/** Stable 0–1 hash from a string (outage / hazard id). */
function unitFromId(id: string, salt: number): number {
  let hash = salt * 374761393;
  for (let i = 0; i < id.length; i += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 1103515245);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

/**
 * Neighborhood-scale outage cell with likelihood rings.
 * Core = most likely to lose power; outer band = least likely impact.
 * When the outage hit the home block, center the cell on the home.
 * Size fluctuates per event so each card reads differently on the map.
 */
export function buildOutagePerimeter(
  hazard: WeatherHazard | null | undefined,
  options?: {
    home?: [number, number] | null;
    impactedHome?: boolean;
    /** Prefer outage id so each timeline card gets its own footprint */
    seedId?: string;
  },
): OutagePerimeterCollection {
  if (!hazard) return EMPTY;

  const home = options?.home ?? null;
  const center: [number, number] =
    options?.impactedHome && home ? home : hazard.center;
  const seed = options?.seedId ?? hazard.id;

  const sizeJitter = unitFromId(seed, 11);
  const coreJitter = unitFromId(seed, 23);
  const midJitter = unitFromId(seed, 37);
  const severityBoost = (hazard.severity - 1) / 4; // 0–1

  // Wider spread: short feeder blips vs wider neighborhood cells
  const baseRadiusKm = Math.min(
    Math.max(
      hazard.radiusKm * (0.75 + sizeJitter * 0.7) + severityBoost * 0.18,
      0.22,
    ),
    1.15,
  );

  // Vary band thickness so cores/rings don't all match
  const highOuter = 0.28 + coreJitter * 0.18; // ~0.28–0.46
  const mediumOuter = Math.min(
    0.58 + midJitter * 0.2, // ~0.58–0.78
    0.88,
  );
  const mediumInner = highOuter;
  const lowInner = mediumOuter;

  const rings = [
    {
      likelihood: "low" as const,
      outer: 1,
      inner: lowInner,
      color: "#ff6b6b",
      fillOpacity: 0.22,
      lineOpacity: 0.78,
      lineWidth: 1.35,
      sort: 0,
    },
    {
      likelihood: "medium" as const,
      outer: mediumOuter,
      inner: mediumInner,
      color: "#ff3b3b",
      fillOpacity: 0.36,
      lineOpacity: 0.9,
      lineWidth: 1.65,
      sort: 1,
    },
    {
      likelihood: "high" as const,
      outer: highOuter,
      inner: 0,
      color: "#ff1f1f",
      fillOpacity: 0.52,
      lineOpacity: 1,
      lineWidth: 2.15,
      sort: 2,
    },
  ];

  const features: OutagePerimeterCollection["features"] = rings.map((ring) => ({
    type: "Feature" as const,
    properties: {
      id: `${seed}-${ring.likelihood}`,
      color: ring.color,
      fillOpacity: ring.fillOpacity,
      lineOpacity: ring.lineOpacity,
      lineWidth: ring.lineWidth,
      likelihood: ring.likelihood,
      sort: ring.sort,
    },
    geometry: bandPolygon(
      center,
      baseRadiusKm * ring.outer,
      baseRadiusKm * ring.inner,
    ),
  }));

  features.sort((a, b) => a.properties.sort - b.properties.sort);

  return { type: "FeatureCollection", features };
}

/** Southwest / northeast corners covering the perimeter and home. */
export function boundsForOutagePerimeter(
  area: OutagePerimeterCollection,
  home?: [number, number] | null,
): [[number, number], [number, number]] | null {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  function extend(lng: number, lat: number) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  for (const feature of area.features) {
    // Only use the outer ring of each polygon (skip holes)
    const outer = feature.geometry.coordinates[0];
    if (!outer) continue;
    for (const coord of outer) {
      const lng = coord[0];
      const lat = coord[1];
      if (typeof lng === "number" && typeof lat === "number") {
        extend(lng, lat);
      }
    }
  }

  if (home) extend(home[0], home[1]);

  if (!Number.isFinite(minLng) || !Number.isFinite(maxLng)) return null;

  const padLng = Math.max((maxLng - minLng) * 0.06, 0.0015);
  const padLat = Math.max((maxLat - minLat) * 0.06, 0.0015);

  return [
    [minLng - padLng, minLat - padLat],
    [maxLng + padLng, maxLat + padLat],
  ];
}

export function syncOutagePerimeterLayers(
  map: Map,
  data: OutagePerimeterCollection,
  visible: boolean,
) {
  const collection = visible ? data : EMPTY;

  for (const id of LEGACY_LAYER_IDS) {
    if (map.getLayer(id)) map.removeLayer(id);
  }

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
      slot: GROUND_SLOT,
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
      slot: GROUND_SLOT,
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["*", ["get", "lineWidth"], 2.4],
        "line-opacity": 0.28,
        "line-blur": 1.4,
      },
    });
  }

  if (!map.getLayer(OUTLINE_ID)) {
    map.addLayer({
      id: OUTLINE_ID,
      type: "line",
      source: SOURCE_ID,
      slot: GROUND_SLOT,
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["get", "lineWidth"],
        "line-opacity": ["get", "lineOpacity"],
        "line-dasharray": [1.1, 1],
      },
    });
  } else {
    map.setPaintProperty(OUTLINE_ID, "line-width", ["get", "lineWidth"]);
    map.setPaintProperty(OUTLINE_ID, "line-opacity", ["get", "lineOpacity"]);
  }

  const visibility = visible && data.features.length > 0 ? "visible" : "none";
  for (const id of [FILL_ID, HALO_ID, OUTLINE_ID]) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", visibility);
    }
  }
}

export function removeOutagePerimeterLayers(map: Map) {
  for (const id of [...LEGACY_LAYER_IDS, OUTLINE_ID, HALO_ID, FILL_ID]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}
