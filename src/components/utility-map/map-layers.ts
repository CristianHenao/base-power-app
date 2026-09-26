import type { ExpressionSpecification, GeoJSONSource, Map } from "mapbox-gl";
import { LEVEL_COLORS, NO_DATA_COLOR, type Level } from "@/lib/utility-map/scoring";

export const SOURCE_COUNTIES = "um-counties";
export const SOURCE_TERRITORIES = "um-territories";
export const LAYER_COUNTY_FILL = "um-county-fill";
const LAYER_COUNTY_LINE = "um-county-line";
const LAYER_TERRITORY_LINE = "um-territory-line";
const LAYER_WARNING_LINE = "um-warning-line";
const LAYER_PICKED_LINE = "um-picked-line";

const levelColor: ExpressionSpecification = [
  "match",
  ["coalesce", ["feature-state", "level"], 0],
  1, LEVEL_COLORS[1],
  2, LEVEL_COLORS[2],
  3, LEVEL_COLORS[3],
  4, LEVEL_COLORS[4],
  5, LEVEL_COLORS[5],
  NO_DATA_COLOR,
];

export function addUtilityMapLayers(
  map: Map,
  counties: GeoJSON.FeatureCollection,
  territories: GeoJSON.FeatureCollection,
  warnedFips: string[],
) {
  if (map.getSource(SOURCE_COUNTIES)) return;

  map.addSource(SOURCE_COUNTIES, { type: "geojson", data: counties });
  map.addSource(SOURCE_TERRITORIES, {
    type: "geojson",
    data: territories,
    promoteId: "utility",
  });

  map.addLayer({
    id: LAYER_COUNTY_FILL,
    type: "fill",
    source: SOURCE_COUNTIES,
    slot: "middle",
    paint: {
      "fill-color": levelColor,
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", "dim"], false],
        0.12,
        ["boolean", ["feature-state", "hover"], false],
        0.95,
        0.8,
      ],
      "fill-color-transition": { duration: 300 },
      "fill-opacity-transition": { duration: 300 },
    },
  });

  // County lines only matter once a utility is open; statewide they stay faint.
  map.addLayer({
    id: LAYER_COUNTY_LINE,
    type: "line",
    source: SOURCE_COUNTIES,
    slot: "middle",
    paint: {
      "line-color": "#ffffff",
      "line-width": ["case", ["boolean", ["feature-state", "inSelection"], false], 1, 0.4],
      "line-opacity": ["case", ["boolean", ["feature-state", "inSelection"], false], 0.9, 0.35],
    },
  });

  map.addLayer({
    id: LAYER_TERRITORY_LINE,
    type: "line",
    source: SOURCE_TERRITORIES,
    slot: "middle",
    paint: {
      "line-color": "#292826",
      "line-width": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        3,
        ["boolean", ["feature-state", "hover"], false],
        2.2,
        1,
      ],
      "line-opacity": 0.85,
    },
  });

  map.addLayer({
    id: LAYER_WARNING_LINE,
    type: "line",
    source: SOURCE_COUNTIES,
    slot: "middle",
    filter: ["in", ["get", "fips"], ["literal", warnedFips]],
    layout: { visibility: "none" },
    paint: {
      "line-color": "#06507e",
      "line-width": 2.2,
      "line-dasharray": [2, 1.5],
    },
  });

  map.addLayer({
    id: LAYER_PICKED_LINE,
    type: "line",
    source: SOURCE_COUNTIES,
    slot: "middle",
    paint: {
      "line-color": "#1e4d2b",
      "line-width": ["case", ["boolean", ["feature-state", "picked"], false], 3.5, 0],
    },
  });
}

export function setWarningsVisible(map: Map, visible: boolean) {
  if (!map.getLayer(LAYER_WARNING_LINE)) return;
  map.setLayoutProperty(LAYER_WARNING_LINE, "visibility", visible ? "visible" : "none");
}

export type CountyPaintState = {
  level: Level | null;
  dim: boolean;
  inSelection: boolean;
  picked: boolean;
};

export function paintCounty(map: Map, fips: string, state: CountyPaintState) {
  map.setFeatureState({ source: SOURCE_COUNTIES, id: Number(fips) }, state);
}

export function paintTerritory(map: Map, utilityId: string, selected: boolean) {
  map.setFeatureState({ source: SOURCE_TERRITORIES, id: utilityId }, { selected });
}

export function setHover(
  map: Map,
  source: typeof SOURCE_COUNTIES | typeof SOURCE_TERRITORIES,
  id: string | number,
  hover: boolean,
) {
  map.setFeatureState({ source, id }, { hover });
}

export function isReady(map: Map): boolean {
  return Boolean(map.getSource(SOURCE_COUNTIES) as GeoJSONSource | undefined);
}
