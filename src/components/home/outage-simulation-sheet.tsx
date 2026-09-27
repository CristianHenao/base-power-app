"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Zap } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { isPriorityDevice, type HomeDevice } from "@/lib/home/devices";
import {
  OUTAGE_DURATION_HOURS,
  bestOutageGenerator,
  combinedOutage,
  coversOutage,
  deviceOutageRow,
  formatRuntimeHours,
  generatorChargeKw,
  outageLoadDevices,
  type OutageDurationHours,
} from "@/lib/home/outage-simulation";
import { KWH_PER_CORE } from "@/lib/report/core-runtime";
import { cn } from "@/lib/utils";

type OutageSimulationSheetProps = {
  devices: HomeDevice[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type PowerLink = {
  id: string;
  y: number;
  x: number;
  branch: string;
  feed: string;
};

type PowerGeometry = {
  width: number;
  height: number;
  trunk: string;
  links: PowerLink[];
};

function usePowerLinks(rowCount: number, open: boolean) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<PowerGeometry | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const signatureRef = useRef("");

  const measure = useCallback(() => {
    const root = rootRef.current;
    const source = sourceRef.current;
    if (!root || !source) return;

    const rootBox = root.getBoundingClientRect();
    const sourceBox = source.getBoundingClientRect();
    if (sourceBox.height < 1 || rootBox.width < 1) return;

    const items = [...root.querySelectorAll<HTMLElement>("[data-power-item]")];
    if (items.length === 0) return;

    const spineX = sourceBox.left - rootBox.left + 10;
    const sourceY = sourceBox.bottom - rootBox.top;
    const links: PowerLink[] = items.map((item) => {
      const box = item.getBoundingClientRect();
      const y = box.top + box.height / 2 - rootBox.top;
      const x = box.left - rootBox.left;
      const id = item.dataset.powerItem ?? `${y}`;
      return {
        id,
        y,
        x,
        branch: `M ${spineX} ${y} L ${x} ${y}`,
        feed: `M ${spineX} ${sourceY} L ${spineX} ${y} L ${x - 2} ${y}`,
      };
    });

    const endY = Math.max(...links.map((link) => link.y));
    const trunk = `M ${spineX} ${sourceY} L ${spineX} ${endY}`;
    const signature = `${trunk}|${links.map((link) => link.branch).join(";")}`;
    if (signatureRef.current === signature) return;
    signatureRef.current = signature;

    setGeometry({
      width: rootBox.width,
      height: rootBox.height,
      trunk,
      links,
    });
  }, []);

  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(media.matches);
    syncMotion();
    media.addEventListener("change", syncMotion);

    if (!open) {
      signatureRef.current = "";
      return () => media.removeEventListener("change", syncMotion);
    }

    measure();
    const frame = requestAnimationFrame(measure);
    const timer = window.setTimeout(measure, 160);
    const root = rootRef.current;
    const source = sourceRef.current;
    const observer = new ResizeObserver(() => measure());
    if (root) observer.observe(root);
    if (source) observer.observe(source);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      media.removeEventListener("change", syncMotion);
      observer.disconnect();
    };
  }, [measure, open, rowCount]);

  return { rootRef, sourceRef, geometry, reducedMotion };
}

function formatCombinedDraw(loadKw: number): string {
  const watts = Math.round(loadKw * 1000);
  if (watts < 1000) return `${watts} W`;
  const kw = Math.round(loadKw * 10) / 10;
  return `${kw} kW`;
}

function RuntimeLine({
  label,
  hours,
  durationHours,
}: {
  label: string;
  hours: number | null;
  durationHours: number;
}) {
  const covers = coversOutage(hours, durationHours);
  const unknown = hours == null;
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-right font-medium",
          unknown
            ? "text-muted-foreground"
            : covers
              ? "text-foreground"
              : "text-amber-900",
        )}
      >
        {formatRuntimeHours(hours)}
        {unknown ? null : covers ? ` · covers ${durationHours} h` : ` · short of ${durationHours} h`}
      </span>
    </div>
  );
}

