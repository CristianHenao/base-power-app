"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Zap } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { drawWatts, isPriorityDevice, type HomeDevice } from "@/lib/home/devices";
import { breakerForDevice } from "@/lib/home/breaker-for-device";
import {
  OUTAGE_DURATIONS,
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

function usePowerLinks(layoutKey: string, open: boolean) {
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

    signatureRef.current = "";
    measure();
    const frame = requestAnimationFrame(measure);
    const timer = window.setTimeout(measure, 160);
    const root = rootRef.current;
    const source = sourceRef.current;
    const observer = new ResizeObserver(() => measure());
    if (root) {
      observer.observe(root);
      for (const item of root.querySelectorAll<HTMLElement>("[data-power-item]")) {
        observer.observe(item);
      }
    }
    if (source) observer.observe(source);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      media.removeEventListener("change", syncMotion);
      observer.disconnect();
    };
  }, [measure, open, layoutKey]);

  return { rootRef, sourceRef, geometry, reducedMotion };
}

function formatCombinedDraw(loadKw: number): string {
  const watts = Math.round(loadKw * 1000);
  if (watts < 1000) return `${watts} W`;
  const kw = Math.round(loadKw * 10) / 10;
  return `${kw} kW`;
}

function MiniSwitch({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        checked ? "bg-[#7CB342]" : "bg-black/15",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform",
          checked ? "left-4" : "left-0.5",
        )}
      />
    </button>
  );
}

function coreExtensionCopy(
  hoursWithItOff: number | null,
  hoursWithItOn: number | null,
): string | null {
  if (hoursWithItOn != null && !Number.isFinite(hoursWithItOn)) return null;
  if (hoursWithItOff != null && !Number.isFinite(hoursWithItOff)) {
    return "Core stays on.";
  }
  if (
    hoursWithItOff == null ||
    hoursWithItOn == null ||
    !Number.isFinite(hoursWithItOff) ||
    !Number.isFinite(hoursWithItOn)
  ) {
    return null;
  }
  const delta = Math.round(hoursWithItOff - hoursWithItOn);
  if (delta < 1) return null;
  return `Core lasts ${delta}\u00a0h longer.`;
}

