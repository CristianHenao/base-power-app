"use client";

import type { Map, MapMouseEvent } from "mapbox-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapViewClient } from "@/components/map/map-view-client";
import { Skeleton } from "@/components/ui/skeleton";
import { ControlsPanel } from "@/components/utility-map/controls-panel";
import { DetailPanel } from "@/components/utility-map/detail-panel";
import {
  LAYER_COUNTY_FILL,
  SOURCE_COUNTIES,
  SOURCE_TERRITORIES,
  addUtilityMapLayers,
  paintCounty,
  paintTerritory,
  setHover,
  setWarningsVisible,
} from "@/components/utility-map/map-layers";
import { matchPreset, parseMode, toggleLayer, type ModeId } from "@/lib/utility-map/controls";
import { dataModeLabel } from "@/lib/utility-map/format";
import { loadUtilityMap, type LoadedMap } from "@/lib/utility-map/load";
import { LEVEL_LABELS, buildScoreModel } from "@/lib/utility-map/scoring";
import { clickTarget, countyPaintState } from "@/lib/utility-map/selection";
import type { LayerId, Preset } from "@/lib/utility-map/types";

const TEXAS_BOUNDS: [[number, number], [number, number]] = [
  [-106.65, 25.84],
  [-93.51, 36.5],
];
const MAP_CENTER: [number, number] = [-99.3, 31.3];
const FLAT_BASEMAP = {
  lightPreset: "day",
  show3dObjects: false,
  show3dBuildings: false,
  show3dTrees: false,
  show3dLandmarks: false,
  show3dFacades: false,
  showPointOfInterestLabels: false,
  showRoadLabels: false,
  showTransitLabels: false,
  showLandmarkIcons: false,
  showPlaceLabels: true,
} as const;

type Loaded = LoadedMap;

type Tooltip = { x: number; y: number; title: string; detail: string };

function mapPadding() {
  if (typeof window === "undefined" || window.innerWidth < 1024) {
    return { top: 80, bottom: 40, left: 24, right: 24 };
  }
  return { top: 80, bottom: 40, left: 340, right: 420 };
}

function boundsOf(features: GeoJSON.Feature[]): [[number, number], [number, number]] {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const visit = (coords: unknown): void => {
    if (Array.isArray(coords) && typeof coords[0] === "number") {
      const [x, y] = coords as number[];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      return;
    }
    if (Array.isArray(coords)) coords.forEach(visit);
  };
  for (const f of features) {
    if (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon") {
      visit(f.geometry.coordinates);
    }
  }
  return [[minX, minY], [maxX, maxY]];
}

