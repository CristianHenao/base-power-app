"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ScanLine, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { PanelDirectoryResult } from "@/lib/home/devices";
import { cn } from "@/lib/utils";

type ScanPhase = "starting" | "ready" | "reading" | "error";

type PanelScanSheetProps = {
  open: boolean;
  onClose: () => void;
  onPanelRead: (result: PanelDirectoryResult) => void;
};

function captureFrame(video: HTMLVideoElement): {
  imageBase64: string;
  mediaType: "image/jpeg";
} | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;

  const maxWidth = 1280;
  const scale = Math.min(1, maxWidth / width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  const imageBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return { imageBase64, mediaType: "image/jpeg" };
}

export function PanelScanSheet({
  open,
  onClose,
  onPanelRead,
}: PanelScanSheetProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<ScanPhase>("starting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setPhase("starting");
    setErrorMessage(null);

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
          "Camera access is needed to scan the breaker panel. Allow camera permission and try again.",
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

  async function handleRead() {
    const video = videoRef.current;
    if (!video || phase === "reading") return;

    const frame = captureFrame(video);
    if (!frame) {
      setPhase("error");
      setErrorMessage("Couldn’t capture a frame. Try again.");
      return;
    }

    setPhase("reading");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/home/scan-panel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(frame),
      });
      const payload = (await response.json()) as {
        panel?: PanelDirectoryResult;
        error?: string;
      };

      if (!response.ok || !payload.panel) {
        throw new Error(payload.error || "Panel scan failed.");
      }

      onPanelRead(payload.panel);
      onClose();
    } catch (error) {
      setPhase("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Couldn’t read those breakers. Try closer, brighter light on the labels.",
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Scan breaker panel"
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
          <p className="text-sm font-medium">Scan breaker labels</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/25"
            aria-label="Close panel scanner"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
          <div className="relative aspect-[3/4] w-full max-w-sm rounded-2xl border-2 border-dashed border-white/70">
            <span className="absolute -left-0.5 -top-0.5 size-5 border-l-[3px] border-t-[3px] border-amber-300" />
            <span className="absolute -right-0.5 -top-0.5 size-5 border-r-[3px] border-t-[3px] border-amber-300" />
            <span className="absolute -bottom-0.5 -left-0.5 size-5 border-b-[3px] border-l-[3px] border-amber-300" />
            <span className="absolute -bottom-0.5 -right-0.5 size-5 border-b-[3px] border-r-[3px] border-amber-300" />
            {phase === "reading" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Loader2 className="size-8 animate-spin text-amber-300" />
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
              onClick={() => {
                setErrorMessage(null);
                setPhase("ready");
              }}
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full bg-white text-black hover:bg-white/90",
              )}
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <p className="flex items-center justify-center gap-2 text-center text-sm text-white/80">
              {phase === "reading" ? (
                <>
                  <Loader2 className="size-4 shrink-0 animate-spin" />
                  Reading breakers with Claude…
                </>
              ) : phase === "starting" ? (
                <>
                  <ScanLine className="size-4 shrink-0 animate-pulse" />
                  Starting camera…
                </>
              ) : (
                <>
                  <ScanLine className="size-4 shrink-0" />
                  Fill the frame with the open panel and handwritten labels
                </>
              )}
            </p>
            <button
              type="button"
              disabled={phase !== "ready"}
              onClick={() => void handleRead()}
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full bg-amber-400 text-amber-950 hover:bg-amber-300 disabled:opacity-50",
              )}
            >
              Read breakers
            </button>
          </>
        )}
      </div>
    </div>
  );
}
