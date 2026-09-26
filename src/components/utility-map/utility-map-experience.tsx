"use client";

import type { Map, MapMouseEvent } from "mapbox-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapViewClient } from "@/components/map/map-view-client";
import { Skeleton } from "@/components/ui/skeleton";
import { ControlsPanel } from "@/components/utility-map/controls-panel";
import { DetailPanel } from "@/components/utility-map/detail-panel";
import { MethodsSheet } from "@/components/utility-map/methods-sheet";
import {
  LAYER_COUNTY_FILL,
  SOURCE_COUNTIES,
  SOURCE_TERRITORIES,
  addUtilityMapLayers,
  paintCounty,
  paintTerritory,
  setFillRamp,
  GRID_RAMP,
  setFloodZones,
  setGenerators,
  setHazardTracks,
  setView3d,
  setWarningCounties,
  setHover,
  setWarningsVisible,
} from "@/components/utility-map/map-layers";
import type { FleetShare } from "@/components/utility-map/fleet-card";
import { BivariateLegend, SequentialLegend, SizeLegend } from "@/components/utility-map/legend";
import { FLEET_COLORS, fleetLevel, fleetScenario } from "@/lib/utility-map/fleet";
import {
  BIVARIATE_COLORS,
  HAZARDS,
  bivariateClass,
  hazardLevel,
  isHazard,
  outageShareLevel,
  type SpotlightStorm,
  overlapCount,
  type HazardId,
} from "@/lib/utility-map/hazard-style";
import { matchPreset, parseMode, toggleLayer, type ModeId } from "@/lib/utility-map/controls";
import { dataModeLabel } from "@/lib/utility-map/format";
import { loadUtilityMap, type LoadedMap } from "@/lib/utility-map/load";
import { LEVEL_COLORS, LEVEL_LABELS, buildScoreModel } from "@/lib/utility-map/scoring";
import { clickTarget, countyPaintState, floodCountiesInView, tooltipPosition } from "@/lib/utility-map/selection";
import type { LayerId, Preset, UtilityMapData } from "@/lib/utility-map/types";

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