export function UtilityMapExperience() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [map, setMap] = useState<Map | null>(null);
  const [activeLayers, setActiveLayers] = useState<LayerId[]>(["outages", "weather", "homes"]);
  const [activePresetId, setActivePresetId] = useState<string | null>("winter");
  const [showWarnings, setShowWarnings] = useState(false);
  const [mode, setMode] = useState<ModeId>("risk");
  const [selectedUtilityId, setSelectedUtilityId] = useState<string | null>(null);
  const [selectedFips, setSelectedFips] = useState<string | null>(null);
  const [pickerFips, setPickerFips] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const fetchJson = (url: string) =>
      fetch(url, { signal: controller.signal }).then((r) => {
        if (!r.ok) throw new Error(`Couldn't load ${url} (${r.status}).`);
        return r.json();
      });
    const search = new URLSearchParams(window.location.search);
    loadUtilityMap(search, fetchJson)
      .then((result) => {
        setLoaded(result);
        setMode(parseMode(search));
        const lens = result.data.presets.find((p) => p.id === "winter") ?? result.data.presets[0];
        if (lens) {
          setActiveLayers(lens.layers);
          setActivePresetId(lens.id);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(err instanceof Error ? err.message : "Couldn't load map data.");
        }
      });
    return () => controller.abort();
  }, []);

  const data = loaded?.data ?? null;
  const model = useMemo(
    () => (data ? buildScoreModel(data, activeLayers) : null),
    [data, activeLayers],
  );
  const countiesByFips = useMemo(
    () => new globalThis.Map((data?.counties ?? []).map((c) => [c.fips, c])),
    [data],
  );
  const utilitiesById = useMemo(
    () => new globalThis.Map((data?.utilities ?? []).map((u) => [u.id, u])),
    [data],
  );
  const selectedUtility = selectedUtilityId ? utilitiesById.get(selectedUtilityId) ?? null : null;
  const selectedCounty = selectedFips ? countiesByFips.get(selectedFips) ?? null : null;

  // Handlers read the latest state through a ref; Mapbox keeps the first closure.
  const latest = useRef({ model, countiesByFips, utilitiesById, data, selectedUtilityId });
  useEffect(() => {
    latest.current = { model, countiesByFips, utilitiesById, data, selectedUtilityId };
  });

  const fitUtility = useCallback(
    (utilityId: string | null) => {
      if (!map || !loaded) return;
      if (!utilityId) {
        map.fitBounds(TEXAS_BOUNDS, { padding: mapPadding(), duration: 800 });
        return;
      }
      const utility = loaded.data.utilities.find((u) => u.id === utilityId);
      const features = loaded.counties.features.filter((f) =>
        utility?.counties.includes(String(f.properties?.fips)),
      );
      if (features.length) {
        map.fitBounds(boundsOf(features), { padding: mapPadding(), duration: 800, maxZoom: 8.5 });
      }
    },
    [map, loaded],
  );

  const selectUtility = useCallback(
    (id: string | null) => {
      setSelectedUtilityId(id);
      setSelectedFips(null);
      setPickerFips(null);
      fitUtility(id);
    },
    [fitUtility],
  );

  // Add sources and layers once both the map and the data are ready.
  useEffect(() => {
    if (!map || !loaded) return;
    addUtilityMapLayers(
      map,
      loaded.counties,
      loaded.territories,
      loaded.data.live.alerts.map((a) => a.fips),
    );
    map.fitBounds(TEXAS_BOUNDS, { padding: mapPadding(), duration: 0 });

    let hoveredCounty: number | null = null;
    let hoveredUtility: string | null = null;
    const clearHover = () => {
      if (hoveredCounty != null) setHover(map, SOURCE_COUNTIES, hoveredCounty, false);
      if (hoveredUtility != null) setHover(map, SOURCE_TERRITORIES, hoveredUtility, false);
      hoveredCounty = null;
      hoveredUtility = null;
    };

    const onMove = (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: [LAYER_COUNTY_FILL] })[0];
      const fips = feature?.properties?.fips as string | undefined;
      const {
        model: m,
        countiesByFips: counties,
        utilitiesById: utilities,
        selectedUtilityId: sel,
      } = latest.current;
      const county = fips ? counties.get(fips) : undefined;
      if (!county || !m) {
        clearHover();
        map.getCanvas().style.cursor = "";
        setTooltip(null);
        return;
      }
      const paint = countyPaintState(county, utilities, sel, m);
      const utilityId = paint.inSelection && sel ? sel : county.primary_utility ?? county.utilities[0];
      clearHover();
      hoveredCounty = Number(fips);
      hoveredUtility = utilityId;
      setHover(map, SOURCE_COUNTIES, hoveredCounty, true);
      setHover(map, SOURCE_TERRITORIES, utilityId, true);
      map.getCanvas().style.cursor = "pointer";

      const others = county.utilities.length - 1;
      const utilityName = utilities.get(utilityId)?.name ?? "Unknown utility";
      setTooltip({
        x: event.point.x,
        y: event.point.y,
        title: paint.inSelection
          ? `${county.name} County`
          : `${utilityName}${others > 0 ? ` + ${others} more` : ""}`,
        detail: `${paint.level ? `Level ${paint.level} · ${LEVEL_LABELS[paint.level]}` : "No data"}${
          paint.inSelection ? "" : ` · ${county.name} County`
        }`,
      });
    };

    const onLeave = () => {
      clearHover();
      map.getCanvas().style.cursor = "";
      setTooltip(null);
    };

    const onClick = (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: [LAYER_COUNTY_FILL] })[0];
      const fips = feature?.properties?.fips as string | undefined;
      const { countiesByFips: counties, utilitiesById: utilities, selectedUtilityId: sel } =
        latest.current;
      const county = fips ? counties.get(fips) : undefined;
      if (!county) return;
      const target = clickTarget(county, sel, utilities);
      if (target.kind === "county") {
        setSelectedFips(target.fips);
        setPickerFips(null);
      } else if (target.kind === "picker") {
        setPickerFips(target.fips);
      } else {
        setSelectedUtilityId(target.id);
        setSelectedFips(null);
        setPickerFips(null);
        const utility = utilities.get(target.id);
        const features = loaded.counties.features.filter((f) =>
          utility?.counties.includes(String(f.properties?.fips)),
        );
        map.fitBounds(boundsOf(features), { padding: mapPadding(), duration: 800, maxZoom: 8.5 });
      }
    };

    map.on("mousemove", LAYER_COUNTY_FILL, onMove);
    map.on("mouseleave", LAYER_COUNTY_FILL, onLeave);
    map.on("click", LAYER_COUNTY_FILL, onClick);
    return () => {
      map.off("mousemove", LAYER_COUNTY_FILL, onMove);
      map.off("mouseleave", LAYER_COUNTY_FILL, onLeave);
      map.off("click", LAYER_COUNTY_FILL, onClick);
    };
  }, [map, loaded]);

  // Repaint whenever scores or the selection change.
  useEffect(() => {
    if (!map || !loaded || !model || !map.getSource(SOURCE_COUNTIES)) return;
    for (const county of loaded.data.counties) {
      paintCounty(map, county.fips, {
        ...countyPaintState(county, utilitiesById, selectedUtilityId, model),
        picked: county.fips === selectedFips || county.fips === pickerFips,
      });
    }
    for (const utility of loaded.data.utilities) {
      paintTerritory(map, utility.id, utility.id === selectedUtilityId);
    }
  }, [map, loaded, model, utilitiesById, selectedUtilityId, selectedFips, pickerFips]);

  useEffect(() => {
    if (map) setWarningsVisible(map, showWarnings);
  }, [map, showWarnings, loaded]);

  const onPreset = (preset: Preset) => {
    setActiveLayers(preset.layers);
    setActivePresetId(preset.id);
  };

  const onToggleLayer = (id: LayerId, on: boolean) => {
    if (!data) return;
    const next = toggleLayer(activeLayers, id, on, data.layers);
    setActiveLayers(next);
    setActivePresetId(matchPreset(next, data.presets));
  };

  const onMode = (next: ModeId) => {
    setMode(next);
    const url = new URL(window.location.href);
    if (next === "risk") url.searchParams.delete("mode");
    else url.searchParams.set("mode", next);
    window.history.replaceState(null, "", url);
  };

  return (
    <main className="relative h-full w-full">
      <div className="absolute inset-0">
        <MapViewClient
          className="h-full w-full rounded-none border-0"
          center={MAP_CENTER}
          zoom={5}
          pitch={0}
          bearing={0}
          basemap={FLAT_BASEMAP}
          onMapReady={setMap}
        />
      </div>

      {tooltip ? (
        <div
          className="pointer-events-none absolute z-20 rounded-lg border bg-white px-3 py-2 text-[14px] leading-[21px] shadow-[var(--bp-shadow-media)]"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          <p className="font-semibold">{tooltip.title}</p>
          <p className="text-[12px] leading-[18px] text-muted-foreground">{tooltip.detail}</p>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-3 p-3 pt-[calc(4.5rem+env(safe-area-inset-top))] lg:flex-row lg:items-start lg:justify-between lg:p-4 lg:pt-[calc(5rem+env(safe-area-inset-top))]">
        <div className="pointer-events-auto w-full space-y-3 lg:max-h-full lg:w-80 lg:overflow-y-auto">
          <p className="bp-stamp inline-flex rounded-full border border-[var(--bp-grey-100)] bg-white px-3 py-1.5">
            {data ? dataModeLabel(data.data_mode) : "Loading data"}
            {data?.release_id ? ` · ${data.as_of}` : ""}
          </p>
          {data ? (
            <ControlsPanel
              mode={mode}
              onMode={onMode}
              sources={data.sources}
              layers={data.layers}
              presets={data.presets}
              activeLayers={activeLayers}
              activePresetId={activePresetId}
              showWarnings={showWarnings}
              onPreset={onPreset}
              onToggleLayer={onToggleLayer}
              onToggleWarnings={setShowWarnings}
            />
          ) : (
            <Skeleton className="h-96 w-full rounded-[20px] bg-white/80" />
          )}
        </div>

        <div className="pointer-events-auto mt-auto flex max-h-[45dvh] w-full min-h-0 lg:mt-0 lg:max-h-full lg:w-[400px]">
          {loadError ? (
            <p className="bp-panel w-full p-5 text-[14px] leading-[21px] text-destructive">
              {loadError}
            </p>
          ) : data && model ? (
            <DetailPanel
              key={selectedUtilityId ?? "all"}
              className="w-full"
              data={data}
              model={model}
              activeLayers={activeLayers}
              countiesByFips={countiesByFips}
              utilitiesById={utilitiesById}
              pickerFips={pickerFips}
              onClosePicker={() => setPickerFips(null)}
              selectedUtility={selectedUtility}
              selectedCounty={selectedCounty}
              onSelectUtility={selectUtility}
              onSelectCounty={setSelectedFips}
            />
          ) : (
            <Skeleton className="h-96 w-full rounded-[20px] bg-white/80" />
          )}
        </div>
      </div>
    </main>
  );
}
