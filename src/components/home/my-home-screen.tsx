"use client";

import Image from "next/image";
import { useState } from "react";
import {
  BatteryCharging,
  CircuitBoard,
  Cross,
  Fuel,
  MoreVertical,
  PlugZap,
  ScanLine,
  Snowflake,
  Star,
  Trash2,
  Zap,
} from "lucide-react";
import { DeviceDetailSheet } from "@/components/home/device-detail-sheet";
import { DeviceScanSheet } from "@/components/home/device-scan-sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  canTogglePriority,
  groupDevicesByCategory,
  HOME_DEVICE_CATEGORY_META,
  isPriorityDevice,
  type HomeDevice,
  type HomeDeviceKind,
} from "@/lib/home/devices";
import {
  formatGeneratorExtensionDetail,
  generatorExtensionForDevice,
} from "@/lib/home/generator-backup";
import { cn } from "@/lib/utils";

type MyHomeScreenProps = {
  devices: HomeDevice[];
  onAddDevice: (device: HomeDevice) => void;
  onUpdateDevice: (device: HomeDevice) => void;
  onDeleteDevice: (device: HomeDevice) => void;
  scanOpen: boolean;
  onScanOpenChange: (open: boolean) => void;
  className?: string;
};

function kindIcon(kind: HomeDeviceKind) {
  if (kind === "panel") return CircuitBoard;
  if (kind === "battery") return BatteryCharging;
  if (kind === "generator") return Fuel;
  if (kind === "medical") return Cross;
  return PlugZap;
}

export function MyHomeScreen({
  devices,
  onAddDevice,
  onUpdateDevice,
  onDeleteDevice,
  scanOpen,
  onScanOpenChange,
  className,
}: MyHomeScreenProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HomeDevice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const empty = devices.length === 0;
  const grouped = groupDevicesByCategory(devices);
  const criticalCount = devices.filter(
    (device) => device.isMedical || device.needsRefrigeration,
  ).length;
  const generators = devices.filter((device) => device.kind === "generator");
  const bestGeneratorExt = generators
    .map((device) => generatorExtensionForDevice(device))
    .filter((ext): ext is NonNullable<typeof ext> => ext != null)
    .sort((a, b) => b.extensionHours - a.extensionHours)[0];
  const selectedDevice =
    devices.find((device) => device.id === selectedId) ?? null;

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await Promise.resolve(onDeleteDevice(pendingDelete));
      if (selectedId === pendingDelete.id) setSelectedId(null);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

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
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                My home
              </h1>
              {bestGeneratorExt ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                  <Fuel className="size-3" aria-hidden />
                  Core +{bestGeneratorExt.extensionHours} h est.
                </span>
              ) : null}
              {criticalCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-800">
                  <Cross className="size-3" aria-hidden />
                  {criticalCount} critical for health
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              Devices by room — including medical gear, refrigerated medication,
              and generators that can recharge a Base Core.
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
                Scan appliances, your panel, a generator, and critical medical
                devices or medication that needs refrigeration.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              {grouped.map((group) => (
                <section key={group.category} className="space-y-2">
                  <h2 className="text-sm font-semibold tracking-wide text-foreground">
                    {group.label}
                  </h2>
                  {group.category === "generator" && bestGeneratorExt ? (
                    <div className="flex items-start gap-3 pb-1">
                      <div
                        className="flex shrink-0 items-center -space-x-2.5 pt-0.5"
                        aria-hidden
                      >
                        <Zap className="size-6 fill-[#b2dd79] text-[#b2dd79]" />
                        <Zap className="relative size-6 fill-[#f7c33c] text-[#f7c33c]" />
                      </div>
                      <p className="min-w-0 text-sm leading-snug text-foreground">
                        {formatGeneratorExtensionDetail(bestGeneratorExt)}
                      </p>
                    </div>
                  ) : null}
                  <ul className="space-y-2">
                    {group.devices.map((device) => {
                      const Icon = kindIcon(device.kind);
                      const critical =
                        device.isMedical || device.needsRefrigeration;
                      const priority = isPriorityDevice(device);
                      const canToggle = canTogglePriority(device);
                      return (
                        <li
                          key={device.id}
                          className={cn(
                            "flex items-stretch overflow-hidden rounded-2xl border bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
                            critical
                              ? "border-rose-200 bg-rose-50/60"
                              : "border-black/8",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedId(device.id)}
                            className={cn(
                              "flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3 text-left transition-colors",
                              !critical && "hover:bg-black/[0.02]",
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
                                {
                                  HOME_DEVICE_CATEGORY_META[device.category]
                                    .label
                                }
                                {device.brand ? ` · ${device.brand}` : null}
                                {device.kind === "panel" &&
                                device.breakers.length > 0
                                  ? ` · ${device.breakers.length} circuits`
                                  : device.watts > 0
                                    ? ` · ${device.watts} W${device.wattsExact ? "" : " est."}`
                                    : null}
                              </p>
                              {critical || (priority && !critical) ? (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {device.isMedical ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-800">
                                      <Cross
                                        className="size-2.5"
                                        aria-hidden
                                      />
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
                                  {priority && !critical ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                                      <Star
                                        className="size-2.5 fill-current"
                                        aria-hidden
                                      />
                                      Priority
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </button>

                          <div className="flex items-center pr-1.5">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Options for ${device.name}`}
                                  />
                                }
                              >
                                <MoreVertical className="size-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" sideOffset={4}>
                                {canToggle ? (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      onUpdateDevice({
                                        ...device,
                                        isPriority: !priority,
                                      })
                                    }
                                  >
                                    <Star
                                      className={cn(
                                        "size-4",
                                        priority && "fill-current",
                                      )}
                                      aria-hidden
                                    />
                                    {priority
                                      ? "Remove from priority"
                                      : "Add to priority"}
                                  </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setPendingDelete(device)}
                                >
                                  <Trash2 className="size-4" aria-hidden />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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

      <DeviceDetailSheet
        device={selectedDevice}
        open={selectedId != null}
        onOpenChange={(next) => {
          if (!next) setSelectedId(null);
        }}
        onDeviceUpdate={onUpdateDevice}
      />

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete device?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `Remove “${pendingDelete.name}” from My home. This can’t be undone.`
                : "Remove this device from My home. This can’t be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
