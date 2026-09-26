"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MyHomeScreen } from "@/components/home/my-home-screen";
import { useAppScene } from "@/components/layout/use-app-scene";
import { MapViewClient } from "@/components/map/map-view-client";
import type { MapMarker } from "@/components/map/map-view";
import { useOnboarding } from "@/components/providers/onboarding-provider";
import { AnalysisCloseButton } from "@/components/risk/analysis-close-button";
import { BasePowerToggle } from "@/components/risk/base-power-toggle";
import { FrostPanel } from "@/components/risk/frost-panel";
import {
  RiskBottomMenu,
  weatherRiskBadgesFromHazards,
  type RiskAnalysisItemId,
  type RiskPrimaryTabId,
} from "@/components/risk/risk-bottom-menu";
import { OutageEventCards } from "@/components/risk/outage-event-cards";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { HomeDevice } from "@/lib/home/devices";
import { MAP_DEFAULTS } from "@/lib/map/config";
import { geocodeAddressClient } from "@/lib/map/geocode-client";
import {
  boundsForOutagePerimeter,
  buildOutagePerimeter,
} from "@/lib/map/outage-perimeter-layers";
import {
  formatAddressLine,
  hasHomeCoordinates,
} from "@/lib/onboarding/storage";
import { countyHistoryToSliderEvents } from "@/lib/fixtures/county-history";
import { useCountyOutages } from "@/lib/report/use-county-outages";
import {
  generateSyntheticWeatherHazards,
  hazardsToHeatmapGeoJSON,
} from "@/lib/risk/synthetic-weather";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import {
  deleteHomeDevice,
  listHomeDevices,
  upsertHomeDevice,
} from "@/lib/supabase/home-devices";
import { getCurrentUser } from "@/lib/supabase/profile";
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
  /** Full-width appliance breakdown — only from “View battery capacity” */
  const [batteryCapacityOpen, setBatteryCapacityOpen] = useState(false);
  const [homeDevices, setHomeDevices] = useState<HomeDevice[]>([]);
  const [deviceScanOpen, setDeviceScanOpen] = useState(false);
  const address = draft.address;

  useAppScene(primaryTab === "home" ? "light" : "map");

  useEffect(() => {
    if (!hasSupabaseConfig()) return;

    let cancelled = false;

    async function loadDevices() {
      try {
        const supabase = createClient();
        const user = await getCurrentUser(supabase);
        if (!user || cancelled) return;
        const devices = await listHomeDevices(supabase, user.id);
        if (!cancelled) setHomeDevices(devices);
      } catch (error) {
        console.error("Failed to load home devices", error);
      }
    }

    void loadDevices();
    return () => {
      cancelled = true;
    };
  }, []);

  async function persistHomeDevice(device: HomeDevice) {
    if (!hasSupabaseConfig()) return;
    try {
      const supabase = createClient();
      const user = await getCurrentUser(supabase);
      if (!user) return;
      const saved = await upsertHomeDevice(supabase, user.id, device);
      setHomeDevices((prev) => {
        const exists = prev.some((item) => item.id === saved.id);
        if (!exists) return [...prev, saved];
        return prev.map((item) => (item.id === saved.id ? saved : item));
      });
    } catch (error) {
      console.error("Failed to save home device", error);
    }
  }  const addressKey = useMemo(
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

  const weatherRiskBadges = useMemo(
    () => weatherRiskBadgesFromHazards(weatherHazards),
    [weatherHazards],
  );

  // Real county outages from the Porchlight report; the fixture shows until the report arrives.
  const fixtureEvents = useMemo(() => countyHistoryToSliderEvents(), []);
  const { events: sliderEvents } = useCountyOutages(formatAddressLine(address), fixtureEvents);

  const inAnalysis = activeAnalysisId != null;
  const showWeatherAnalysis = activeAnalysisId === "weather";
  const showMyHome = primaryTab === "home";

  useEffect(() => {
    if (!showWeatherAnalysis || !sliderEvents.length) return;
    setOutageIndex(0);
  }, [showWeatherAnalysis, sliderEvents]);

  function closeAnalysis() {
    setActiveAnalysisId(null);
    setShowBasePower(false);
    setBatteryCapacityOpen(false);
  }

  function handlePrimaryTabChange(id: RiskPrimaryTabId) {
    setPrimaryTab(id);
    if (id === "home") {
      setActiveAnalysisId(null);
      setShowBasePower(false);
      setBatteryCapacityOpen(false);
      setDeviceScanOpen(false);
    }
  }

  function handleAddHomeDevice(device: HomeDevice) {
    setHomeDevices((prev) => [...prev, device]);
    void persistHomeDevice(device);
  }

  function handleUpdateHomeDevice(device: HomeDevice) {
    setHomeDevices((prev) =>
      prev.map((item) => (item.id === device.id ? device : item)),
    );
    void persistHomeDevice(device);
  }

  function handleDeleteHomeDevice(device: HomeDevice) {
    setHomeDevices((prev) => prev.filter((item) => item.id !== device.id));
    void (async () => {
      if (!hasSupabaseConfig()) return;
      try {
        const supabase = createClient();
        const user = await getCurrentUser(supabase);
        if (!user) return;
        await deleteHomeDevice(supabase, user.id, device.id);
      } catch (error) {
        console.error("Failed to delete home device", error);
      }
    })();
  }

  function handleOutageIndexChange(index: number) {
    setOutageIndex(index);
    setBatteryCapacityOpen(false);
  }

  function handleBasePowerChange(checked: boolean) {
    setShowBasePower(checked);
    if (!checked) setBatteryCapacityOpen(false);
  }

  function handleViewBatteryCapacity(index: number) {
    setOutageIndex(index);
    setShowBasePower(true);
    setBatteryCapacityOpen(true);
  }

  function handleExitBatteryCapacity() {
    setBatteryCapacityOpen(false);
  }

  const activeOutage =
    showWeatherAnalysis && sliderEvents.length
      ? sliderEvents[Math.min(outageIndex, sliderEvents.length - 1)]!
      : null;

  const outageBlackout = Boolean(
    showWeatherAnalysis && activeOutage?.impactedHome,
  );
  const revealBattery = outageBlackout && showBasePower;
  /** Capacity focus: pull back to neighborhood (not house-close) */
  const useCapacityCamera = showWeatherAnalysis && batteryCapacityOpen;

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

  const outagePerimeterOverlay = useMemo(() => {
    if (!showWeatherAnalysis || !activeOutage) return null;
    const hazard =
      weatherHazards.find((item) => item.id === activeOutage.hazardId) ?? null;
    return {
      area: buildOutagePerimeter(hazard, {
        home: center,
        impactedHome: activeOutage.impactedHome,
        seedId: activeOutage.id,
      }),
      visible: true,
    };
  }, [
    showWeatherAnalysis,
    activeOutage,
    weatherHazards,
    center,
  ]);

  /** Fit perimeter + home on card change; neighborhood camera in capacity focus */
  const cameraBounds = useMemo(() => {
    if (useCapacityCamera) return null;
    if (!showWeatherAnalysis || !outagePerimeterOverlay?.area.features.length) {
      return null;
    }
    return boundsForOutagePerimeter(outagePerimeterOverlay.area, center);
  }, [useCapacityCamera, showWeatherAnalysis, outagePerimeterOverlay, center]);

  const mapZoom = useCapacityCamera
    ? MAP_DEFAULTS.batteryRevealZoom
    : showWeatherAnalysis
      ? MAP_DEFAULTS.outageHomeZoom
      : MAP_DEFAULTS.homeZoom;
  const mapPitch = useCapacityCamera
    ? MAP_DEFAULTS.batteryRevealPitch
    : showWeatherAnalysis
      ? 62
      : MAP_DEFAULTS.pitch;
  const mapBearing = useCapacityCamera
    ? MAP_DEFAULTS.batteryRevealBearing
    : showWeatherAnalysis
      ? -18
      : MAP_DEFAULTS.bearing;
  const basemap = outageBlackout
    ? MAP_DEFAULTS.outageBasemap
    : MAP_DEFAULTS.basemap;

  const errorMessage =
    geocodeError.key === addressKey ? geocodeError.message : null;

  return (
    <main className="relative h-full w-full">
      {showMyHome ? (
        <MyHomeScreen
          devices={homeDevices}
          onAddDevice={handleAddHomeDevice}
          onUpdateDevice={handleUpdateHomeDevice}
          onDeleteDevice={handleDeleteHomeDevice}
          scanOpen={deviceScanOpen}
          onScanOpenChange={setDeviceScanOpen}
          className="absolute inset-0 pt-[calc(3.5rem+var(--sat))]"
        />
      ) : (
        <div className="absolute inset-0">
          {hasAddress && hasCoords && center && marker ? (
            <MapViewClient
              className="h-full w-full rounded-none border-0"
              center={center}
              zoom={mapZoom}
              pitch={mapPitch}
              bearing={mapBearing}
              cameraBounds={cameraBounds}
              basemap={basemap}
              marker={marker}
              weatherHazards={weatherOverlay}
              outagePerimeter={outagePerimeterOverlay}
              outageBlackout={outageBlackout}
              enableThreeLayer={false}
            />
          ) : hasAddress && !hasCoords && !errorMessage ? (
            <Skeleton className="h-full w-full rounded-none" />
          ) : (
            <div className="h-full w-full bg-muted" />
          )}
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between pt-[calc(3.5rem+var(--sat)+0.75rem)]">
        <div className="flex w-full flex-col items-start gap-3 px-4 sm:px-6">
          {!showMyHome && inAnalysis ? (
            <div className="flex items-center gap-2">
              <AnalysisCloseButton onClose={closeAnalysis} />
              {activeOutage?.impactedHome ? (
                <BasePowerToggle
                  checked={showBasePower}
                  onCheckedChange={handleBasePowerChange}
                />
              ) : null}
            </div>
          ) : null}

          {!showMyHome && (!hasAddress || errorMessage) ? (
            <FrostPanel className="pointer-events-auto w-full max-w-sm">
              <div className="p-4">
                <p className="text-sm font-semibold">
                  {!hasAddress ? "Home address needed" : "Couldn’t place home"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {!hasAddress
                    ? "Add your address in onboarding to center the map."
                    : errorMessage}
                </p>
                <Link
                  href="/onboarding/address"
                  className={cn(buttonVariants({ size: "sm" }), "mt-3")}
                >
                  {!hasAddress ? "Add your address" : "Update address"}
                </Link>
              </div>
            </FrostPanel>
          ) : null}
        </div>

        {!showMyHome && showWeatherAnalysis && sliderEvents.length ? (
          <OutageEventCards
            events={sliderEvents}
            activeIndex={Math.min(outageIndex, sliderEvents.length - 1)}
            onChange={handleOutageIndexChange}
            showBasePower={showBasePower}
            capacityFocused={batteryCapacityOpen}
            onViewBatteryCapacity={handleViewBatteryCapacity}
            onExitBatteryCapacity={handleExitBatteryCapacity}
          />
        ) : !inAnalysis ? (
          <div className="flex w-full flex-col items-center px-4 pb-[max(0.75rem,var(--sab))] sm:px-6">
            <RiskBottomMenu
              primaryTab={primaryTab}
              onPrimaryTabChange={handlePrimaryTabChange}
              activeAnalysisId={activeAnalysisId}
              onAnalysisChange={setActiveAnalysisId}
              weatherRiskBadges={weatherRiskBadges}
              onScanPress={
                showMyHome ? () => setDeviceScanOpen(true) : undefined
              }
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