type Tooltip = { left: number; top: number; title: string; detail: string };
const TOOLTIP_BOX = { width: 260, height: 64 };

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
  const [fleetShare, setFleetShare] = useState<FleetShare>(0.01);
  const [floodCache, setFloodCache] = useState<Record<string, GeoJSON.FeatureCollection>>({});
  const [hazardPicks, setHazardPicks] = useState<HazardId[]>([]);
  const [trackCache, setTrackCache] = useState<
    Partial<Record<"tornado" | "hurricane" | "severe_storm", GeoJSON.FeatureCollection>>
  >({});
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

  // Base fleet mode colors each utility by the share of its summer peak the fleet could cover.
  const fleetModel = useMemo(() => {
    if (!data || !model || mode !== "fleet") return model;
    const utility = new globalThis.Map(
      data.utilities.map((u) => {
        const level = fleetLevel(fleetScenario(u, countiesByFips, fleetShare, data.battery).peakShare);
        return [u.id, { score: null, level, rank: null }];
      }),
    );
    const county = new globalThis.Map(
      data.counties.map((c) => [c.fips, utility.get(c.primary_utility ?? c.utilities[0]) ?? { score: null, level: null, rank: null }]),
    );
    return { ...model, utility, county };
  }, [data, model, mode, countiesByFips, fleetShare]);

  // Hazards mode: each county colored by the picked hazards (1: that hazard's fifths,
  // 2: a 3×3 bivariate class, 3+: how many are in Texas's top fifth).
  const availableHazards = useMemo(
    () => (data?.layers ?? []).filter((l) => l.available && isHazard(l.id)).map((l) => l.id as HazardId),
    [data],
  );
  const [generators, setGeneratorsData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [live, setLive] = useState<UtilityMapData["live"] | null>(null);
  const [view3d, setView3dOn] = useState(false);
  const [storms, setStorms] = useState<SpotlightStorm[]>([]);
  const [spotlightName, setSpotlightName] = useState<string | null>(null);
  const spotlight = mode === "hazards" ? storms.find((s) => s.name === spotlightName) ?? null : null;

  // Labeled storms for the spotlight, fetched the first time the Hazards mode opens.
  useEffect(() => {
    const file = loaded?.data.geometry.hazards?.storms;
    if (!loaded || mode !== "hazards" || storms.length || !file) return;
    let cancelled = false;
    fetch(`${loaded.base}/${file}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { storms: SpotlightStorm[] } | null) => {
        if (!cancelled && body) setStorms(body.storms);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, mode, storms.length]);

  // Live NWS warnings every 60 s while the tab is visible (not in the dummy mockup).
  useEffect(() => {
    if (!loaded || loaded.data.data_mode === "mock") return;
    let cancelled = false;
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/utility-map/live")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((body: { status: "ok" | "unavailable"; fetched_at: string; alerts: { fips: string; event: string }[] }) => {
          if (!cancelled) setLive({ status: body.status, as_of: body.fetched_at, ercot: null, alerts: body.alerts });
        })
        .catch(() => {
          if (!cancelled) setLive({ status: "unavailable", as_of: null, ercot: null, alerts: [] });
        });
    };
    poll();
    const timer = window.setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loaded]);
  const viewData = useMemo(() => (data && live ? { ...data, live } : data), [data, live]);
  useEffect(() => {
    if (map && viewData) setWarningCounties(map, viewData.live.alerts.map((a) => a.fips));
  }, [map, viewData, loaded]);
  const hazardPaint = useMemo(() => {
    if (data && mode === "grid") {
      // Grid mode: estimated summer peak demand, in Texas fifths.
      const levels = new globalThis.Map<string, number | null>(
        data.counties.map((c) => [c.fips, hazardLevel(c.ranks.peak_demand)]),
      );
      return { levels, colors: GRID_RAMP as readonly string[] };
    }
    if (data && spotlight) {
      const byFips = new globalThis.Map(spotlight.counties.map((c) => [c.fips, c.peak_out_pct]));
      const levels = new globalThis.Map<string, number | null>(
        data.counties.map((c) => [c.fips, byFips.has(c.fips) ? outageShareLevel(byFips.get(c.fips)!) : null]),
      );
      return {
        levels,
        colors: [LEVEL_COLORS[1], LEVEL_COLORS[2], LEVEL_COLORS[3], LEVEL_COLORS[4], LEVEL_COLORS[5]] as readonly string[],
      };
    }
    if (!data || mode !== "hazards" || hazardPicks.length === 0) return null;
    const levels = new globalThis.Map<string, number | null>();
    for (const c of data.counties) {
      const ranks = hazardPicks.map((h) => c.ranks[h]);
      levels.set(
        c.fips,
        hazardPicks.length === 1
          ? hazardLevel(ranks[0])
          : hazardPicks.length === 2
            ? bivariateClass(ranks[0], ranks[1])
            : Math.min(overlapCount(c, hazardPicks), 4) + 1,
      );
    }
    const colors =
      hazardPicks.length === 1
        ? HAZARDS[hazardPicks[0]].ramp
        : hazardPicks.length === 2
          ? BIVARIATE_COLORS
          : [LEVEL_COLORS[1], LEVEL_COLORS[2], LEVEL_COLORS[3], LEVEL_COLORS[4], LEVEL_COLORS[5]];
    return { levels, colors: colors as readonly string[] };
  }, [data, mode, hazardPicks, spotlight]);
  const selectedCounty = selectedFips ? countiesByFips.get(selectedFips) ?? null : null;

  // Handlers read the latest state through a ref; Mapbox keeps the first closure.
  const latest = useRef({ model: fleetModel, countiesByFips, utilitiesById, data, selectedUtilityId });
  useEffect(() => {
    latest.current = { model: fleetModel, countiesByFips, utilitiesById, data, selectedUtilityId };
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
      const canvas = map.getCanvas();
      setTooltip({
        ...tooltipPosition(event.point.x, event.point.y, TOOLTIP_BOX, {
          width: canvas.clientWidth,
          height: canvas.clientHeight,
        }),
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
    if (!map || !loaded || !fleetModel || !map.getSource(SOURCE_COUNTIES)) return;
    if (hazardPaint) {
      setFillRamp(map, hazardPaint.colors);
      const selected = selectedUtilityId ? utilitiesById.get(selectedUtilityId) : undefined;
      for (const county of loaded.data.counties) {
        const inSelection = selected?.counties.includes(county.fips) ?? false;
        paintCounty(map, county.fips, {
          level: (hazardPaint.levels.get(county.fips) ?? null) as never,
          dim: selected != null && !inSelection,
          inSelection,
          picked: county.fips === selectedFips || county.fips === pickerFips,
        });
      }
      for (const utility of loaded.data.utilities) {
        paintTerritory(map, utility.id, utility.id === selectedUtilityId);
      }
      return;
    }
    setFillRamp(map, mode === "fleet" ? FLEET_COLORS : undefined);
    for (const county of loaded.data.counties) {
      const paintModel =
        mode === "fleet" && selectedUtilityId
          ? { ...fleetModel, county: new globalThis.Map([[county.fips, fleetModel.utility.get(selectedUtilityId)!]]) }
          : fleetModel;
      paintCounty(map, county.fips, {
        ...countyPaintState(county, utilitiesById, selectedUtilityId, paintModel),
        picked: county.fips === selectedFips || county.fips === pickerFips,
      });
    }
    for (const utility of loaded.data.utilities) {
      paintTerritory(map, utility.id, utility.id === selectedUtilityId);
    }
  }, [map, loaded, fleetModel, hazardPaint, mode, utilitiesById, selectedUtilityId, selectedFips, pickerFips]);

  // Tornado and hurricane tracks: fetched the first time they're picked.
  useEffect(() => {
    if (!loaded) return;
    const files = loaded.data.geometry.hazards ?? {};
    const wanted = (["tornado", "hurricane", "severe_storm"] as const).filter(
      (h) => mode === "hazards" && hazardPicks.includes(h) && files[h] && !trackCache[h],
    );
    if (wanted.length === 0) return;
    let cancelled = false;
    Promise.all(wanted.map((h) => fetch(`${loaded.base}/${files[h]}`).then((r) => (r.ok ? r.json() : null)))).then(
      (results) => {
        if (cancelled) return;
        setTrackCache((prev) => {
          const next = { ...prev };
          wanted.forEach((h, i) => {
            if (results[i]) next[h] = results[i];
          });
          return next;
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loaded, mode, hazardPicks, trackCache]);
  // 3D view only in Risk mode; honor reduced motion.
  useEffect(() => {
    if (!map || !loaded) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setView3d(map, view3d && mode === "risk", !reduced);
  }, [map, loaded, view3d, mode]);

  // Power plants for the Grid mode, fetched the first time the mode opens.
  useEffect(() => {
    const file = loaded?.data.geometry.grid?.generators;
    if (!loaded || mode !== "grid" || generators || !file) return;
    let cancelled = false;
    fetch(`${loaded.base}/${file}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((geo) => {
        if (!cancelled && geo) setGeneratorsData(geo);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, mode, generators]);
  useEffect(() => {
    if (map && loaded) setGenerators(map, mode === "grid" ? generators : null);
  }, [map, loaded, mode, generators]);

  useEffect(() => {
    if (!map || !loaded) return;
    const show = (h: "tornado" | "hurricane" | "severe_storm") => {
      if (mode !== "hazards") return null;
      if (spotlight) {
        // Only the spotlighted storm's own track, when it has one.
        const track = h === "hurricane" && spotlight.track_storm_id ? trackCache.hurricane : null;
        return track
          ? { ...track, features: track.features.filter((f) => f.properties?.storm_id === spotlight.track_storm_id) }
          : null;
      }
      return hazardPicks.includes(h) ? trackCache[h] ?? null : null;
    };
    setHazardTracks(
      map,
      { tornado: show("tornado"), hurricane: show("hurricane"), severe_storm: show("severe_storm") },
      { tornado: HAZARDS.tornado.ramp[4], hurricaneRamp: HAZARDS.hurricane.ramp, severe: HAZARDS.severe_storm.ramp[4] },
    );
  }, [map, loaded, mode, hazardPicks, trackCache, spotlight]);

  // Fit the map to a spotlighted storm's counties; also make sure its track file is loaded.
  const onSpotlight = (name: string | null) => {
    setSpotlightName(name);
    const storm = storms.find((s) => s.name === name);
    if (!storm || !map || !loaded) return;
    if (storm.track_storm_id && !hazardPicks.includes("hurricane")) setHazardPicks((p) => [...p, "hurricane"]);
    const fips = new Set(storm.counties.map((c) => c.fips));
    const features = loaded.counties.features.filter((f) => fips.has(String(f.properties?.fips)));
    if (features.length) map.fitBounds(boundsOf(features), { padding: mapPadding(), duration: 800, maxZoom: 8 });
  };

  // FEMA flood zones for demo counties in view; fetched once each, drawn only with the flood layer on.
  const floodInView = useMemo(
    () =>
      floodCountiesInView(
        data?.geometry.flood,
        selectedUtility,
        selectedFips,
        mode === "hazards" ? hazardPicks : activeLayers,
      ),
    [data, selectedUtility, selectedFips, activeLayers, mode, hazardPicks],
  );
  useEffect(() => {
    if (!loaded) return;
    const missing = floodInView.filter((fips) => !floodCache[fips]);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map((fips) =>
        fetch(`${loaded.base}/${loaded.data.geometry.flood?.[fips]}`).then((r) =>
          r.ok ? (r.json() as Promise<GeoJSON.FeatureCollection>) : null,
        ),
      ),
    ).then((files) => {
      if (cancelled) return;
      setFloodCache((prev) => {
        const next = { ...prev };
        missing.forEach((fips, i) => {
          if (files[i]) next[fips] = files[i];
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [loaded, floodInView, floodCache]);
  useEffect(() => {
    if (!map || !loaded) return;
    setFloodZones(map, floodInView.map((fips) => floodCache[fips]).filter(Boolean));
  }, [map, loaded, floodInView, floodCache]);

  useEffect(() => {
    if (map) setWarningsVisible(map, showWarnings);
  }, [map, showWarnings, loaded]);

  const onPreset = (preset: Preset) => {
    setActiveLayers(preset.layers);
    setActivePresetId(preset.id);
  };

  const onToggleHazard = (hazard: HazardId) =>
    setHazardPicks((prev) => (prev.includes(hazard) ? prev.filter((h) => h !== hazard) : [...prev, hazard]));

  const hazardLegend = spotlight ? (
    <SequentialLegend
      title={`${spotlight.name}: peak share of customers out`}
      colors={[LEVEL_COLORS[1], LEVEL_COLORS[2], LEVEL_COLORS[3], LEVEL_COLORS[4], LEVEL_COLORS[5]]}
      labels={["< 5%", "5–15%", "15–30%", "30–50%", "50%+"]}
      note="Grey: no outage event labeled with this storm."
    />
  ) : mode === "grid" ? (
      <>
        <SequentialLegend
          title="Estimated summer peak demand, Texas fifths"
          colors={GRID_RAMP}
          labels={["Lowest", "", "Middle", "", "Top fifth"]}
          note="Each utility's 2024 peak split across its counties by customers."
        />
        <SizeLegend
          title="Power plants (net summer MW, EIA-860 2024)"
          stops={[
            { label: "100", radius: 4 },
            { label: "1,000", radius: 8 },
            { label: "5,000", radius: 14 },
          ]}
        />
      </>
    ) : mode !== "hazards" || hazardPicks.length === 0 ? null : hazardPicks.length === 1 ? (
      <SequentialLegend
        title={`${HAZARDS[hazardPicks[0]].label}: Texas rank, in fifths`}
        colors={HAZARDS[hazardPicks[0]].ramp}
        labels={["Lowest", "", "Middle", "", "Top fifth"]}
        note={data?.layers.find((l) => l.id === hazardPicks[0])?.unit ?? undefined}
      />
    ) : hazardPicks.length === 2 ? (
      <BivariateLegend
        colors={BIVARIATE_COLORS}
        first={HAZARDS[hazardPicks[0]].label}
        second={HAZARDS[hazardPicks[1]].label}
      />
    ) : (
      <SequentialLegend
        title={`Hazards where the county is in Texas's top fifth (of ${hazardPicks.length})`}
        colors={[LEVEL_COLORS[1], LEVEL_COLORS[2], LEVEL_COLORS[3], LEVEL_COLORS[4], LEVEL_COLORS[5]]}
        labels={["0", "1", "2", "3", "4+"]}
      />
    );

  const onToggleLayer = (id: LayerId, on: boolean) => {
    if (!data) return;
    const next = toggleLayer(activeLayers, id, on, data.layers);
    setActiveLayers(next);
    setActivePresetId(matchPreset(next, data.presets));
  };

  const onMode = (next: ModeId) => {
    setMode(next);
    if (next === "hazards" && hazardPicks.length === 0) {
      const fromLens = activeLayers.filter((l) => availableHazards.includes(l as HazardId)) as HazardId[];
      setHazardPicks(fromLens.length ? fromLens.slice(0, 1) : availableHazards.slice(0, 1));
    }
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
          style={{ left: tooltip.left, top: tooltip.top, maxWidth: TOOLTIP_BOX.width }}
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
          {data && model ? (
            <div className="inline-flex rounded-full bg-white px-3 py-1.5 shadow-[var(--bp-shadow-media)]">
              <MethodsSheet data={data} model={model} activeLayers={activeLayers} countiesByFips={countiesByFips} />
            </div>
          ) : null}
          {data ? (
            <ControlsPanel
              mode={mode}
              onMode={onMode}
              fleetShare={fleetShare}
              floodCounties={floodInView.filter((fips) => floodCache[fips])}
              availableHazards={availableHazards}
              hazardPicks={hazardPicks}
              onToggleHazard={onToggleHazard}
              hazardLegend={hazardLegend}
              storms={storms}
              spotlight={spotlight}
              onSpotlight={onSpotlight}
              countyName={(fips) => countiesByFips.get(fips)?.name ?? fips}
              view3d={view3d}
              onView3d={setView3dOn}
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
              data={viewData ?? data}
              model={model}
              activeLayers={activeLayers}
              countiesByFips={countiesByFips}
              utilitiesById={utilitiesById}
              pickerFips={pickerFips}
              fleetShare={fleetShare}
              onFleetShare={setFleetShare}
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
