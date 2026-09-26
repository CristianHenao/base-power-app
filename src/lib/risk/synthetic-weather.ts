export type WeatherHazardKind = "storm" | "snow" | "heat";

export type WeatherHazard = {
  id: string;
  kind: WeatherHazardKind;
  title: string;
  summary: string;
  /** 1 (watch) → 5 (extreme) */
  severity: 1 | 2 | 3 | 4 | 5;
  /** How hard this event stresses local electric demand / outages */
  gridImpact: string;
  /** Hazard center [lng, lat] */
  center: [number, number];
  /** Approx radius in kilometers */
  radiusKm: number;
};

export type WeatherHazardFeatureProperties = {
  id: string;
  kind: WeatherHazardKind;
  title: string;
  summary: string;
  severity: number;
  gridImpact: string;
  color: string;
  fillOpacity: number;
};

export type WeatherHazardFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  WeatherHazardFeatureProperties
>;

export const WEATHER_HAZARD_META: Record<
  WeatherHazardKind,
  {
    label: string;
    color: string;
    description: string;
  }
> = {
  storm: {
    label: "Severe storm",
    color: "#6366f1",
    description: "Wind, lightning, and line damage risk",
  },
  snow: {
    label: "Winter storm",
    color: "#38bdf8",
    description: "Ice loading and heating demand spikes",
  },
  heat: {
    label: "Extreme heat",
    color: "#f97316",
    description: "Peak cooling load and transformer stress",
  },
};

const EARTH_RADIUS_KM = 6371;

/** Deterministic 0–1 value from home coordinates + salt. */
function seededUnit(lng: number, lat: number, salt: number): number {
  const x = Math.sin(lng * 12.9898 + lat * 78.233 + salt * 45.164) * 43758.5453;
  return x - Math.floor(x);
}

