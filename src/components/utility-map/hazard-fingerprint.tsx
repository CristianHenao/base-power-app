"use client";

import { HazardIcon } from "@/components/utility-map/hazard-chip";
import { formatLayerValue } from "@/lib/utility-map/format";
import { HAZARDS, fingerprintRows, type HazardId } from "@/lib/utility-map/hazard-style";
import type { MapLayerMeta, Quality } from "@/lib/utility-map/types";

/** Every available hazard for one county or utility: rank bar in the hazard's color, value, top-fifth tag. */
export function HazardFingerprint({
  layers,
  ranks,
  values,
  quality,
}: {
  layers: MapLayerMeta[];
  ranks: Partial<Record<HazardId, number | null>>;
  values: Partial<Record<HazardId, number | null>>;
  quality: Partial<Record<HazardId, Quality>>;
}) {
  const available = new Set(layers.filter((l) => l.available).map((l) => l.id));
  const rows = fingerprintRows(
    Object.fromEntries(Object.entries(ranks).filter(([id]) => available.has(id as HazardId))) as typeof ranks,
  );
  if (rows.length === 0) return null;
  return (
    <div className="space-y-3">
      <p className="text-[16px] leading-[24px] font-semibold">Hazard profile</p>
      <ul className="space-y-2.5">
        {rows.map(({ hazard, rank, topFifth }) => {
          const style = HAZARDS[hazard];
          const meta = layers.find((l) => l.id === hazard)!;
          return (
            <li key={hazard} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-[13px] leading-[19px]">
                <span className="flex items-center gap-1.5 font-semibold">
                  <span className="flex size-5 items-center justify-center rounded-full text-white" style={{ backgroundColor: style.color }}>
                    <HazardIcon hazard={hazard} className="size-3.5" />
                  </span>
                  {style.label}
                  {topFifth ? (
                    <span className="rounded-full bg-[var(--bp-grey-5)] px-1.5 text-[11px] leading-[16px] font-semibold">Top fifth</span>
                  ) : null}
                </span>
                <span className="text-right text-muted-foreground">
                  {formatLayerValue(meta, values[hazard] ?? null, quality[hazard] ?? "missing")}
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-[var(--bp-grey-20)]"
                role="img"
                aria-label={`${style.label}: ${rank == null ? "no rank" : `higher than ${Math.round(rank * 100)}% of Texas counties`}`}
              >
                <div className="h-full rounded-full" style={{ width: `${Math.round((rank ?? 0) * 100)}%`, backgroundColor: style.color }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
