import type { Map, MapboxGeoJSONFeature } from "mapbox-gl";
import type { OutagePerimeterCollection } from "@/lib/map/outage-perimeter-layers";

const BUILDINGS_TARGET = {
  featuresetId: "buildings",
  importId: "basemap",
} as const;

/** Buildings with grid power (outside the outage cell) — teal like Mapbox dataviz docs */
const COLOR_POWERED = "#5eead4";
/** Buildings inside the outage perimeter — dark / unpowered */
const COLOR_OUTAGE = "#1e293b";
/** Home with Base Power on */
const COLOR_BATTERY = "#fbbf24";

type LngLat = [number, number];

function pointInRing(point: LngLat, ring: LngLat[]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0];
    const yi = ring[i]![1];
    const xj = ring[j]![0];
    const yj = ring[j]![1];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: LngLat, polygon: GeoJSON.Polygon): boolean {
  const [outer, ...holes] = polygon.coordinates;
  if (!outer || !pointInRing(point, outer as LngLat[])) return false;
  for (const hole of holes) {
    if (pointInRing(point, hole as LngLat[])) return false;
  }
  return true;
}

function featureCentroid(
  feature: MapboxGeoJSONFeature,
): LngLat | null {
  const geometry = feature.geometry;
  if (!geometry) return null;

  if (geometry.type === "Point") {
    return geometry.coordinates as LngLat;
  }

  let ring: number[][] | undefined;
  if (geometry.type === "Polygon") {
    ring = geometry.coordinates[0];
  } else if (geometry.type === "MultiPolygon") {
    ring = geometry.coordinates[0]?.[0];
  }

  if (!ring || ring.length === 0) return null;

  let sumLng = 0;
  let sumLat = 0;
  let count = 0;
  for (const coord of ring) {
    if (coord.length < 2) continue;
    sumLng += coord[0]!;
    sumLat += coord[1]!;
    count += 1;
  }
  if (count === 0) return null;
  return [sumLng / count, sumLat / count];
}

function distanceSq(a: LngLat, b: LngLat): number {
  const dLng = a[0] - b[0];
  const dLat = a[1] - b[1];
  return dLng * dLng + dLat * dLat;
}

function applyPowerColors(map: Map) {
  try {
    map.setConfigProperty("basemap", "colorBuildings", COLOR_POWERED);
    map.setConfigProperty("basemap", "colorBuildingSelect", COLOR_OUTAGE);
    map.setConfigProperty("basemap", "colorBuildingHighlight", COLOR_BATTERY);
    // Landmark models don't take feature-state colors
    map.setConfigProperty("basemap", "show3dLandmarks", false);
  } catch (error) {
    console.warn("Unable to set building power colors", error);
  }
}

function applyHomeHighlightColor(map: Map) {
  try {
    map.setConfigProperty("basemap", "colorBuildingHighlight", COLOR_BATTERY);
    map.setConfigProperty("basemap", "show3dLandmarks", false);
  } catch (error) {
    console.warn("Unable to set home highlight color", error);
  }
}

function clearBuildingStates(map: Map) {
  try {
    map.resetFeatureStates(BUILDINGS_TARGET);
  } catch {
    // Older Standard builds may not expose resetFeatureStates for featuresets
  }
}

function queryBuildings(map: Map): MapboxGeoJSONFeature[] {
  try {
    return map.queryRenderedFeatures({
      target: BUILDINGS_TARGET,
    }) as MapboxGeoJSONFeature[];
  } catch (error) {
    console.warn("Unable to query buildings featureset", error);
    return [];
  }
}

function nearestBuilding(
  buildings: MapboxGeoJSONFeature[],
  home: LngLat,
): MapboxGeoJSONFeature | null {
  let nearest: MapboxGeoJSONFeature | null = null;
  let nearestDist = Number.POSITIVE_INFINITY;
  for (const building of buildings) {
    const point = featureCentroid(building);
    if (!point) continue;
    const dist = distanceSq(point, home);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = building;
    }
  }
  return nearest;
}

/**
 * Yellow highlight on the home building only. Other buildings keep their color.
 */
function paintHomeHighlight(map: Map, home: LngLat) {
  applyHomeHighlightColor(map);
  const buildings = queryBuildings(map);
  const nearest = nearestBuilding(buildings, home);
  for (const building of buildings) {
    try {
      map.setFeatureState(building, {
        select: false,
        highlight: building === nearest,
      });
    } catch {
      // Skip features that can't take state
    }
  }
}

/**
 * Shade Standard 3D buildings by power status for the active outage:
 * - inside perimeter → select (dark / no power), unless shadeOutage is false
 * - outside → default colorBuildings
 * - home with Base Power → highlight (amber)
 */
export function syncBuildingPowerStates(
  map: Map,
  options: {
    perimeter: OutagePerimeterCollection | null;
    home: LngLat | null;
    homePowered: boolean;
    active: boolean;
    /** When false, only the home is highlighted yellow. */
    shadeOutage?: boolean;
    /** full = reset then paint; refresh = paint newly visible buildings only */
    mode?: "full" | "refresh";
  },
) {
  const {
    perimeter,
    home,
    homePowered,
    active,
    shadeOutage = true,
    mode = "full",
  } = options;

  if (!active) {
    clearBuildingStates(map);
    return;
  }

  if (!shadeOutage) {
    if (!home || !homePowered) {
      clearBuildingStates(map);
      return;
    }
    if (mode === "full") clearBuildingStates(map);
    paintHomeHighlight(map, home);
    return;
  }

  if (!perimeter || perimeter.features.length === 0) {
    clearBuildingStates(map);
    return;
  }

  applyPowerColors(map);
  if (mode === "full") {
    clearBuildingStates(map);
  }

  const polygons = perimeter.features
    .map((feature) => feature.geometry)
    .filter((geometry): geometry is GeoJSON.Polygon => geometry.type === "Polygon");

  if (polygons.length === 0) return;

  const buildings = queryBuildings(map);
  const nearestHome = home ? nearestBuilding(buildings, home) : null;

  for (const building of buildings) {
    const point = featureCentroid(building);
    if (!point) continue;

    const withoutPower = polygons.some((polygon) =>
      pointInPolygon(point, polygon),
    );

    if (withoutPower) {
      try {
        map.setFeatureState(building, { select: true, highlight: false });
      } catch {
        // Skip features that can't take state
      }
    }
  }

  if (homePowered && nearestHome) {
    try {
      map.setFeatureState(nearestHome, {
        select: false,
        highlight: true,
      });
    } catch {
      // ignore
    }
  }
}

export function removeBuildingPowerStates(map: Map) {
  clearBuildingStates(map);
}
