"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ScanLine, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  SCAN_DEVICE_CATALOG,
  createScannedDevice,
  type HomeDevice,
} from "@/lib/home/devices";
import { cn } from "@/lib/utils";

type ScanPhase = "starting" | "scanning" | "locked" | "error";

type DeviceScanSheetProps = {
  open: boolean;
  onClose: () => void;
  onDeviceFound: (device: HomeDevice) => void;
  existingCount: number;
};

export function DeviceScanSheet({
  open,
  onClose,
  onDeviceFound,
  existingCount,
}: DeviceScanSheetProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<ScanPhase>("starting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingDevice, setPendingDevice] = useState<HomeDevice | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setPhase("starting");
    setErrorMessage(null);
    setPendingDevice(null);

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        setPhase("scanning");
      } catch {
        if (cancelled) return;
        setPhase("error");
        setErrorMessage(
          "Camera access is needed to scan devices. Allow camera permission and try again.",
        );
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open || phase !== "scanning") return;

    const timer = window.setTimeout(() => {
      const template =
        SCAN_DEVICE_CATALOG[existingCount % SCAN_DEVICE_CATALOG.length]!;
      setPendingDevice(createScannedDevice(template, existingCount));
      setPhase("locked");
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [open, phase, existingCount]);

  if (!open) return null;

  function handleAdd() {
    if (!pendingDevice) return;
    onDeviceFound(pendingDevice);
    onClose();
  }

  function handleRescan() {
    setPendingDevice(null);
    setPhase("scanning");
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Scan a device"
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 size-full object-cover"
        />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/70"
        />

        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-[max(0.75rem,var(--sat))]">
          <p className="text-sm font-medium">Scan a device</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/25"
            aria-label="Close scanner"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
          <div
            className={cn(
              "relative aspect-[3/4] w-full max-w-xs rounded-3xl border-2 transition-all duration-500",
              phase === "locked"
                ? "scale-100 border-amber-400 shadow-[0_0_0_1px_rgba(251,191,36,0.5),0_0_40px_rgba(251,191,36,0.35)]"
                : "scale-[0.98] border-white/45",
            )}
          >
            <span className="absolute -left-0.5 -top-0.5 size-6 rounded-tl-2xl border-l-[3px] border-t-[3px] border-white" />
            <span className="absolute -right-0.5 -top-0.5 size-6 rounded-tr-2xl border-r-[3px] border-t-[3px] border-white" />
            <span className="absolute -bottom-0.5 -left-0.5 size-6 rounded-bl-2xl border-b-[3px] border-l-[3px] border-white" />
            <span className="absolute -bottom-0.5 -right-0.5 size-6 rounded-br-2xl border-b-[3px] border-r-[3px] border-white" />

            {phase === "scanning" ? (
              <div className="absolute inset-x-3 top-1/4 h-0.5 animate-pulse bg-cyan-300/90 shadow-[0_0_12px_rgba(103,232,249,0.9)]" />
            ) : null}

            {phase === "locked" && pendingDevice ? (
              <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-black/70 px-3 py-2.5 backdrop-blur-md">
                <p className="flex items-center gap-1.5 text-xs font-medium text-amber-300">
                  <Check className="size-3.5" aria-hidden />
                  Device outline locked
                </p>
                <p className="mt-0.5 text-sm font-semibold text-white">
                  {pendingDevice.name}
                </p>
                <p className="text-[11px] text-white/70">
                  {pendingDevice.watts > 0
                    ? `${pendingDevice.watts} W estimate`
                    : pendingDevice.kind === "panel"
                      ? "Service panel"
                      : "Backup storage"}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative z-10 space-y-3 px-4 pb-[max(1.25rem,var(--sab))] pt-4">
        {phase === "error" ? (
          <>
            <p className="text-center text-sm text-white/80">{errorMessage}</p>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full bg-white text-black hover:bg-white/90",
              )}
            >
              Close
            </button>
          </>
        ) : phase === "locked" ? (
          <>
            <button
              type="button"
              onClick={handleAdd}
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full bg-amber-400 text-amber-950 hover:bg-amber-300",
              )}
            >
              Add to my home
            </button>
            <button
              type="button"
              onClick={handleRescan}
              className="w-full py-2 text-sm font-medium text-white/75 transition-colors hover:text-white"
            >
              Scan again
            </button>
          </>
        ) : (
          <p className="flex items-center justify-center gap-2 text-sm text-white/80">
            <ScanLine className="size-4 shrink-0 animate-pulse" aria-hidden />
            {phase === "starting"
              ? "Starting camera…"
              : "Point at a device or your panel"}
          </p>
        )}
      </div>
    </div>
  );
}
