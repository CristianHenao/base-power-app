"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl, { type LngLatLike, type Map, type Marker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPinned } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MAP_DEFAULTS,
  type MapBasemapConfig,
} from "@/lib/map/config";
import { fetchMapboxTokenClient } from "@/lib/map/geocode-client";
import { createThreeLayer } from "@/lib/map/create-three-layer";
import { Skeleton } from "@/components/ui/skeleton";

export type MapMarker = {
  lngLat: [number, number];
  label?: string;
};

export type MapViewProps = {
  className?: string;
  center?: LngLatLike;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  style?: string;
  /** Mapbox Standard basemap toggles (3D buildings, trees, landmarks, etc.). */
  basemap?: MapBasemapConfig;
  marker?: MapMarker | null;
  /**
   * Optional Three.js overlay. Disabled by default — sharing Mapbox’s WebGL
   * context can blank the basemap if the layer isn’t carefully managed.
   */
  enableThreeLayer?: boolean;
  onMapReady?: (map: Map) => void;
};

function applyBasemapConfig(map: Map, basemap: MapBasemapConfig) {
  for (const [key, value] of Object.entries(basemap)) {
    if (value === undefined) continue;
    try {
      map.setConfigProperty("basemap", key, value);
    } catch (error) {
      console.warn(`Unable to set basemap config "${key}"`, error);
    }
  }
}

function createHomeMarkerElement(label?: string) {
  const el = document.createElement("div");
  el.className = "base-power-home-marker";
  el.title = label ?? "Your home";
  el.innerHTML = `
    <span class="base-power-home-marker__pulse"></span>
    <span class="base-power-home-marker__pin" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
        <path d="M9 21v-6h6v6" />
      </svg>
    </span>
  `;
  return el;
}

export function MapView({
  className,
  center = MAP_DEFAULTS.center,
  zoom = MAP_DEFAULTS.zoom,
  pitch = MAP_DEFAULTS.pitch,
  bearing = MAP_DEFAULTS.bearing,
  style = MAP_DEFAULTS.style,
  basemap = MAP_DEFAULTS.basemap,
  marker = null,
  enableThreeLayer = false,
  onMapReady,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenStatus, setTokenStatus] = useState<"loading" | "ready" | "missing">(
    "loading",
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetchMapboxTokenClient(controller.signal)
      .then((value) => {
        if (!value) {
          setTokenStatus("missing");
          return;
        }
        setToken(value);
        setTokenStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setTokenStatus("missing");
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (tokenStatus !== "ready" || !token || !containerRef.current || mapRef.current) {
      return;
    }

    mapboxgl.accessToken = token;

    let cancelled = false;
    const container = containerRef.current;

    const map = new mapboxgl.Map({
      container,
      style,
      config: {
        basemap: { ...basemap },
      },
      center,
      zoom,
      pitch,
      bearing,
      maxPitch: 85,
      antialias: MAP_DEFAULTS.antialias,
      attributionControl: true,
    });

    const onLoad = () => {
      if (cancelled) return;

      map.resize();
      applyBasemapConfig(map, basemap);

      if (enableThreeLayer && !map.getLayer("three-layer")) {
        try {
          map.addLayer(createThreeLayer({ id: "three-layer" }));
        } catch (error) {
          console.error("Failed to attach Three.js map layer", error);
        }
      }

      setStatus("ready");
      onMapReady?.(map);
    };

    const onError = (event: { error?: Error | { message?: string } }) => {
      if (cancelled) return;
      const message =
        event.error instanceof Error
          ? event.error.message
          : event.error?.message || "Map failed to load.";
      console.error("Mapbox error", event.error);
      setErrorMessage(message);
      setStatus("error");
    };

    map.on("load", onLoad);
    map.on("error", onError);
    mapRef.current = map;

    const observer = new ResizeObserver(() => {
      map.resize();
    });
    observer.observe(container);

    return () => {
      cancelled = true;
      observer.disconnect();
      map.off("load", onLoad);
      map.off("error", onError);
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // Mount once token is ready; center/marker updates handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tokenStatus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;

    map.easeTo({
      center,
      zoom,
      pitch,
      bearing,
      duration: 800,
      essential: true,
    });
  }, [status, center, zoom, pitch, bearing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;

    markerRef.current?.remove();
    markerRef.current = null;

    if (!marker) return;

    markerRef.current = new mapboxgl.Marker({
      element: createHomeMarkerElement(marker.label),
      anchor: "bottom",
    })
      .setLngLat(marker.lngLat)
      .setPopup(
        marker.label
          ? new mapboxgl.Popup({ offset: 18, closeButton: false }).setText(
              marker.label,
            )
          : undefined,
      )
      .addTo(map);
  }, [status, marker]);

  if (tokenStatus === "missing") {
    return (
      <div
        className={cn(
          "flex min-h-[22rem] flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/40 p-8 text-center",
          className,
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-background">
          <MapPinned className="size-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="font-medium">Mapbox token required</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              NEXT_MAPBOX_ACCESS_TOKEN
            </code>{" "}
            to{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.env</code>{" "}
            and restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative min-h-[22rem] overflow-hidden rounded-xl border bg-muted",
        className,
      )}
    >
      {tokenStatus === "loading" || status === "loading" ? (
        <Skeleton className="absolute inset-0 z-10 rounded-none" />
      ) : null}
      {status === "error" ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-muted/90 p-6 text-center">
          <p className="font-medium">Map couldn’t load</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {errorMessage ?? "Check your Mapbox token and network connection."}
          </p>
        </div>
      ) : null}
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
