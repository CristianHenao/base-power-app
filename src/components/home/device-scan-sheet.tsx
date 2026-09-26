"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, ScanLine, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  createScannedDevice,
  type DeviceScanResult,
  type HomeDevice,
} from "@/lib/home/devices";
import { cn } from "@/lib/utils";

type ScanPhase =
  | "starting"
  | "ready"
  | "identifying"
  | "locked"
  | "error";

type DeviceScanSheetProps = {
  open: boolean;
  onClose: () => void;
  onDeviceFound: (device: HomeDevice) => void;
  existingCount: number;
};

function captureFrame(video: HTMLVideoElement): {
  imageBase64: string;
  mediaType: "image/jpeg";
} | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;

  const maxWidth = 1024;
  const scale = Math.min(1, maxWidth / width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
  const imageBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return { imageBase64, mediaType: "image/jpeg" };
}

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
  const [scanMeta, setScanMeta] = useState<DeviceScanResult | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setPhase("starting");
    setErrorMessage(null);
    setPendingDevice(null);
    setScanMeta(null);

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
        setPhase("ready");
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

  if (!open) return null;

  async function handleIdentify() {
    const video = videoRef.current;
    if (!video || phase === "identifying") return;

    const frame = captureFrame(video);
    if (!frame) {
      setPhase("error");
      setErrorMessage("Couldn’t capture a frame. Try again.");
      return;
    }

    setPhase("identifying");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/home/scan-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(frame),
      });
      const payload = (await response.json()) as {
        device?: DeviceScanResult;
        error?: string;
      };

      if (!response.ok || !payload.device) {
        throw new Error(payload.error || "Scan failed.");
      }

      setScanMeta(payload.device);
      setPendingDevice(createScannedDevice(payload.device, existingCount));
      setPhase("locked");
    } catch (error) {
      setPhase("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Couldn’t identify that device. Try again.",
      );
    }
  }

  function handleAdd() {
    if (!pendingDevice) return;
    onDeviceFound(pendingDevice);
    onClose();
  }

  function handleRescan() {
    setPendingDevice(null);
    setScanMeta(null);
    setErrorMessage(null);
    setPhase("ready");
  }

  const bbox = scanMeta?.bbox;

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

            {bbox ? (
              <div
                aria-hidden
                className="absolute rounded-xl border-2 border-cyan-300/90 shadow-[0_0_16px_rgba(103,232,249,0.55)]"
                style={{
                  left: `${bbox[0] * 100}%`,
                  top: `${bbox[1] * 100}%`,
                  width: `${bbox[2] * 100}%`,
                  height: `${bbox[3] * 100}%`,
                }}
              />
            ) : null}

            {phase === "identifying" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                <Loader2
                  className="size-8 animate-spin text-amber-300"
                  aria-hidden
                />
              </div>
            ) : null}

            {phase === "locked" && pendingDevice ? (
              <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-black/70 px-3 py-2.5 backdrop-blur-md">
                <p className="flex items-center gap-1.5 text-xs font-medium text-amber-300">
                  <Check className="size-3.5" aria-hidden />
                  Identified · {Math.round(pendingDevice.confidence * 100)}%
                  confidence
                </p>
                <p className="mt-0.5 text-sm font-semibold text-white">
                  {pendingDevice.name}
                </p>
                <p className="text-[11px] text-white/70">
                  {[pendingDevice.brand, pendingDevice.model]
                    .filter(Boolean)
                    .join(" · ") || null}
                  {pendingDevice.watts > 0
                    ? `${pendingDevice.brand || pendingDevice.model ? " · " : ""}${pendingDevice.watts} W estimate`
                    : pendingDevice.kind === "panel"
                      ? `${pendingDevice.brand || pendingDevice.model ? " · " : ""}Service panel`
                      : pendingDevice.kind === "battery"
                        ? `${pendingDevice.brand || pendingDevice.model ? " · " : ""}Backup storage`
                        : null}
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
              onClick={handleRescan}
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full bg-white text-black hover:bg-white/90",
              )}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-sm font-medium text-white/75 transition-colors hover:text-white"
            >
              Close
            </button>
          </>
        ) : phase === "locked" ? (
          <>
            {scanMeta?.notes ? (
              <p className="text-center text-xs text-white/65">{scanMeta.notes}</p>
            ) : null}
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
          <>
            <p className="flex items-center justify-center gap-2 text-sm text-white/80">
              {phase === "identifying" ? (
                <>
                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                  Claude is identifying the device…
                </>
              ) : phase === "starting" ? (
                <>
                  <ScanLine className="size-4 shrink-0 animate-pulse" aria-hidden />
                  Starting camera…
                </>
              ) : (
                <>
                  <ScanLine className="size-4 shrink-0" aria-hidden />
                  Point at a device or your panel, then identify
                </>
              )}
            </p>
            <button
              type="button"
              disabled={phase !== "ready"}
              onClick={() => void handleIdentify()}
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full bg-amber-400 text-amber-950 hover:bg-amber-300 disabled:opacity-50",
              )}
            >
              Identify with Claude
            </button>
          </>
        )}
      </div>
    </div>
  );
}
