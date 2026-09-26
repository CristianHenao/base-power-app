import type { ExpressionSpecification, GeoJSONSource, Map } from "mapbox-gl";
import { LEVEL_COLORS, NO_DATA_COLOR, type Level } from "@/lib/utility-map/scoring";

export const SOURCE_COUNTIES = "um-counties";
export const SOURCE_TERRITORIES = "um-territories";
export const LAYER_COUNTY_FILL = "um-county-fill";
const LAYER_COUNTY_LINE = "um-county-line";
const LAYER_TERRITORY_LINE = "um-territory-line";
const LAYER_WARNING_LINE = "um-warning-line";
const LAYER_PICKED_LINE = "um-picked-line";
const SOURCE_FLOOD = "um-flood";
const LAYER_FLOOD_FILL = "um-flood-fill";
const LAYER_FLOODWAY = "um-floodway";
const LAYER_FLOODWAY_HATCH = "um-floodway-hatch";
const LAYER_FLOOD_COAST = "um-flood-coast";
const HATCH = "um-hatch";

/** FEMA flood-zone colors (PRD v3 §12.3): the flood hue, light for 0.2%, full for 1%, dark floodway. */
export const FLOOD_ZONE_COLORS = { "0.2pct": "#9ecae1", "1pct": "#2166ac", floodway: "#08306b" } as const;

/** Fill color by the county's 1-5 level, from a five-step ramp (light to dark). */
function levelColor(colors: readonly string[]): ExpressionSpecification {
  return [
    "match",
    ["coalesce", ["feature-state", "level"], 0],
    1, colors[0],
    2, colors[1],
    3, colors[2],
    4, colors[3],
    5, colors[4],
    NO_DATA_COLOR,
  ];
}

const RISK_RAMP = [LEVEL_COLORS[1], LEVEL_COLORS[2], LEVEL_COLORS[3], LEVEL_COLORS[4], LEVEL_COLORS[5]];

/** Switch the county fill between ramps (risk orange, fleet green, ...). */
export function setFillRamp(map: Map, colors: readonly string[] = RISK_RAMP) {
  if (!map.getLayer(LAYER_COUNTY_FILL)) return;
  map.setPaintProperty(LAYER_COUNTY_FILL, "fill-color", levelColor(colors));
}

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
      "fill-color": levelColor(RISK_RAMP),
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

/** A small diagonal-line tile for the floodway hatch. */
function addHatch(map: Map) {
  if (map.hasImage(HATCH)) return;
  const size = 8;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x + y) % size < 2) {
        const i = (y * size + x) * 4;
        data.set([255, 255, 255, 200], i);
      }
    }
  }
  map.addImage(HATCH, { width: size, height: size, data });
}

/** Draw FEMA flood zones for the given counties (merged into one source). Empty hides them. */
export function setFloodZones(map: Map, collections: GeoJSON.FeatureCollection[]) {
  const data: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: collections.flatMap((c) => c.features),
  };
  const source = map.getSource(SOURCE_FLOOD) as GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
    return;
  }
  if (!map.getLayer(LAYER_TERRITORY_LINE)) return;
  addHatch(map);
  map.addSource(SOURCE_FLOOD, { type: "geojson", data });
  const before = LAYER_TERRITORY_LINE;
  map.addLayer(
    {
      id: LAYER_FLOOD_FILL,
      type: "fill",
      source: SOURCE_FLOOD,
      slot: "middle",
      filter: ["!=", ["get", "class"], "floodway"],
      paint: {
        "fill-color": ["match", ["get", "class"], "1pct", FLOOD_ZONE_COLORS["1pct"], FLOOD_ZONE_COLORS["0.2pct"]],
        "fill-opacity": ["match", ["get", "class"], "1pct", 0.55, 0.45],
      },
    },
    before,
  );
  map.addLayer(
    {
      id: LAYER_FLOODWAY,
      type: "fill",
      source: SOURCE_FLOOD,
      slot: "middle",
      filter: ["==", ["get", "class"], "floodway"],
      paint: { "fill-color": FLOOD_ZONE_COLORS.floodway, "fill-opacity": 0.8 },
    },
    before,
  );
  map.addLayer(
    {
      id: LAYER_FLOODWAY_HATCH,
      type: "fill",
      source: SOURCE_FLOOD,
      slot: "middle",
      filter: ["==", ["get", "class"], "floodway"],
      paint: { "fill-pattern": HATCH },
    },
    before,
  );
  map.addLayer(
    {
      id: LAYER_FLOOD_COAST,
      type: "line",
      source: SOURCE_FLOOD,
      slot: "middle",
      filter: ["==", ["get", "coastal"], true],
      paint: { "line-color": FLOOD_ZONE_COLORS.floodway, "line-width": 1 },
    },
    before,
  );
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
