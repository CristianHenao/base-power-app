"use client";

import { useMemo, useState } from "react";
import { Fuel, Zap } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { isPriorityDevice, type HomeDevice } from "@/lib/home/devices";
import { CORE_GENERATOR_CHARGE_KW } from "@/lib/home/generator-backup";
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
  const [useGenerator, setUseGenerator] = useState(true);

  const loads = useMemo(() => outageLoadDevices(devices), [devices]);
  const generator = useMemo(() => bestOutageGenerator(devices), [devices]);
  const availableChargeKw = generator ? generatorChargeKw(generator) : 0;
  const chargeKw = useGenerator ? availableChargeKw : 0;

  const rows = useMemo(() => {
    return [...loads]
      .sort((a, b) => {
        const priority = Number(isPriorityDevice(b)) - Number(isPriorityDevice(a));
        if (priority !== 0) return priority;
        return b.watts - a.watts;
      })
      .map((device) => deviceOutageRow(device, chargeKw));
  }, [loads, chargeKw]);

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
          <SheetDescription className="mt-0.5">
            How long one Core ({KWH_PER_CORE} kWh) can run what’s in your home.
            Estimate.
          </SheetDescription>
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

          {generator ? (
            <button
              type="button"
              onClick={() => setUseGenerator((on) => !on)}
              className={cn(
                "flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left",
                useGenerator
                  ? "border-black/10 bg-white"
                  : "border-black/8 bg-black/[0.02]",
              )}
              aria-pressed={useGenerator}
            >
              <Fuel className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">
                  {useGenerator ? "Using" : "Not using"} {generator.name}
                </span>
                <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                  {availableChargeKw > 0
                    ? `Charges the Core at about ${availableChargeKw} kW through the ${CORE_GENERATOR_CHARGE_KW} kW port.`
                    : "Rated output is unknown, so this estimate ignores generator charging. Scan the label."}{" "}
                  Tap to {useGenerator ? "leave it out" : "include it"}. Estimate.
                </span>
              </span>
            </button>
          ) : (
            <p className="text-[12px] leading-snug text-muted-foreground">
              No generator on this home. Runtimes are Core storage only.
            </p>
          )}

          {loads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Scan appliances to see how long they can run.
            </p>
          ) : (
            <>
              <div className="space-y-2 rounded-2xl bg-black/[0.03] px-3.5 py-3">
                <div className="flex items-start gap-3">
                  <Zap
                    className="mt-0.5 size-5 shrink-0 fill-[#b2dd79] text-[#b2dd79]"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-sm font-medium text-foreground">
                      Everything at once
                    </p>
                    <p className="text-[12px] leading-snug text-muted-foreground">
                      {combined.loadsCounted === 0
                        ? "No devices have a known draw yet."
                        : combined.overLimit
                          ? `About ${combined.loadKw.toFixed(1)} kW together, more than one Core can carry (20 kW). Estimate.`
                          : `About ${combined.loadKw.toFixed(1)} kW together on one full Core. Estimate.`}
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

              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">
                  Each device on its own
                </p>
                <ul className="space-y-2">
                  {rows.map((row) => (
                    <li
                      key={row.id}
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
