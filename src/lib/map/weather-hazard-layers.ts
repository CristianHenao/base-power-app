import type { GeoJSONSource, Map } from "mapbox-gl";
import type { WeatherHeatmapCollection } from "@/lib/risk/synthetic-weather";

const SOURCE_ID = "weather-heatmap";
const HEAT_LAYER_ID = "weather-heatmap-layer";

const EMPTY: WeatherHeatmapCollection = {
  type: "FeatureCollection",
  features: [],
};

const LEGACY_LAYER_IDS = [
  "weather-hazards-fill",
  "weather-hazards-outline",
  "weather-hazards-label",
] as const;
const LEGACY_SOURCE_IDS = ["weather-hazards", "weather-hazard-labels"] as const;

function removeLegacyCircleLayers(map: Map) {
  for (const layerId of LEGACY_LAYER_IDS) {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  }
  for (const sourceId of LEGACY_SOURCE_IDS) {
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  }
}

export function syncWeatherHazardLayers(
  map: Map,
  points: WeatherHeatmapCollection,
  visible: boolean,
) {
  removeLegacyCircleLayers(map);

  const data = visible ? points : EMPTY;

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data,
    });
  } else {
    (map.getSource(SOURCE_ID) as GeoJSONSource).setData(data);
  }

  if (!map.getLayer(HEAT_LAYER_ID)) {
    map.addLayer({
      id: HEAT_LAYER_ID,
      type: "heatmap",
      source: SOURCE_ID,
      slot: "top",
      maxzoom: 18,
      paint: {
        "heatmap-weight": [
          "interpolate",
          ["linear"],
          ["get", "weight"],
          0,
          0,
          2,
          0.35,
          5,
          0.85,
          8,
          1,
        ],
        "heatmap-intensity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          0.7,
          14,
          1.35,
          16,
          1.8,
        ],
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          "rgba(0,0,0,0)",
          0.15,
          "rgba(56,189,248,0.45)",
          0.35,
          "rgba(34,197,94,0.55)",
          0.55,
          "rgba(250,204,21,0.7)",
          0.75,
          "rgba(249,115,22,0.85)",
          1,
          "rgba(239,68,68,0.95)",
        ],
        "heatmap-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          28,
          12,
          42,
          14,
          58,
          16,
          78,
        ],
        "heatmap-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          11,
          0.85,
          16,
          0.7,
        ],
      },
    });
  }

  map.setLayoutProperty(
    HEAT_LAYER_ID,
    "visibility",
    visible ? "visible" : "none",
  );
}

export function removeWeatherHazardLayers(map: Map) {
  removeLegacyCircleLayers(map);
  if (map.getLayer(HEAT_LAYER_ID)) map.removeLayer(HEAT_LAYER_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}
