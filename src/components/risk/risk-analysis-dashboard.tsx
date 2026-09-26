"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MapViewClient } from "@/components/map/map-view-client";
import type { MapMarker } from "@/components/map/map-view";
import { useOnboarding } from "@/components/providers/onboarding-provider";
import {
  RiskBottomMenu,
  type RiskMenuItemId,
} from "@/components/risk/risk-bottom-menu";
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
import { geocodeAddressClient } from "@/lib/map/geocode-client";
import {
  formatAddressLine,
  hasHomeCoordinates,
} from "@/lib/onboarding/storage";
import type { Address } from "@/lib/types/domain";
import { cn } from "@/lib/utils";

export function RiskAnalysisDashboard() {
  const { draft, updateDraft } = useOnboarding();
  const [activeMenu, setActiveMenu] = useState<RiskMenuItemId>("weather");
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

    void geocodeAddressClient(address as Address, controller.signal)
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

  const errorMessage =
    geocodeError.key === addressKey ? geocodeError.message : null;

  return (
    <main className="relative h-full w-full">
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

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-4 pt-[4.5rem] sm:p-6 sm:pt-20">
        {!hasAddress || errorMessage ? (
          <div className="pointer-events-auto w-full max-w-sm">
            <Card className="border-border/60 bg-background/85 shadow-lg backdrop-blur-md">
              <CardHeader className="gap-1.5">
                <CardTitle className="text-base">
                  {!hasAddress ? "Home address needed" : "Couldn’t place home"}
                </CardTitle>
                <CardDescription>
                  {!hasAddress
                    ? "Add your address in onboarding to center the map."
                    : errorMessage}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href="/onboarding/address"
                  className={cn(buttonVariants({ size: "sm" }))}
                >
                  {!hasAddress ? "Add your address" : "Update address"}
                </Link>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div />
        )}

        <div className="pointer-events-none flex w-full justify-center pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          <RiskBottomMenu activeId={activeMenu} onChange={setActiveMenu} />
        </div>
      </div>
    </main>
  );
}
