"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl, { type LngLatLike, type Map, type Marker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPinned } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMapboxToken, MAP_DEFAULTS } from "@/lib/map/config";
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
  marker?: MapMarker | null;
  /**
   * Optional Three.js overlay. Disabled by default — sharing Mapbox’s WebGL
   * context can blank the basemap if the layer isn’t carefully managed.
   */
  enableThreeLayer?: boolean;
  onMapReady?: (map: Map) => void;
};

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
  marker = null,
  enableThreeLayer = false,
  onMapReady,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const token = getMapboxToken();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = token;

    let cancelled = false;
    const container = containerRef.current;

    const map = new mapboxgl.Map({
      container,
      style,
      center,
      zoom,
      pitch,
      bearing,
      antialias: MAP_DEFAULTS.antialias,
      attributionControl: true,
    });

    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      "top-right",
    );
    map.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      }),
      "top-right",
    );

    const onLoad = () => {
      if (cancelled) return;

      // Ensure Mapbox measures the laid-out container size.
      map.resize();

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
    // Mount once; center/marker updates handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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

  if (!token) {
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
              NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
            </code>{" "}
            to{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              .env.local
            </code>{" "}
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
      {status === "loading" ? (
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
