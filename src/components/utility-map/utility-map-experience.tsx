"use client";

import type { Map, MapMouseEvent } from "mapbox-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapViewClient } from "@/components/map/map-view-client";
import { Skeleton } from "@/components/ui/skeleton";
import { ControlsPanel } from "@/components/utility-map/controls-panel";
import { DetailPanel } from "@/components/utility-map/detail-panel";
import { MapKey } from "@/components/utility-map/map-key";
import { MethodsSheet } from "@/components/utility-map/methods-sheet";
import { RiskTableSheet } from "@/components/utility-map/risk-table-sheet";
import { ViewTableSheet } from "@/components/utility-map/view-table-sheet";
import { MapChat, type ChatEntry } from "@/components/utility-map/map-chat";
import { chatSuggestions } from "@/lib/utility-map/chat-facts";
import {
  LAYER_COUNTY_3D,
  LAYER_COUNTY_FILL,
  SOURCE_COUNTIES,
  SOURCE_TERRITORIES,
  addUtilityMapLayers,
  paintCounty,
  paintTerritory,
  setFillRamp,
  setFloodZones,
  setGenerators,
  setHazardTracks,
  setView3d,
  setWarningCounties,
  setHover,
  setWarningsVisible,
} from "@/components/utility-map/map-layers";
import { describeView, overlays, scoreLayers } from "@/lib/utility-map/describe-view";
import { HAZARDS, isHazard, type HazardId, type SpotlightStorm } from "@/lib/utility-map/hazard-style";
import { mergeFetched, toFetch } from "@/lib/utility-map/fetch-cache";
import { dataModeLabel } from "@/lib/utility-map/format";
import { loadUtilityMap, type LoadedMap } from "@/lib/utility-map/load";
import { buildScoreModel } from "@/lib/utility-map/scoring";
import { clickTarget, floodCountiesInView, tooltipPosition } from "@/lib/utility-map/selection";
import type { UtilityMapData } from "@/lib/utility-map/types";
import {
  defaultViewState,
  selectCounty,
  selectUtility as selectUtilityIn,
  setGridLayer,
  setQuestion,
  setShare,
  showPatterns,
  showStorm,
  toggleHazard,
  viewFromUrl,
  viewToUrl,
  type ViewContext,
  type ViewState,
} from "@/lib/utility-map/view";
import { GLOBE_START, introDuration } from "@/lib/utility-map/camera";

/** Query keys owned by the view; anything else in the URL (e.g. ?data=mock) is left alone. */
const VIEW_KEYS = ["q", "mode", "scenario", "factors", "hazards", "sub", "storm", "demand", "plants", "share", "utility", "county"];

