"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MapViewClient } from "@/components/map/map-view-client";
import type { MapMarker } from "@/components/map/map-view";
import { useOnboarding } from "@/components/providers/onboarding-provider";
import { AnalysisCloseButton } from "@/components/risk/analysis-close-button";
import { FrostPanel } from "@/components/risk/frost-panel";
import {
  RiskBottomMenu,
  type RiskAnalysisItemId,
  type RiskPrimaryTabId,
} from "@/components/risk/risk-bottom-menu";
import { OutageBatteryCallout } from "@/components/risk/outage-battery-callout";
import { OutageTimelineSlider } from "@/components/risk/outage-timeline-slider";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MAP_DEFAULTS } from "@/lib/map/config";
import { geocodeAddressClient } from "@/lib/map/geocode-client";
import {
  formatAddressLine,
  hasHomeCoordinates,
} from "@/lib/onboarding/storage";
import { generateHomeOutageTimeline } from "@/lib/risk/synthetic-outages";
import {
  generateSyntheticWeatherHazards,
  hazardsToHeatmapGeoJSON,
  WEATHER_ANALYSIS_ZOOM,
} from "@/lib/risk/synthetic-weather";
import type { Address } from "@/lib/types/domain";
import { cn } from "@/lib/utils";

export function RiskAnalysisDashboard() {
  const { draft, updateDraft } = useOnboarding();
  const [primaryTab, setPrimaryTab] = useState<RiskPrimaryTabId>("analysis");
  /** null until the user taps into an analysis option */
  const [activeAnalysisId, setActiveAnalysisId] =
    useState<RiskAnalysisItemId | null>(null);
  const [outageIndex, setOutageIndex] = useState(0);
  const [showBasePower, setShowBasePower] = useState(false);
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

  const weatherHazards = useMemo(() => {
    if (!center) return [];
    return generateSyntheticWeatherHazards(center);
  }, [center]);

  const outageTimeline = useMemo(() => {
    if (!center || !weatherHazards.length) return null;
    return generateHomeOutageTimeline(center, weatherHazards);
  }, [center, weatherHazards]);

  const inAnalysis = activeAnalysisId != null;
  const showWeatherAnalysis = activeAnalysisId === "weather";

  const sliderEvents = outageTimeline?.events ?? [];

  useEffect(() => {
    if (!showWeatherAnalysis || !outageTimeline) return;
    const firstHit = outageTimeline.events.findIndex(
      (event) => event.impactedHome,
    );
    setOutageIndex(firstHit >= 0 ? firstHit : 0);
  }, [showWeatherAnalysis, outageTimeline]);

  function closeAnalysis() {
    setActiveAnalysisId(null);
    setShowBasePower(false);
  }

  function handlePrimaryTabChange(id: RiskPrimaryTabId) {
    setPrimaryTab(id);
    if (id === "home") {
      setActiveAnalysisId(null);
      setShowBasePower(false);
    }
  }

  function handleOutageIndexChange(index: number) {
    setOutageIndex(index);
    setShowBasePower(false);
  }

  const activeOutage =
    showWeatherAnalysis && sliderEvents.length
      ? sliderEvents[Math.min(outageIndex, sliderEvents.length - 1)]!
      : null;

  const outageBlackout = Boolean(
    showWeatherAnalysis && activeOutage?.impactedHome,
  );
  const revealBattery = outageBlackout && showBasePower;

  const marker = useMemo<MapMarker | null>(() => {
    if (!center) return null;
    return {
      lngLat: center,
      label: formatAddressLine(address) || "Your home",
      lit: revealBattery,
    };
  }, [address, center, revealBattery]);

  const weatherOverlay = useMemo(() => {
    if (!weatherHazards.length || !center) return null;
    return {
      points: hazardsToHeatmapGeoJSON(weatherHazards, {
        highlightId: activeOutage?.hazardId ?? null,
        home: center,
      }),
      visible: showWeatherAnalysis && !outageBlackout,
    };
  }, [
    weatherHazards,
    showWeatherAnalysis,
    activeOutage?.hazardId,
    center,
    outageBlackout,
  ]);

  const mapZoom = revealBattery
    ? MAP_DEFAULTS.batteryRevealZoom
    : outageBlackout
      ? MAP_DEFAULTS.outageHomeZoom
      : showWeatherAnalysis
        ? WEATHER_ANALYSIS_ZOOM
        : MAP_DEFAULTS.homeZoom;
  const mapPitch = revealBattery
    ? MAP_DEFAULTS.batteryRevealPitch
    : outageBlackout
      ? 55
      : showWeatherAnalysis
        ? 45
        : MAP_DEFAULTS.pitch;
  const mapBearing = revealBattery
    ? MAP_DEFAULTS.batteryRevealBearing
    : outageBlackout
      ? -12
      : MAP_DEFAULTS.bearing;
  const basemap = outageBlackout
    ? MAP_DEFAULTS.outageBasemap
    : MAP_DEFAULTS.basemap;

  const errorMessage =
    geocodeError.key === addressKey ? geocodeError.message : null;

  return (
    <main className="relative h-full w-full">
      <div className="absolute inset-0">
        {hasAddress && hasCoords && center && marker ? (
          <MapViewClient
            className="h-full w-full rounded-none border-0"
            center={center}
            zoom={mapZoom}
            pitch={mapPitch}
            bearing={mapBearing}
            basemap={basemap}
            marker={marker}
            weatherHazards={weatherOverlay}
            outageBlackout={outageBlackout}
            enableThreeLayer={false}
          />
        ) : hasAddress && !hasCoords && !errorMessage ? (
          <Skeleton className="h-full w-full rounded-none" />
        ) : (
          <div className="h-full w-full bg-muted" />
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between pt-[calc(3.5rem+env(safe-area-inset-top)+0.75rem)]">
        <div className="flex w-full flex-col items-start gap-3 px-4 sm:px-6">
          {inAnalysis ? (
            <AnalysisCloseButton onClose={closeAnalysis} />
          ) : null}

          {!hasAddress || errorMessage ? (
            <FrostPanel className="pointer-events-auto w-full max-w-sm">
              <div className="p-4">
                <p className="text-sm font-semibold text-white">
                  {!hasAddress ? "Home address needed" : "Couldn’t place home"}
                </p>
                <p className="mt-1 text-xs text-white/65">
                  {!hasAddress
                    ? "Add your address in onboarding to center the map."
                    : errorMessage}
                </p>
                <Link
                  href="/onboarding/address"
                  className={cn(
                    buttonVariants({ size: "sm" }),
                    "mt-3 border-white/20 bg-white text-black hover:bg-white/90",
                  )}
                >
                  {!hasAddress ? "Add your address" : "Update address"}
                </Link>
              </div>
            </FrostPanel>
          ) : activeOutage ? (
            <OutageBatteryCallout
              event={activeOutage}
              showBasePower={showBasePower}
              onShowBasePowerChange={setShowBasePower}
            />
          ) : null}
        </div>

        {showWeatherAnalysis && sliderEvents.length ? (
          <OutageTimelineSlider
            events={sliderEvents}
            activeIndex={Math.min(outageIndex, sliderEvents.length - 1)}
            onChange={handleOutageIndexChange}
          />
        ) : !inAnalysis ? (
          <div className="flex w-full flex-col items-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            <RiskBottomMenu
              primaryTab={primaryTab}
              onPrimaryTabChange={handlePrimaryTabChange}
              activeAnalysisId={activeAnalysisId}
              onAnalysisChange={setActiveAnalysisId}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
