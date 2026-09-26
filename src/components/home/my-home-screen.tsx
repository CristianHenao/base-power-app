"use client";

import Image from "next/image";
import {
  BatteryCharging,
  CircuitBoard,
  Cross,
  PlugZap,
  ScanLine,
  Snowflake,
} from "lucide-react";
import { DeviceScanSheet } from "@/components/home/device-scan-sheet";
import {
  groupDevicesByCategory,
  HOME_DEVICE_CATEGORY_META,
  type HomeDevice,
  type HomeDeviceKind,
} from "@/lib/home/devices";
import { cn } from "@/lib/utils";

type MyHomeScreenProps = {
  devices: HomeDevice[];
  onAddDevice: (device: HomeDevice) => void;
  scanOpen: boolean;
  onScanOpenChange: (open: boolean) => void;
  className?: string;
};

function kindIcon(kind: HomeDeviceKind) {
  if (kind === "panel") return CircuitBoard;
  if (kind === "battery") return BatteryCharging;
  if (kind === "medical") return Cross;
  return PlugZap;
}

export function MyHomeScreen({
  devices,
  onAddDevice,
  scanOpen,
  onScanOpenChange,
  className,
}: MyHomeScreenProps) {
  const empty = devices.length === 0;
  const grouped = groupDevicesByCategory(devices);
  const criticalCount = devices.filter(
    (device) => device.isMedical || device.needsRefrigeration,
  ).length;

  return (
    <>
      <div
        className={cn(
          "flex h-full min-h-0 flex-col overflow-y-auto bg-background",
          className,
        )}
      >
        <div className="relative w-full shrink-0 overflow-hidden bg-white">
          <Image
            src="/home/my-home-hero.png"
            alt="Home with Base Power battery connected to the grid"
            width={1024}
            height={616}
            priority
            className="h-auto w-full bg-white object-cover object-center"
          />
        </div>

        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-[calc(7.5rem+var(--sab))] pt-5 sm:px-6">
          <header className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              My home
            </h1>
            <p className="text-sm text-muted-foreground">
              Devices by room — including medical gear and refrigerated
              medication that must stay powered.
            </p>
          </header>

          {empty ? (
            <div className="mt-8 flex flex-1 flex-col items-center justify-center text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-black/[0.05] text-foreground/70">
                <ScanLine className="size-6" aria-hidden />
              </span>
              <p className="mt-4 text-base font-medium text-foreground">
                No devices yet
              </p>
              <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
                Scan appliances, your panel, and critical medical devices or
                medication that needs refrigeration.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <p className="font-medium text-foreground">
                  {devices.length} device{devices.length === 1 ? "" : "s"}
                </p>
                {criticalCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-800">
                    <Cross className="size-3" aria-hidden />
                    {criticalCount} critical for health
                  </span>
                ) : null}
              </div>

              {grouped.map((group) => (
                <section key={group.category} className="space-y-2">
                  <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {group.label}
                  </h2>
                  <ul className="space-y-2">
                    {group.devices.map((device) => {
                      const Icon = kindIcon(device.kind);
                      const critical =
                        device.isMedical || device.needsRefrigeration;
                      return (
                        <li
                          key={device.id}
                          className={cn(
                            "flex items-center gap-3 rounded-2xl border bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
                            critical
                              ? "border-rose-200 bg-rose-50/60"
                              : "border-black/8",
                          )}
                        >
                          {device.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={device.thumbnailUrl}
                              alt=""
                              className={cn(
                                "size-12 shrink-0 rounded-xl object-cover ring-1",
                                critical
                                  ? "ring-rose-200"
                                  : "ring-black/10",
                              )}
                            />
                          ) : (
                            <span
                              className={cn(
                                "flex size-12 shrink-0 items-center justify-center rounded-xl",
                                critical
                                  ? "bg-rose-500/15 text-rose-800"
                                  : "bg-amber-400/15 text-amber-800",
                              )}
                            >
                              <Icon className="size-4.5" aria-hidden />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {device.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {HOME_DEVICE_CATEGORY_META[device.category].label}
                              {device.brand ? ` · ${device.brand}` : null}
                              {device.watts > 0
                                ? ` · ${device.watts} W est.`
                                : null}
                            </p>
                            {critical ? (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {device.isMedical ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-800">
                                    <Cross className="size-2.5" aria-hidden />
                                    Medical
                                  </span>
                                ) : null}
                                {device.needsRefrigeration ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
                                    <Snowflake
                                      className="size-2.5"
                                      aria-hidden
                                    />
                                    Needs refrigeration
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      <DeviceScanSheet
        open={scanOpen}
        onClose={() => onScanOpenChange(false)}
        onDeviceFound={onAddDevice}
        existingCount={devices.length}
      />
    </>
  );
}