const TEXAS_BOUNDS: [[number, number], [number, number]] = [
  [-106.65, 25.84],
  [-93.51, 36.5],
];
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
  // The one analytical state: question, its settings, and the place in focus (see lib/utility-map/view.ts).
  const [view, setView] = useState<ViewState>(() => defaultViewState());
  const [showWarnings, setShowWarnings] = useState(false);
  const [riskTableOpen, setRiskTableOpen] = useState(false);
  const [viewTableOpen, setViewTableOpen] = useState(false);
  // The chat's conversation lives here so it survives picking another place.
  const [chatEntries, setChatEntries] = useState<ChatEntry[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [view3d, setView3dOn] = useState(false);
  const [pickerFips, setPickerFips] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [floodCache, setFloodCache] = useState<Record<string, GeoJSON.FeatureCollection>>({});
  const [trackCache, setTrackCache] = useState<
    Partial<Record<"tornado" | "hurricane" | "severe_storm", GeoJSON.FeatureCollection>>
  >({});
  const [generators, setGeneratorsData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [live, setLive] = useState<UtilityMapData["live"] | null>(null);
  const [storms, setStorms] = useState<SpotlightStorm[]>([]);
  const [stormsStatus, setStormsStatus] = useState<"loading" | "ok" | "failed">("loading");

  const data = loaded?.data ?? null;
  const ctx = useMemo<ViewContext | null>(
    () =>
      data
        ? {
            layers: data.layers,
            utilityIds: new Set(data.utilities.map((u) => u.id)),
            countyFips: new Set(data.counties.map((c) => c.fips)),
            utilityCounties: new globalThis.Map(data.utilities.map((u) => [u.id, u.counties])),
          }
        : null,
    [data],
  );

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
        const { data: d } = result;
        setView(
          viewFromUrl(search, {
            layers: d.layers,
            utilityIds: new Set(d.utilities.map((u) => u.id)),
            countyFips: new Set(d.counties.map((c) => c.fips)),
            utilityCounties: new globalThis.Map(d.utilities.map((u) => [u.id, u.counties])),
          }),
        );
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(err instanceof Error ? err.message : "Couldn't load map data.");
        }
      });
    return () => controller.abort();
  }, []);

  // Keep the URL in step with the view, so a reload or a shared link opens the same analysis.
  useEffect(() => {
    if (!data) return;
    const url = new URL(window.location.href);
    for (const key of VIEW_KEYS) url.searchParams.delete(key);
    for (const [key, value] of viewToUrl(view)) url.searchParams.set(key, value);
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [data, view]);

  const model = useMemo(() => (data ? buildScoreModel(data, scoreLayers(view)) : null), [data, view]);
  const countiesByFips = useMemo(
    () => new globalThis.Map((data?.counties ?? []).map((c) => [c.fips, c])),
    [data],
  );
  const utilitiesById = useMemo(
    () => new globalThis.Map((data?.utilities ?? []).map((u) => [u.id, u])),
    [data],
  );
  const selectedUtility = view.utility ? utilitiesById.get(view.utility) ?? null : null;
  const selectedCounty = view.county ? countiesByFips.get(view.county) ?? null : null;
  const availableHazards = useMemo(
    () => (data?.layers ?? []).filter((l) => l.available && isHazard(l.id)).map((l) => l.id as HazardId),
    [data],
  );
  const shown = overlays(view);
  const storm = shown.stormTrack ? storms.find((s) => s.name === view.storm) ?? null : null;

  const described = useMemo(
    () =>
      data && model
        ? describeView(view, { data, model, countiesByFips, utilitiesById, storms, stormsStatus })
        : null,
    [data, model, view, countiesByFips, utilitiesById, storms, stormsStatus],
  );

  // Labeled storms, fetched the first time Explore hazards opens.
  useEffect(() => {
    const file = loaded?.data.geometry.hazards?.storms;
    if (!loaded || (view.question !== "hazards" && !view.utility) || stormsStatus !== "loading") return;
    let cancelled = false;
    if (!file) {
      Promise.resolve().then(() => !cancelled && setStormsStatus("failed"));
      return () => {
        cancelled = true;
      };
    }
    fetch(`${loaded.base}/${file}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((body: { storms: SpotlightStorm[] } | null) => {
        if (cancelled) return;
        if (body?.storms) {
          setStorms(body.storms);
          setStormsStatus("ok");
        } else {
          setStormsStatus("failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, view.question, view.utility, stormsStatus]);

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
  const warningsStatus = !live
    ? "Checking current warnings"
    : live.status !== "ok"
      ? "Warnings feed unavailable right now"
      : `${new Set(live.alerts.map((a) => a.fips)).size} counties under warnings${
          live.as_of
            ? ` · checked ${new Date(live.as_of).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" })} CT`
            : ""
        }`;

  // Handlers read the latest state through a ref; Mapbox keeps the first closure.
  const latest = useRef({ described, countiesByFips, utilitiesById, view });
  useEffect(() => {
    latest.current = { described, countiesByFips, utilitiesById, view };
  });
  // Files that failed to load are not requested again (a release can be pruned under an open tab).
  const trackFailed = useRef(new Set<string>());
  const floodFailed = useRef(new Set<string>());

  const fitFips = useCallback(
    (fips: Set<string>, maxZoom: number) => {
      if (!map || !loaded) return;
      const features = loaded.counties.features.filter((f) => fips.has(String(f.properties?.fips)));
      if (features.length) map.fitBounds(boundsOf(features), { padding: mapPadding(), duration: 800, maxZoom });
    },
    [map, loaded],
  );
  const fitUtility = useCallback(
    (utilityId: string | null) => {
      if (!map || !loaded) return;
      const utility = utilityId ? loaded.data.utilities.find((u) => u.id === utilityId) : undefined;
      if (!utility) {
        map.fitBounds(TEXAS_BOUNDS, { padding: mapPadding(), duration: 800 });
        return;
      }
      fitFips(new Set(utility.counties), 8.5);
    },
    [map, loaded, fitFips],
  );

  const selectUtility = useCallback(
    (id: string | null) => {
      setView((v) => selectUtilityIn(v, id));
      setPickerFips(null);
      fitUtility(id);
    },
    [fitUtility],
  );
  const selectFips = useCallback((fips: string | null) => {
    setView((v) => selectCounty(v, fips));
    setPickerFips(null);
  }, []);
  // A county from a list (e.g. a storm's counties): open it inside its main utility.
  const openCounty = useCallback(
    (fips: string) => {
      const county = countiesByFips.get(fips);
      const utility = county?.primary_utility ?? county?.utilities[0];
      if (!county || !utility) return;
      setView((v) => selectCounty(selectUtilityIn(v, utility), fips));
      setPickerFips(null);
      fitUtility(utility);
    },
    [countiesByFips, fitUtility],
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
    const opening = latest.current.view.utility
      ? loaded.data.utilities.find((u) => u.id === latest.current.view.utility)
      : undefined;
    const openingFeatures = opening
      ? loaded.counties.features.filter((f) => opening.counties.includes(String(f.properties?.fips)))
      : [];
    // Opening shot: fly from the globe into Texas (or the linked utility).
    const duration = introDuration(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const flight = { padding: mapPadding(), duration, essential: true, curve: 1.2 };
    if (openingFeatures.length) {
      map.fitBounds(boundsOf(openingFeatures), { ...flight, maxZoom: 8.5 });
    } else {
      map.fitBounds(TEXAS_BOUNDS, flight);
    }

    let hoveredCounty: number | null = null;
    let hoveredUtility: string | null = null;
    const clearHover = () => {
      if (hoveredCounty != null) setHover(map, SOURCE_COUNTIES, hoveredCounty, false);
      if (hoveredUtility != null) setHover(map, SOURCE_TERRITORIES, hoveredUtility, false);
      hoveredCounty = null;
      hoveredUtility = null;
    };

    const countyLayers = () => [LAYER_COUNTY_FILL, LAYER_COUNTY_3D].filter((id) => map.getLayer(id));
    const onMove = (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: countyLayers() })[0];
      const fips = feature?.properties?.fips as string | undefined;
      const { described: d, countiesByFips: counties, utilitiesById: utilities, view: v } = latest.current;
      const county = fips ? counties.get(fips) : undefined;
      if (!county || !d) {
        clearHover();
        map.getCanvas().style.cursor = "";
        setTooltip(null);
        return;
      }
      const state = d.stateFor(county);
      const utilityId = state.inSelection && v.utility ? v.utility : county.primary_utility ?? county.utilities[0];
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
        // Screening and fleet color a county by its utility; every other view by the county's own value.
        ...(state.inSelection || (d.context.kind !== "risk" && d.context.kind !== "fleet")
          ? {
              title: `${county.name} County`,
              detail: `${d.labelFor(county)}${state.inSelection ? "" : ` · ${utilityName}${others > 0 ? ` + ${others} more` : ""}`}`,
            }
          : {
              title: `${utilityName}${others > 0 ? ` + ${others} more` : ""}`,
              detail: `${d.labelFor(county)} · ${county.name} County`,
            }),
      });
    };

    const onLeave = () => {
      clearHover();
      map.getCanvas().style.cursor = "";
      setTooltip(null);
    };

    const onClick = (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: countyLayers() })[0];
      const fips = feature?.properties?.fips as string | undefined;
      const { countiesByFips: counties, utilitiesById: utilities, view: v } = latest.current;
      const county = fips ? counties.get(fips) : undefined;
      if (!county) return;
      const target = clickTarget(county, v.utility, utilities);
      if (target.kind === "county") {
        setView((prev) => selectCounty(prev, target.fips));
        setPickerFips(null);
      } else if (target.kind === "picker") {
        setPickerFips(target.fips);
      } else {
        setView((prev) => selectUtilityIn(prev, target.id));
        setPickerFips(null);
        const utility = utilities.get(target.id);
        const features = loaded.counties.features.filter((f) => utility?.counties.includes(String(f.properties?.fips)));
        map.fitBounds(boundsOf(features), { padding: mapPadding(), duration: 800, maxZoom: 8.5 });
      }
    };

    // Both the flat fill and the 3D extrusion answer hover and click (only one is visible).
    for (const layer of [LAYER_COUNTY_FILL, LAYER_COUNTY_3D]) {
      map.on("mousemove", layer, onMove);
      map.on("mouseleave", layer, onLeave);
      map.on("click", layer, onClick);
    }
    return () => {
      for (const layer of [LAYER_COUNTY_FILL, LAYER_COUNTY_3D]) {
        map.off("mousemove", layer, onMove);
        map.off("mouseleave", layer, onLeave);
        map.off("click", layer, onClick);
      }
    };
  }, [map, loaded]);

  // Repaint whenever the view or the selection changes; the map, tooltip and details share `described`.
  useEffect(() => {
    if (!map || !loaded || !described || !map.getSource(SOURCE_COUNTIES)) return;
    setFillRamp(map, described.colors);
    for (const county of loaded.data.counties) {
      paintCounty(map, county.fips, {
        ...(described.stateFor(county) as { level: never; dim: boolean; inSelection: boolean }),
        picked: county.fips === view.county || county.fips === pickerFips,
      });
    }
    for (const utility of loaded.data.utilities) {
      paintTerritory(map, utility.id, utility.id === view.utility);
    }
  }, [map, loaded, described, view.utility, view.county, pickerFips]);

  // Tornado, hail and hurricane tracks: fetched the first time they're needed.
  const trackKey = [...shown.tracks, storm?.track_storm_id ? "hurricane" : ""].join(",");
  useEffect(() => {
    if (!loaded) return;
    const files = loaded.data.geometry.hazards ?? {};
    const needed = trackKey.split(",").filter((h): h is "tornado" | "hurricane" | "severe_storm" =>
      (["tornado", "hurricane", "severe_storm"] as const).includes(h as never) && !!files[h as "tornado"],
    );
    const wanted = toFetch([...new Set(needed)], trackCache, trackFailed.current) as ("tornado" | "hurricane" | "severe_storm")[];
    if (wanted.length === 0) return;
    let cancelled = false;
    Promise.all(
      wanted.map((h) =>
        fetch(`${loaded.base}/${files[h]}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      wanted.forEach((h, i) => {
        if (results[i] == null) trackFailed.current.add(h);
      });
      setTrackCache((prev) => mergeFetched(prev, wanted, results).cache);
    });
    return () => {
      cancelled = true;
    };
  }, [loaded, trackKey, trackCache]);
  useEffect(() => {
    if (!map || !loaded) return;
    const show = (h: "tornado" | "hurricane" | "severe_storm") => {
      if (storm) {
        // Only the storm's own track, when it has one.
        const track = h === "hurricane" && storm.track_storm_id ? trackCache.hurricane : null;
        return track
          ? { ...track, features: track.features.filter((f) => f.properties?.storm_id === storm.track_storm_id) }
          : null;
      }
      return shown.tracks.includes(h) ? trackCache[h] ?? null : null;
    };
    setHazardTracks(
      map,
      { tornado: show("tornado"), hurricane: show("hurricane"), severe_storm: show("severe_storm") },
      { tornado: HAZARDS.tornado.ramp[4], hurricaneRamp: HAZARDS.hurricane.ramp, severe: HAZARDS.severe_storm.ramp[4] },
    );
    // `shown.tracks` is derived from `view`; trackKey captures it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, trackKey, trackCache, storm]);

  // 3D only in Find opportunities; honor reduced motion.
  useEffect(() => {
    if (!map || !loaded) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setView3d(map, view3d && shown.view3d, !reduced);
  }, [map, loaded, view3d, shown.view3d]);

  // Power plants, fetched the first time the grid view opens; drawn only with their switch on.
  useEffect(() => {
    const file = loaded?.data.geometry.grid?.generators;
    if (!loaded || view.question !== "grid" || generators || !file) return;
    let cancelled = false;
    fetch(`${loaded.base}/${file}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((geo) => {
        if (!cancelled && geo) setGeneratorsData(geo);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, view.question, generators]);
  useEffect(() => {
    if (map && loaded) setGenerators(map, shown.plants ? generators : null);
  }, [map, loaded, shown.plants, generators]);

  // FEMA flood zones for demo counties in view; fetched once each, drawn only when flood is in the view.
  const floodInView = useMemo(
    () => floodCountiesInView(data?.geometry.flood, selectedUtility, view.county, shown.flood ? ["flood"] : []),
    [data, selectedUtility, view.county, shown.flood],
  );
  useEffect(() => {
    if (!loaded) return;
    const missing = toFetch(floodInView, floodCache, floodFailed.current);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map((fips) =>
        fetch(`${loaded.base}/${loaded.data.geometry.flood?.[fips]}`)
          .then((r) => (r.ok ? (r.json() as Promise<GeoJSON.FeatureCollection>) : null))
          .catch(() => null),
      ),
    ).then((files) => {
      if (cancelled) return;
      missing.forEach((fips, i) => {
        if (files[i] == null) floodFailed.current.add(fips);
      });
      setFloodCache((prev) => mergeFetched(prev, missing, files).cache);
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

  const onStorm = (name: string) => {
    setView((v) => showStorm(v, name));
    const picked = storms.find((s) => s.name === name);
    if (picked && !view.utility) fitFips(new Set(picked.counties.map((c) => c.fips)), 8);
  };

  const floodShown = floodInView.some((fips) => floodCache[fips]);
  const keyProps = described
    ? { described, showFlood: floodShown, showPlants: shown.plants && generators != null }
    : null;

  return (
    <main className="relative h-full w-full">
      <div className="absolute inset-0">
        <MapViewClient
          className="h-full w-full rounded-none border-0"
          center={GLOBE_START.center}
          zoom={GLOBE_START.zoom}
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
        <div className="pointer-events-auto flex max-h-[34dvh] w-full shrink-0 flex-col gap-3 overflow-y-auto lg:max-h-full lg:w-80">
          <p className="order-3 rounded-xl bg-white px-3 py-2 text-[12px] leading-[18px] text-muted-foreground lg:hidden">
            The utility map is built for desktop screens. On a narrow screen, scroll this panel and the details below.
          </p>
          <p className="bp-stamp order-2 inline-flex self-start rounded-full border border-[var(--bp-grey-100)] bg-white px-3 py-1.5 lg:order-none">
            {data ? dataModeLabel(data.data_mode) : "Loading data"}
            {data?.release_id ? ` · ${data.as_of}` : ""}
          </p>
          {data && described ? (
            <div className="order-2 inline-flex self-start rounded-full bg-white px-3 py-1.5 shadow-[var(--bp-shadow-media)] lg:order-none">
              <MethodsSheet data={data} described={described} />
            </div>
          ) : null}
          {keyProps ? (
            <>
              <div className="order-1 lg:hidden">
                <MapKey {...keyProps} defaultOpen={false} />
              </div>
              <div className="hidden lg:order-last lg:block">
                <MapKey {...keyProps} />
              </div>
            </>
          ) : null}
          {data && ctx ? (
            <ControlsPanel
              className="order-first shrink-0 lg:order-none"
              view={view}
              data={data}
              availableHazards={availableHazards}
              storms={storms}
              stormsStatus={stormsStatus}
              countyName={(fips) => countiesByFips.get(fips)?.name ?? fips}
              view3d={view3d}
              showWarnings={showWarnings}
              warningsStatus={warningsStatus}
              onQuestion={(q) => setView((v) => setQuestion(v, q, ctx))}
              onHazard={(h) => setView((v) => toggleHazard(v, h))}
              onStorm={onStorm}
              onPatterns={() => setView(showPatterns)}
              onGrid={(layer, on) => setView((v) => setGridLayer(v, layer, on))}
              onShare={(share) => setView((v) => setShare(v, share))}
              onView3d={setView3dOn}
              onToggleWarnings={setShowWarnings}
            />
          ) : (
            <Skeleton className="h-96 w-full rounded-[20px] bg-white/80" />
          )}
        </div>

        <div className="pointer-events-auto mt-auto flex max-h-[34dvh] min-h-0 w-full lg:mt-0 lg:max-h-full lg:w-[400px]">
          {loadError ? (
            <p className="bp-panel w-full p-5 text-[14px] leading-[21px] text-destructive">{loadError}</p>
          ) : data && model && described ? (
            <DetailPanel
              key={view.utility ?? "all"}
              className="w-full"
              data={viewData ?? data}
              model={model}
              view={view}
              described={described}
              storm={storm}
              storms={storms}
              countiesByFips={countiesByFips}
              utilitiesById={utilitiesById}
              pickerFips={pickerFips}
              onShare={(share) => setView((v) => setShare(v, share))}
              onClosePicker={() => setPickerFips(null)}
              selectedUtility={selectedUtility}
              selectedCounty={selectedCounty}
              onSelectUtility={selectUtility}
              onSelectCounty={selectFips}
              onOpenCounty={openCounty}
              onOpenFullTable={() => (view.question === "risk" ? setRiskTableOpen(true) : setViewTableOpen(true))}
            />
          ) : (
            <Skeleton className="h-96 w-full rounded-[20px] bg-white/80" />
          )}
        </div>
      </div>
      {data ? (
        <RiskTableSheet
          open={riskTableOpen}
          onOpenChange={setRiskTableOpen}
          data={data}
          countiesByFips={countiesByFips}
          onPick={(row, kind) => {
            setRiskTableOpen(false);
            if (kind === "county") openCounty(row.id);
            else selectUtility(row.id);
          }}
        />
      ) : null}
      {data && described ? (
        <MapChat
          entries={chatEntries}
          onEntries={setChatEntries}
          open={chatOpen}
          onOpenChange={setChatOpen}
          viewQuery={viewToUrl(view).toString()}
          suggestions={chatSuggestions(data, view)}
          onPlace={(kind, id) => (kind === "county" ? openCounty(id) : selectUtility(id))}
        />
      ) : null}
      {described ? (
        <ViewTableSheet
          // A fresh sheet (tab, search, sort) for each view.
          key={`${view.question}-${view.hazardSub}-${view.hazards.length}`}
          open={viewTableOpen}
          onOpenChange={setViewTableOpen}
          described={described}
          onPick={(id, kind) => {
            setViewTableOpen(false);
            if (kind === "county") openCounty(id);
            else selectUtility(id);
          }}
        />
      ) : null}
    </main>
  );
}
