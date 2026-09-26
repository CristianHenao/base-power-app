"use client";

import { useState } from "react";
import { CircuitBoard, Cross, Fuel, ScanLine, Snowflake, Zap } from "lucide-react";
import { NameplateScanSheet } from "@/components/home/nameplate-scan-sheet";
import { PanelScanSheet } from "@/components/home/panel-scan-sheet";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  applyNameplateToDevice,
  applyPanelDirectoryToDevice,
  deviceDetailRows,
  HOME_DEVICE_CATEGORY_META,
  type DeviceNameplateResult,
  type HomeDevice,
  type PanelDirectoryResult,
} from "@/lib/home/devices";
import {
  formatGeneratorExtensionDetail,
  generatorExtensionForDevice,
} from "@/lib/home/generator-backup";
import { cn } from "@/lib/utils";

type DeviceDetailSheetProps = {
  device: HomeDevice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeviceUpdate: (device: HomeDevice) => void;
};

export function DeviceDetailSheet({
  device,
  open,
  onOpenChange,
  onDeviceUpdate,
}: DeviceDetailSheetProps) {
  const [nameplateOpen, setNameplateOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  if (!device) return null;

  const isPanel = device.kind === "panel" || device.category === "panel";
  const rows = deviceDetailRows(device);
  const critical = device.isMedical || device.needsRefrigeration;
  const enrichOpen = nameplateOpen || panelOpen;
  const detailOpen = open && !enrichOpen;
  const generatorExt = generatorExtensionForDevice(device);
  const breakers = device.breakers ?? [];

  function handleNameplateRead(result: DeviceNameplateResult) {
    const next = applyNameplateToDevice(device!, result);
    onDeviceUpdate(next);
  }

  function handlePanelRead(result: PanelDirectoryResult) {
    const next = applyPanelDirectoryToDevice(device!, result);
    onDeviceUpdate(next);
  }

  function handleDetailOpenChange(next: boolean) {
    if (enrichOpen) return;
    onOpenChange(next);
  }

  return (
    <>
      <Sheet open={detailOpen} onOpenChange={handleDetailOpenChange}>
        <SheetContent
          side="bottom"
          className="flex max-h-[min(88vh,40rem)] flex-col gap-0 overflow-hidden rounded-t-3xl pb-[max(1rem,var(--sab))]"
        >
          <SheetHeader className="shrink-0 border-b border-border/60 px-4 pb-4 pt-4 text-left">
            <div className="flex items-start gap-3 pr-8">
              {device.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={device.thumbnailUrl}
                  alt=""
                  className="size-14 shrink-0 rounded-2xl object-cover ring-1 ring-black/10"
                />
              ) : isPanel ? (
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-black/[0.05] text-foreground/70">
                  <CircuitBoard className="size-6" aria-hidden />
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-lg">{device.name}</SheetTitle>
                <SheetDescription className="mt-0.5">
                  {HOME_DEVICE_CATEGORY_META[device.category].label}
                  {device.brand ? ` · ${device.brand}` : null}
                </SheetDescription>
                {critical || device.kind === "generator" || isPanel ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {isPanel ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                        <CircuitBoard className="size-2.5" aria-hidden />
                        Breaker panel
                      </span>
                    ) : null}
                    {device.kind === "generator" ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                        <Fuel className="size-2.5" aria-hidden />
                        Generator · Core port
                      </span>
                    ) : null}
                    {device.isMedical ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-800">
                        <Cross className="size-2.5" aria-hidden />
                        Medical
                      </span>
                    ) : null}
                    {device.needsRefrigeration ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
                        <Snowflake className="size-2.5" aria-hidden />
                        Needs refrigeration
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </SheetHeader>

          <div
            key={device.id}
            className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4"
          >
            {generatorExt ? (
              <div className="flex items-start gap-3">
                <div
                  className="flex shrink-0 items-center -space-x-2.5 pt-0.5"
                  aria-hidden
                >
                  <Zap className="size-6 fill-[#b2dd79] text-[#b2dd79]" />
                  <Zap className="relative size-6 fill-[#f7c33c] text-[#f7c33c]" />
                </div>
                <p className="min-w-0 text-sm leading-snug text-foreground">
                  {formatGeneratorExtensionDetail(generatorExt)}
                </p>
              </div>
            ) : null}

            {isPanel && breakers.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    Breakers
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {breakers.length} circuit
                    {breakers.length === 1 ? "" : "s"}
                  </p>
                </div>
                <ul className="divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/8 bg-white">
                  {breakers.map((breaker) => (
                    <li
                      key={breaker.id}
                      className="flex items-start gap-3 px-3.5 py-2.5"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex min-w-10 shrink-0 items-center justify-center rounded-md px-1.5 py-1 font-mono text-[11px] font-semibold",
                          breaker.isMain
                            ? "bg-foreground text-background"
                            : breaker.isSpare
                              ? "bg-black/[0.04] text-muted-foreground"
                              : "bg-amber-400/20 text-amber-950",
                        )}
                      >
                        {breaker.position}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-sm font-medium",
                            breaker.isSpare
                              ? "text-muted-foreground"
                              : "text-foreground",
                          )}
                        >
                          {breaker.label}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {breaker.isMain
                            ? "Main"
                            : breaker.side !== "unknown"
                              ? breaker.side
                              : null}
                          {breaker.amps != null
                            ? `${breaker.isMain || breaker.side !== "unknown" ? " · " : ""}${breaker.amps} A`
                            : null}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {rows.map((row) => (
                  <div
                    key={row.key}
                    className="rounded-2xl bg-black/[0.03] px-3 py-2.5"
                  >
                    <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                      {row.label}
                    </p>
                    <p className="mt-1 text-sm font-medium break-words text-foreground">
                      {row.value}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {isPanel && breakers.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {rows
                  .filter((row) =>
                    ["brand", "model", "main_amps", "spaces", "circuits"].includes(
                      row.key,
                    ),
                  )
                  .map((row) => (
                    <div
                      key={row.key}
                      className="rounded-2xl bg-black/[0.03] px-3 py-2.5"
                    >
                      <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                        {row.label}
                      </p>
                      <p className="mt-1 text-sm font-medium break-words text-foreground">
                        {row.value}
                      </p>
                    </div>
                  ))}
              </div>
            ) : null}

            {isPanel ? (
              <p className="text-center text-[11px] text-muted-foreground">
                {device.panelScannedAt
                  ? `Panel scanned ${new Date(device.panelScannedAt).toLocaleString()}`
                  : "Open the panel door and scan the breaker numbers plus handwritten labels."}
              </p>
            ) : device.nameplateScannedAt ? (
              <p className="text-center text-[11px] text-muted-foreground">
                Nameplate scanned{" "}
                {new Date(device.nameplateScannedAt).toLocaleString()}
              </p>
            ) : (
              <p className="text-center text-[11px] text-muted-foreground">
                {device.kind === "generator"
                  ? "Scan the rating label for exact rated output watts."
                  : "Scan the rating label on the back or bottom for exact specs."}
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                if (isPanel) setPanelOpen(true);
                else setNameplateOpen(true);
              }}
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full gap-2 bg-foreground text-background hover:bg-foreground/90",
              )}
            >
              <ScanLine className="size-4" aria-hidden />
              {isPanel
                ? device.panelScannedAt
                  ? "Scan panel again"
                  : "Scan breaker labels"
                : device.nameplateScannedAt
                  ? "Scan label again"
                  : "Scan for exact data"}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <NameplateScanSheet
        open={nameplateOpen}
        onClose={() => setNameplateOpen(false)}
        onNameplateRead={handleNameplateRead}
      />

      <PanelScanSheet
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onPanelRead={handlePanelRead}
      />
    </>
  );
}
