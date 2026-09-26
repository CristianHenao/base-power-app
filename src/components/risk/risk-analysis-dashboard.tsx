"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MapViewClient } from "@/components/map/map-view-client";
import type { MapMarker } from "@/components/map/map-view";
import { useOnboarding } from "@/components/providers/onboarding-provider";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MAP_DEFAULTS } from "@/lib/map/config";
import { geocodeAddress } from "@/lib/map/geocode";
import {
  formatAddressLine,
  hasHomeCoordinates,
} from "@/lib/onboarding/storage";
import type { Address } from "@/lib/types/domain";
import { cn } from "@/lib/utils";

export function RiskAnalysisDashboard() {
  const { draft, updateDraft } = useOnboarding();
  const address = draft.address;
  const addressKey = useMemo(
    () =>
      JSON.stringify({
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        latitude: address.latitude,
        longitude: address.longitude,
      }),
    [address],
  );

  const [geocodeError, setGeocodeError] = useState<{
    key: string;
    message: string | null;
  }>({ key: addressKey, message: null });

  if (geocodeError.key !== addressKey) {
    setGeocodeError({ key: addressKey, message: null });
  }

  const hasAddress =
    Boolean(address.line1) &&
    Boolean(address.city) &&
    Boolean(address.state) &&
    Boolean(address.postalCode);
  const hasCoords = hasHomeCoordinates(address);

  useEffect(() => {
    if (!hasAddress || hasCoords) return;

    const controller = new AbortController();

    void geocodeAddress(address as Address, controller.signal)
      .then((location) => {
        if (!location) {
          setGeocodeError({
            key: addressKey,
            message: "We couldn’t locate that home address on the map.",
          });
          return;
        }
        updateDraft({
          address: {
            ...address,
            latitude: location.latitude,
            longitude: location.longitude,
          },
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setGeocodeError({
          key: addressKey,
          message:
            err instanceof Error
              ? err.message
              : "Map lookup failed. Check your Mapbox token and try again.",
        });
      });

    return () => controller.abort();
  }, [address, addressKey, hasAddress, hasCoords, updateDraft]);

  const center = useMemo<[number, number] | null>(() => {
    if (!hasHomeCoordinates(address)) return null;
    return [address.longitude, address.latitude];
  }, [address]);

  const marker = useMemo<MapMarker | null>(() => {
    if (!center) return null;
    return {
      lngLat: center,
      label: formatAddressLine(address) || "Your home",
    };
  }, [address, center]);

  const addressLabel = formatAddressLine(address);
  const errorMessage =
    geocodeError.key === addressKey ? geocodeError.message : null;

  return (
    <main className="relative h-full w-full">
      {/* Full-bleed map layer */}
      <div className="absolute inset-0">
        {hasAddress && hasCoords && center && marker ? (
          <MapViewClient
            className="h-full w-full rounded-none border-0"
            center={center}
            zoom={MAP_DEFAULTS.homeZoom}
            marker={marker}
            enableThreeLayer={false}
          />
        ) : hasAddress && !hasCoords && !errorMessage ? (
          <Skeleton className="h-full w-full rounded-none" />
        ) : (
          <div className="h-full w-full bg-muted" />
        )}
      </div>

      {/* Floating UI overlays — leave room for header (h-14) */}
      <div className="pointer-events-none absolute inset-0 z-10 p-4 pt-[4.5rem] sm:p-6 sm:pt-20">
        <div className="pointer-events-auto w-full max-w-md">
          <Card className="border-border/60 bg-background/85 shadow-lg backdrop-blur-md">
            <CardHeader className="gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">Risk analysis</CardTitle>
                <Badge variant="secondary">Your home</Badge>
              </div>
              <CardDescription>
                {addressLabel
                  ? `Showing risk context for ${addressLabel}.`
                  : "Complete onboarding so we can place your home on the map."}
              </CardDescription>
            </CardHeader>

            {!hasAddress ? (
              <CardContent>
                <Link
                  href="/onboarding/address"
                  className={cn(buttonVariants({ size: "sm" }))}
                >
                  Add your address
                </Link>
              </CardContent>
            ) : null}

            {hasAddress && errorMessage ? (
              <CardContent className="space-y-3">
                <p className="text-sm text-destructive">{errorMessage}</p>
                <Link
                  href="/onboarding/address"
                  className={cn(buttonVariants({ size: "sm" }))}
                >
                  Update address
                </Link>
              </CardContent>
            ) : null}
          </Card>
        </div>
      </div>
    </main>
  );
}
