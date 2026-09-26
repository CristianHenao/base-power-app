"use client";

import { useState } from "react";
import { Cross, ScanLine, Snowflake } from "lucide-react";
import { NameplateScanSheet } from "@/components/home/nameplate-scan-sheet";
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
  deviceDetailRows,
  HOME_DEVICE_CATEGORY_META,
  type DeviceNameplateResult,
  type HomeDevice,
} from "@/lib/home/devices";
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

  if (!device) return null;

  const rows = deviceDetailRows(device);
  const critical = device.isMedical || device.needsRefrigeration;
  const detailOpen = open && !nameplateOpen;

  function handleNameplateRead(result: DeviceNameplateResult) {
    const next = applyNameplateToDevice(device!, result);
    onDeviceUpdate(next);
  }

  function handleDetailOpenChange(next: boolean) {
    if (nameplateOpen) return;
    onOpenChange(next);
  }

  return (
    <>
      <Sheet open={detailOpen} onOpenChange={handleDetailOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[min(88vh,40rem)] gap-0 overflow-y-auto rounded-t-3xl pb-[max(1rem,var(--sab))]"
        >
          <SheetHeader className="border-b border-border/60 px-4 pb-4 pt-4 text-left">
            <div className="flex items-start gap-3 pr-8">
              {device.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={device.thumbnailUrl}
                  alt=""
                  className="size-14 shrink-0 rounded-2xl object-cover ring-1 ring-black/10"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-lg">{device.name}</SheetTitle>
                <SheetDescription className="mt-0.5">
                  {HOME_DEVICE_CATEGORY_META[device.category].label}
                  {device.brand ? ` · ${device.brand}` : null}
                </SheetDescription>
                {critical ? (
                  <div className="mt-2 flex flex-wrap gap-1">
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

          <div className="space-y-5 px-4 py-4">
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

            {device.nameplateScannedAt ? (
              <p className="text-center text-[11px] text-muted-foreground">
                Nameplate scanned{" "}
                {new Date(device.nameplateScannedAt).toLocaleString()}
              </p>
            ) : (
              <p className="text-center text-[11px] text-muted-foreground">
                Scan the rating label on the back or bottom for exact specs.
              </p>
            )}

            <button
              type="button"
              onClick={() => setNameplateOpen(true)}
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full gap-2 bg-foreground text-background hover:bg-foreground/90",
              )}
            >
              <ScanLine className="size-4" aria-hidden />
              {device.nameplateScannedAt
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
    </>
  );
}