function RuntimeCards({
  durationHours,
  coreHours,
  generatorHours,
  surface,
  generatorOn = true,
  onGeneratorChange,
}: {
  durationHours: number;
  coreHours: number | null;
  generatorHours?: number | null;
  surface: "white" | "muted";
  generatorOn?: boolean;
  onGeneratorChange?: (next: boolean) => void;
}) {
  const cards = [
    { key: "core", label: "Core", hours: coreHours, generator: false },
    ...(generatorHours !== undefined || onGeneratorChange
      ? [
          {
            key: "generator",
            label: "Core + generator",
            hours: generatorHours ?? null,
            generator: true,
          },
        ]
      : []),
  ];

  return (
    <div
      className={cn(
        "grid gap-2 pt-1",
        cards.length > 1 ? "grid-cols-2" : "grid-cols-1",
      )}
    >
      {cards.map((card) => {
        const generatorOff = card.generator && !generatorOn;
        const unknown = card.hours == null;
        const staysOn = coversOutage(card.hours, durationHours);
        const lengthLabel =
          OUTAGE_DURATIONS.find((item) => item.hours === durationHours)?.label ??
          `${durationHours} h`;
        const runtimeLabel = formatRuntimeHours(card.hours).replace(" ", "\u00a0");
        const headline = generatorOff
          ? "Off"
          : unknown
            ? "Unknown"
            : staysOn
              ? `On all ${lengthLabel.replace(" ", "\u00a0")}`
              : `Off after ${runtimeLabel}`;
        return (
          <div
            key={card.key}
            className={cn(
              "rounded-xl px-2.5 py-2",
              surface === "white" ? "bg-white" : "bg-black/[0.04]",
              generatorOff && "opacity-70",
            )}
          >
            <div className="flex items-center justify-between gap-1">
              <p className="text-[10px] font-medium text-muted-foreground">
                {card.label}
              </p>
              {card.generator && onGeneratorChange ? (
                <MiniSwitch
                  checked={generatorOn}
                  label="Generator charging the Core"
                  onCheckedChange={onGeneratorChange}
                />
              ) : null}
            </div>
            <p
              className={cn(
                "mt-0.5 text-sm font-medium leading-snug",
                generatorOff || unknown
                  ? "text-muted-foreground"
                  : staysOn
                    ? "text-foreground"
                    : "text-amber-900",
              )}
            >
              {headline}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function OutageSimulationSheet({
  devices,
  open,
  onOpenChange,
}: OutageSimulationSheetProps) {
  const [durationHours, setDurationHours] = useState<OutageDurationHours>(12);
  const [offIds, setOffIds] = useState<Set<string>>(() => new Set());
  const [generatorOn, setGeneratorOn] = useState(true);

  const loads = useMemo(() => outageLoadDevices(devices), [devices]);
  const generator = useMemo(() => bestOutageGenerator(devices), [devices]);
  const chargeKw = generator ? generatorChargeKw(generator) : 0;
  const activeChargeKw = generatorOn ? chargeKw : 0;
  const activeLoads = useMemo(
    () => loads.filter((device) => !offIds.has(device.id)),
    [loads, offIds],
  );

  const rows = useMemo(() => {
    return [...loads]
      .sort((a, b) => {
        const priority = Number(isPriorityDevice(b)) - Number(isPriorityDevice(a));
        if (priority !== 0) return priority;
        return b.watts - a.watts;
      })
      .map((device) => deviceOutageRow(device, activeChargeKw));
  }, [loads, activeChargeKw]);
  const breakerById = useMemo(() => {
    const map = new Map<string, string>();
    for (const device of loads) {
      const breaker = breakerForDevice(device, devices);
      if (breaker) map.set(device.id, breaker.position);
    }
    return map;
  }, [loads, devices]);
  const powerLayoutKey = `${rows.length}|${generatorOn ? 1 : 0}|${[...offIds].sort().join(",")}`;
  const { rootRef, sourceRef, geometry, reducedMotion } = usePowerLinks(
    powerLayoutKey,
    open,
  );

  const combined = useMemo(
    () => combinedOutage(activeLoads, activeChargeKw),
    [activeLoads, activeChargeKw],
  );
  const idle =
    combined.loadsCounted === 0 &&
    loads.some((device) => drawWatts(device).watts > 0);
  const coreHours = idle ? Number.POSITIVE_INFINITY : combined.hoursOnCore;
  const extensionById = useMemo(() => {
    const map = new Map<string, string>();
    for (const device of loads) {
      if (!offIds.has(device.id)) continue;
      const withItOn = combinedOutage([...activeLoads, device], 0).hoursOnCore;
      const copy = coreExtensionCopy(coreHours, withItOn);
      if (copy) map.set(device.id, copy);
    }
    return map;
  }, [loads, offIds, activeLoads, coreHours]);

  const toggleDevice = (id: string, on: boolean) => {
    setOffIds((current) => {
      const next = new Set(current);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
              {OUTAGE_DURATIONS.map(({ hours, label }) => {
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
                    {label}
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
                      {idle
                        ? "Nothing is drawing power."
                        : combined.loadsCounted === 0
                          ? "No devices have a known draw yet."
                          : combined.overLimit
                            ? `Pulling about ${formatCombinedDraw(combined.loadKw)} at once, more than one Core can carry (20 kW). Estimate.`
                            : `Pulling about ${formatCombinedDraw(combined.loadKw)} at once. Estimate.`}
                    </p>
                    {(idle || combined.loadsCounted > 0) && !combined.overLimit ? (
                      <RuntimeCards
                        durationHours={durationHours}
                        coreHours={coreHours}
                        generatorHours={
                          chargeKw > 0
                            ? generatorOn
                              ? combined.hoursWithGenerator
                              : null
                            : undefined
                        }
                        generatorOn={generatorOn}
                        onGeneratorChange={chargeKw > 0 ? setGeneratorOn : undefined}
                        surface="white"
                      />
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
                      stroke={
                        offIds.has(link.id)
                          ? "rgba(0,0,0,0.08)"
                          : "rgba(0,0,0,0.14)"
                      }
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  ))}
                  {reducedMotion ? null : (
                    <>
                      {geometry.links.some((link) => !offIds.has(link.id)) ? (
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
                      ) : null}
                      {geometry.links.map((link, index) =>
                        offIds.has(link.id) ? null : (
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
                        ),
                      )}
                    </>
                  )}
                  {reducedMotion
                    ? null
                    : geometry.links.map((link, index) =>
                        offIds.has(link.id) ? null : (
                          <circle key={link.id} r="3.25" fill="#7CB342">
                            <animateMotion
                              dur="1.7s"
                              begin={`${index * 0.35}s`}
                              repeatCount="indefinite"
                              path={link.feed}
                              calcMode="linear"
                            />
                          </circle>
                        ),
                      )}
                  {geometry.links.map((link) => (
                    <circle
                      key={`${link.id}-end`}
                      cx={link.x - 2}
                      cy={link.y}
                      r="3"
                      fill={offIds.has(link.id) ? "rgba(0,0,0,0.2)" : "#7CB342"}
                    />
                  ))}
                </svg>
              ) : null}

              <ul className="relative z-10 mt-6 space-y-3 pl-8">
                {rows.map((row) => {
                  const on = !offIds.has(row.id);
                  return (
                  <li
                    key={row.id}
                    data-power-item={row.id}
                    className="rounded-2xl border border-black/8 bg-white px-3.5 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate text-sm font-medium",
                            on ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {row.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {row.watts > 0
                            ? `${row.watts} W${row.wattsExact ? "" : " est."}`
                            : "Draw unknown"}
                          {breakerById.get(row.id)
                            ? ` · On breaker ${breakerById.get(row.id)}`
                            : ""}
                        </p>
                      </div>
                      <MiniSwitch
                        checked={on}
                        label={`${row.name} drawing power`}
                        onCheckedChange={(next) => toggleDevice(row.id, next)}
                      />
                    </div>
                    <div className="mt-2">
                      {on ? (
                        row.overLimit ? (
                          <p className="text-[12px] text-amber-900">
                            More than one Core can carry at once.
                          </p>
                        ) : (
                          <RuntimeCards
                            durationHours={durationHours}
                            coreHours={row.hoursOnCore}
                            generatorHours={
                              activeChargeKw > 0
                                ? row.hoursWithGenerator
                                : undefined
                            }
                            surface="muted"
                          />
                        )
                      ) : (
                        <p className="text-[12px] leading-snug text-muted-foreground">
                          Off.
                          {extensionById.get(row.id) ? (
                            <span className="text-foreground">
                              {" "}
                              {extensionById.get(row.id)}
                            </span>
                          ) : (
                            " Left out of the total draw."
                          )}
                        </p>
                      )}
                    </div>
                  </li>
                  );
                })}
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