export function OutageSimulationSheet({
  devices,
  open,
  onOpenChange,
}: OutageSimulationSheetProps) {
  const [durationHours, setDurationHours] = useState<OutageDurationHours>(12);

  const loads = useMemo(() => outageLoadDevices(devices), [devices]);
  const generator = useMemo(() => bestOutageGenerator(devices), [devices]);
  const chargeKw = generator ? generatorChargeKw(generator) : 0;

  const rows = useMemo(() => {
    return [...loads]
      .sort((a, b) => {
        const priority = Number(isPriorityDevice(b)) - Number(isPriorityDevice(a));
        if (priority !== 0) return priority;
        return b.watts - a.watts;
      })
      .map((device) => deviceOutageRow(device, chargeKw));
  }, [loads, chargeKw]);
  const { rootRef, sourceRef, geometry, reducedMotion } = usePowerLinks(
    rows.length,
    open,
  );

  const combined = useMemo(
    () => combinedOutage(loads, chargeKw),
    [loads, chargeKw],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[min(88vh,40rem)] flex-col gap-0 overflow-hidden rounded-t-3xl pb-[max(1rem,var(--sab))]"
      >
        <SheetHeader className="shrink-0 border-b border-border/60 px-4 pb-4 pt-4 text-left">
          <SheetTitle className="pr-8 text-lg">Simulate outage</SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pt-4 pb-[calc(6.5rem+var(--sab))]">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">
              Outage duration
            </p>
            <div className="flex flex-wrap gap-2">
              {OUTAGE_DURATION_HOURS.map((hours) => {
                const selected = hours === durationHours;
                return (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => setDurationHours(hours)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                      selected
                        ? "bg-foreground text-background"
                        : "bg-black/[0.05] text-foreground hover:bg-black/[0.08]",
                    )}
                    aria-pressed={selected}
                  >
                    {hours} h
                  </button>
                );
              })}
            </div>
          </div>

          {loads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Scan appliances to see how long they can run.
            </p>
          ) : (
            <>
            <div ref={rootRef} className="relative">
              <div
                ref={sourceRef}
                className="relative z-10 space-y-2 rounded-2xl bg-black/[0.03] px-3.5 py-3"
              >
                <div className="flex items-start gap-3">
                  <Zap
                    className="mt-0.5 size-5 shrink-0 fill-[#b2dd79] text-[#b2dd79]"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-sm font-medium text-foreground">Total draw</p>
                    <p className="text-[12px] leading-snug text-muted-foreground">
                      {combined.loadsCounted === 0
                        ? "No devices have a known draw yet."
                        : combined.overLimit
                          ? `Pulling about ${formatCombinedDraw(combined.loadKw)} at once, more than one Core can carry (20 kW). Estimate.`
                          : `Pulling about ${formatCombinedDraw(combined.loadKw)} at once. Estimate.`}
                    </p>
                    {combined.loadsCounted > 0 && !combined.overLimit ? (
                      <div className="space-y-1 pt-1">
                        <RuntimeLine
                          label="Core"
                          hours={combined.hoursOnCore}
                          durationHours={durationHours}
                        />
                        {chargeKw > 0 ? (
                          <RuntimeLine
                            label="Core + generator"
                            hours={combined.hoursWithGenerator}
                            durationHours={durationHours}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {geometry ? (
                <svg
                  className="pointer-events-none absolute top-0 left-0 z-20 overflow-visible"
                  width={geometry.width}
                  height={geometry.height}
                  aria-hidden
                >
                  <path
                    d={geometry.trunk}
                    fill="none"
                    stroke="rgba(0,0,0,0.14)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  {geometry.links.map((link) => (
                    <path
                      key={link.id}
                      d={link.branch}
                      fill="none"
                      stroke="rgba(0,0,0,0.14)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  ))}
                  {reducedMotion ? null : (
                    <>
                      <path
                        d={geometry.trunk}
                        fill="none"
                        stroke="#7CB342"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeDasharray="5 11"
                      >
                        <animate
                          attributeName="stroke-dashoffset"
                          from="0"
                          to="-32"
                          dur="0.9s"
                          repeatCount="indefinite"
                        />
                      </path>
                      {geometry.links.map((link, index) => (
                        <path
                          key={`${link.id}-flow`}
                          d={link.branch}
                          fill="none"
                          stroke="#7CB342"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeDasharray="5 11"
                        >
                          <animate
                            attributeName="stroke-dashoffset"
                            from="0"
                            to="-32"
                            dur="0.9s"
                            begin={`${index * 0.15}s`}
                            repeatCount="indefinite"
                          />
                        </path>
                      ))}
                    </>
                  )}
                  {reducedMotion
                    ? null
                    : geometry.links.map((link, index) => (
                        <circle key={link.id} r="3.25" fill="#7CB342">
                          <animateMotion
                            dur="1.7s"
                            begin={`${index * 0.35}s`}
                            repeatCount="indefinite"
                            path={link.feed}
                            calcMode="linear"
                          />
                        </circle>
                      ))}
                  {geometry.links.map((link) => (
                    <circle
                      key={`${link.id}-end`}
                      cx={link.x - 2}
                      cy={link.y}
                      r="3"
                      fill="#7CB342"
                    />
                  ))}
                </svg>
              ) : null}

              <ul className="relative z-10 mt-6 space-y-3 pl-8">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    data-power-item={row.id}
                    className="rounded-2xl border border-black/8 bg-white px-3.5 py-3"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium text-foreground">
                        {row.name}
                      </p>
                      <p className="shrink-0 text-[11px] text-muted-foreground">
                        {row.watts > 0
                          ? `${row.watts} W${row.wattsExact ? "" : " est."}`
                          : "Draw unknown"}
                      </p>
                    </div>
                    <div className="mt-2 space-y-1">
                      {row.overLimit ? (
                        <p className="text-[12px] text-amber-900">
                          More than one Core can carry at once.
                        </p>
                      ) : (
                        <>
                          <RuntimeLine
                            label="Core"
                            hours={row.hoursOnCore}
                            durationHours={durationHours}
                          />
                          {chargeKw > 0 ? (
                            <RuntimeLine
                              label="Core + generator"
                              hours={row.hoursWithGenerator}
                              durationHours={durationHours}
                            />
                          ) : null}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            </>
          )}

          <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
            Assumes one full Core ({KWH_PER_CORE} kWh). Nameplate watts are a
            peak, so real runtime is often longer. Estimate.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
