"use client";

import Image from "next/image";
import { BatteryCharging, CircuitBoard, PlugZap, ScanLine } from "lucide-react";
import { DeviceScanSheet } from "@/components/home/device-scan-sheet";
import { buttonVariants } from "@/components/ui/button";
import type { HomeDevice, HomeDeviceKind } from "@/lib/home/devices";
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
  return PlugZap;
}

function kindLabel(kind: HomeDeviceKind) {
  if (kind === "panel") return "Panel";
  if (kind === "battery") return "Battery";
  return "Appliance";
}

export function MyHomeScreen({
  devices,
  onAddDevice,
  scanOpen,
  onScanOpenChange,
  className,
}: MyHomeScreenProps) {
  const empty = devices.length === 0;

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
            src="/home/my-home-hero.jpg"
            alt="Home with Base Power battery connected to the grid"
            width={1024}
            height={698}
            priority
            className="h-auto w-full object-cover object-center"
          />
        </div>

        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-[calc(7.5rem+var(--sab))] pt-5 sm:px-6">
          <header className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              My home
            </h1>
            <p className="text-sm text-muted-foreground">
              Devices and panel loads that run on backup during an outage.
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
                Scan your appliances and electrical panel so we can estimate
                backup draw for each outage.
              </p>
              <button
                type="button"
                onClick={() => onScanOpenChange(true)}
                className={cn(buttonVariants({ size: "lg" }), "mt-6 gap-2")}
              >
                <ScanLine className="size-4" aria-hidden />
                Scan a device
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  {devices.length} device{devices.length === 1 ? "" : "s"}
                </p>
                <button
                  type="button"
                  onClick={() => onScanOpenChange(true)}
                  className={cn(
                    buttonVariants({ size: "sm", variant: "outline" }),
                    "gap-1.5",
                  )}
                >
                  <ScanLine className="size-3.5" aria-hidden />
                  Scan
                </button>
              </div>

              <ul className="space-y-2">
                {devices.map((device) => {
                  const Icon = kindIcon(device.kind);
                  return (
                    <li
                      key={device.id}
                      className="flex items-center gap-3 rounded-2xl border border-black/8 bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-800">
                        <Icon className="size-4.5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {device.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {kindLabel(device.kind)}
                          {device.watts > 0 ? ` · ${device.watts} W` : null}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
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
