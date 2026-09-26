"use client";

import { Popover } from "@base-ui/react/popover";
import { Info } from "lucide-react";
import { useCallback, useRef } from "react";
import { formatPeriod } from "@/lib/utility-map/format";
import type { MapLayerMeta, SourceRef } from "@/lib/utility-map/types";
import { cn } from "@/lib/utils";

/**
 * The ⓘ next to a layer: unit, source, period, method and how many counties have data.
 * The popup renders in a portal on the themed page root, so a scrolling panel never clips it,
 * and it flips or shifts to stay on screen.
 */
export function EvidencePopover({
  meta,
  sources,
  className,
}: {
  meta: MapLayerMeta;
  sources: SourceRef[];
  className?: string;
}) {
  const named = meta.source_ids.map((id) => sources.find((s) => s.id === id) ?? { id, name: id, url: "" });
  const { ok, missing, not_applicable: notApplicable } = meta.coverage;
  // The themed page root, found once from the trigger; a stable ref avoids re-rendering on every update.
  const container = useRef<HTMLElement | null>(null);
  const findRoot = useCallback((el: HTMLButtonElement | null) => {
    if (el) container.current = el.closest<HTMLElement>(".bp-theme");
  }, []);
  return (
    <Popover.Root>
      <Popover.Trigger
        ref={findRoot}
        className={cn(
          "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-[var(--bp-grey-5)] hover:text-foreground data-[popup-open]:bg-[var(--bp-grey-5)]",
          className,
        )}
        aria-label={`About ${meta.label}`}
      >
        <Info className="size-4" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={12} className="z-50">
          <Popover.Popup className="max-h-[min(420px,var(--available-height))] w-72 max-w-[calc(100vw-24px)] space-y-2 overflow-y-auto rounded-2xl border bg-white p-4 text-left text-[12px] leading-[18px] font-medium shadow-[var(--bp-shadow-media)] outline-none">
        <Popover.Title className="text-[14px] leading-[21px] font-semibold">{meta.label}</Popover.Title>
        {meta.available ? (
          <>
            <p>{meta.unit}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Source</dt>
              <dd>
                {named.map((s, i) => (
                  <span key={s.id}>
                    {i > 0 ? ", " : ""}
                    {s.url ? (
                      <a className="underline" href={s.url} target="_blank" rel="noreferrer">
                        {s.name}
                      </a>
                    ) : (
                      s.name
                    )}
                  </span>
                ))}
              </dd>
              <dt className="text-muted-foreground">Period</dt>
              <dd>{formatPeriod(meta)}</dd>
              <dt className="text-muted-foreground">Counties</dt>
              <dd>
                {ok} with data
                {missing ? ` · ${missing} missing` : ""}
                {notApplicable ? ` · ${notApplicable} not applicable` : ""}
              </dd>
            </dl>
            {meta.method ? <p className="text-muted-foreground">{meta.method}</p> : null}
            {meta.outage_link?.rho != null && meta.id !== "outages" ? (
              <p className={meta.outage_link.weak ? "font-semibold text-[var(--bp-red-80)]" : ""}>
                Tracks long outages across {meta.outage_link.n} counties: ρ = {meta.outage_link.rho.toFixed(2)}
                {meta.outage_link.weak ? " (weak link; don't read it as a cause of outages)" : ""}
              </p>
            ) : null}
            <p className="text-muted-foreground">Estimate. Ranked against Texas counties.</p>
          </>
        ) : (
          <p className="text-muted-foreground">{meta.unavailable_reason ?? "Not available yet."}</p>
        )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
