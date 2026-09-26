import type { GeoJSONSource, Map } from "mapbox-gl";

const SOURCE_ID = "home-power-glow";
const HEAT_LAYER_ID = "home-power-glow-heat";

type GlowCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  { weight: number }
>;

function glowPoint(home: [number, number]): GlowCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { weight: 1 },
        geometry: { type: "Point", coordinates: home },
      },
    ],
  };
}

export function syncHomePowerGlow(
  map: Map,
  home: [number, number] | null,
  visible: boolean,
) {
  const data =
    visible && home
      ? glowPoint(home)
      : ({ type: "FeatureCollection", features: [] } as GlowCollection);

  for (const layerId of [
    "home-power-glow-fill",
    "home-power-glow-ring",
    "home-lit-building-fill",
    "home-lit-building-outline",
    "home-lit-building-extrusion",
    "bp-streets-buildings-hit",
  ]) {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  }
  for (const sourceId of ["home-lit-building", "bp-streets-buildings"]) {
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  }

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, { type: "geojson", data });
  } else {
    (map.getSource(SOURCE_ID) as GeoJSONSource).setData(data);
  }

  if (!map.getLayer(HEAT_LAYER_ID)) {
    map.addLayer({
      id: HEAT_LAYER_ID,
      type: "heatmap",
      source: SOURCE_ID,
      slot: "top",
      paint: {
        "heatmap-weight": 1,
        "heatmap-intensity": 0.65,
        "heatmap-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          15,
          40,
          17,
          56,
          18,
          68,
        ],
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          "rgba(251,191,36,0)",
          0.25,
          "rgba(251,191,36,0.06)",
          0.55,
          "rgba(251,191,36,0.14)",
          0.85,
          "rgba(253,224,71,0.22)",
          1,
          "rgba(254,243,199,0.28)",
        ],
        "heatmap-opacity": 0.9,
      },
    });
  }

  map.setLayoutProperty(
    HEAT_LAYER_ID,
    "visibility",
    visible && home ? "visible" : "none",
  );
}

export function removeHomePowerGlow(map: Map) {
  for (const layerId of [
    HEAT_LAYER_ID,
    "home-power-glow-fill",
    "home-power-glow-ring",
    "home-lit-building-fill",
    "home-lit-building-outline",
    "home-lit-building-extrusion",
    "bp-streets-buildings-hit",
  ]) {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  }
  for (const sourceId of [
    SOURCE_ID,
    "home-lit-building",
    "bp-streets-buildings",
  ]) {
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  }
}