function offsetLngLat(
  lng: number,
  lat: number,
  distanceKm: number,
  bearingDeg: number,
): [number, number] {
  const bearing = (bearingDeg * Math.PI) / 180;
  const angular = distanceKm / EARTH_RADIUS_KM;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );

  return [(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
}

/** Approximate circle as a GeoJSON polygon. */
export function circlePolygon(
  center: [number, number],
  radiusKm: number,
  steps = 64,
): GeoJSON.Polygon {
  const [lng, lat] = center;
  const coordinates: [number, number][] = [];

  for (let i = 0; i <= steps; i += 1) {
    const bearing = (i / steps) * 360;
    coordinates.push(offsetLngLat(lng, lat, radiusKm, bearing));
  }

  return {
    type: "Polygon",
    coordinates: [coordinates],
  };
}

/**
 * Synthetic grid-relevant weather events clustered around a home.
 * Stable for a given coordinate so the demo feels consistent.
 */
export function generateSyntheticWeatherHazards(
  home: [number, number],
): WeatherHazard[] {
  const [lng, lat] = home;

  const templates: Array<{
    kind: WeatherHazardKind;
    title: string;
    summary: string;
    gridImpact: string;
    severity: WeatherHazard["severity"];
    bearing: number;
    distanceKm: number;
    radiusKm: number;
  }> = [
    {
      kind: "storm",
      title: "Severe thunderstorm cell",
      summary:
        "Damaging winds and lightning moving across nearby feeders this evening.",
      gridImpact: "Elevated outage risk from downed lines and momentary faults.",
      severity: 4,
      bearing: 35 + seededUnit(lng, lat, 1) * 40,
      distanceKm: 0.35 + seededUnit(lng, lat, 2) * 0.55,
      radiusKm: 0.45 + seededUnit(lng, lat, 3) * 0.25,
    },
    {
      kind: "snow",
      title: "Winter storm / ice band",
      summary:
        "Freezing rain and wet snow loading trees and overhead conductors.",
      gridImpact: "Ice accretion can snap laterals; heating load rises overnight.",
      severity: 3,
      bearing: 200 + seededUnit(lng, lat, 4) * 50,
      distanceKm: 0.5 + seededUnit(lng, lat, 5) * 0.7,
      radiusKm: 0.55 + seededUnit(lng, lat, 6) * 0.3,
    },
    {
      kind: "heat",
      title: "Extreme heat dome",
      summary:
        "Prolonged 100°F+ temperatures driving simultaneous AC demand.",
      gridImpact: "Transformer and feeder overload risk during late-afternoon peak.",
      severity: 5,
      bearing: 280 + seededUnit(lng, lat, 7) * 45,
      distanceKm: 0.25 + seededUnit(lng, lat, 8) * 0.45,
      radiusKm: 0.65 + seededUnit(lng, lat, 9) * 0.3,
    },
    {
      kind: "storm",
      title: "Secondary wind corridor",
      summary: "Gusty outflow boundary brushing the northwest service area.",
      gridImpact: "Brief voltage sags possible on exposed radial circuits.",
      severity: 2,
      bearing: 120 + seededUnit(lng, lat, 10) * 35,
      distanceKm: 0.8 + seededUnit(lng, lat, 11) * 0.6,
      radiusKm: 0.35 + seededUnit(lng, lat, 12) * 0.2,
    },
  ];

  return templates.map((template, index) => ({
    id: `wx-${template.kind}-${index}`,
    kind: template.kind,
    title: template.title,
    summary: template.summary,
    severity: template.severity,
    gridImpact: template.gridImpact,
    center: offsetLngLat(lng, lat, template.distanceKm, template.bearing),
    radiusKm: template.radiusKm,
  }));
}

export function hazardsToGeoJSON(
  hazards: WeatherHazard[],
  options?: { highlightId?: string | null },
): WeatherHazardFeatureCollection {
  const highlightId = options?.highlightId ?? null;
  return {
    type: "FeatureCollection",
    features: hazards.map((hazard) => {
      const meta = WEATHER_HAZARD_META[hazard.kind];
      const isHighlighted = highlightId != null && hazard.id === highlightId;
      const dimmed = highlightId != null && !isHighlighted;
      const fillOpacity = dimmed
        ? 0.08
        : isHighlighted
          ? Math.min(0.55, 0.28 + hazard.severity * 0.06)
          : 0.18 + hazard.severity * 0.06;
      return {
        type: "Feature",
        properties: {
          id: hazard.id,
          kind: hazard.kind,
          title: hazard.title,
          summary: hazard.summary,
          severity: hazard.severity,
          gridImpact: hazard.gridImpact,
          color: meta.color,
          fillOpacity,
        },
        geometry: circlePolygon(hazard.center, hazard.radiusKm),
      };
    }),
  };
}

export type WeatherHeatPointProperties = {
  weight: number;
  hazardId: string;
};

export type WeatherHeatmapCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  WeatherHeatPointProperties
>;

/**
 * Dense weighted points for a Mapbox heatmap, derived from hazard cells
 * around the home. Highlighting boosts one hazard’s contribution.
 */
export function hazardsToHeatmapGeoJSON(
  hazards: WeatherHazard[],
  options?: {
    highlightId?: string | null;
    home?: [number, number] | null;
  },
): WeatherHeatmapCollection {
  const highlightId = options?.highlightId ?? null;
  const home = options?.home ?? null;
  const features: WeatherHeatmapCollection["features"] = [];

  for (const hazard of hazards) {
    const isHighlighted = highlightId != null && hazard.id === highlightId;
    const dimmed = highlightId != null && !isHighlighted;
    const severityBoost = dimmed ? 0.35 : isHighlighted ? 1.45 : 1;
    const baseWeight = hazard.severity * severityBoost;

    // Center spike
    features.push({
      type: "Feature",
      properties: { weight: baseWeight, hazardId: hazard.id },
      geometry: { type: "Point", coordinates: hazard.center },
    });

    // Concentric rings → smooth heat blob instead of hard circles
    const rings = 5;
    for (let ring = 1; ring <= rings; ring += 1) {
      const dist = (hazard.radiusKm * ring) / rings;
      const falloff = 1 - ring / (rings + 0.5);
      const pointsOnRing = 8 + ring * 4;
      for (let i = 0; i < pointsOnRing; i += 1) {
        const bearing = (i / pointsOnRing) * 360;
        const [lng, lat] = offsetLngLat(
          hazard.center[0],
          hazard.center[1],
          dist,
          bearing,
        );
        features.push({
          type: "Feature",
          properties: {
            weight: baseWeight * falloff,
            hazardId: hazard.id,
          },
          geometry: { type: "Point", coordinates: [lng, lat] },
        });
      }
    }
  }

  // Soft ambient risk near home so the field feels continuous
  if (home) {
    for (let ring = 0; ring < 3; ring += 1) {
      const dist = 0.4 + ring * 0.7;
      const count = ring === 0 ? 1 : 10 + ring * 4;
      for (let i = 0; i < count; i += 1) {
        const bearing = count === 1 ? 0 : (i / count) * 360;
        const coords =
          ring === 0
            ? home
            : offsetLngLat(home[0], home[1], dist, bearing);
        features.push({
          type: "Feature",
          properties: {
            weight: 1.2 - ring * 0.25,
            hazardId: "home-ambient",
          },
          geometry: { type: "Point", coordinates: coords },
        });
      }
    }
  }

  return { type: "FeatureCollection", features };
}

/** Zoom level that roughly frames the hazard cluster around home. */
export const WEATHER_ANALYSIS_ZOOM = 12.2;
