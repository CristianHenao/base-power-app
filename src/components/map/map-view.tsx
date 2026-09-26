"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl, { type Map, type LngLatLike } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPinned } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMapboxToken, MAP_DEFAULTS } from "@/lib/map/config";
import { createThreeLayer } from "@/lib/map/create-three-layer";
import { Skeleton } from "@/components/ui/skeleton";

export type MapViewProps = {
  className?: string;
  center?: LngLatLike;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  style?: string;
  /** When true, attaches the Three.js custom layer scaffold. */
  enableThreeLayer?: boolean;
  onMapReady?: (map: Map) => void;
};

export function MapView({
  className,
  center = MAP_DEFAULTS.center,
  zoom = MAP_DEFAULTS.zoom,
  pitch = MAP_DEFAULTS.pitch,
  bearing = MAP_DEFAULTS.bearing,
  style = MAP_DEFAULTS.style,
  enableThreeLayer = true,
  onMapReady,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const token = getMapboxToken();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
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

    map.on("load", () => {
      if (enableThreeLayer && !map.getLayer("three-layer")) {
        map.addLayer(createThreeLayer({ id: "three-layer" }));
      }
      setReady(true);
      onMapReady?.(map);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Intentionally mount once; prop updates can be wired later via imperative API.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/40 p-8 text-center",
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
        "relative overflow-hidden rounded-xl border bg-muted",
        className,
      )}
    >
      {!ready && <Skeleton className="absolute inset-0 z-10 rounded-none" />}
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
