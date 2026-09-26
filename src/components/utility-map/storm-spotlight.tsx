"use client";

import { X } from "lucide-react";
import type { SpotlightStorm } from "@/lib/utility-map/hazard-style";

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const millions = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** Pick a labeled storm to see which counties it darkened (EAGLE-I, 2018 on). */
export function StormSpotlight({
  storms,
  selected,
  countyName,
  onSelect,
}: {
  storms: SpotlightStorm[];
  selected: SpotlightStorm | null;
  countyName: (fips: string) => string;
  onSelect: (name: string | null) => void;
}) {
  if (storms.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-[12px] leading-[18px] font-semibold text-muted-foreground">Storm spotlight</p>
      <div className="flex flex-wrap gap-2">
        {storms.map((storm) => (
          <button
            key={storm.name}
            type="button"
            aria-pressed={selected?.name === storm.name}
            onClick={() => onSelect(selected?.name === storm.name ? null : storm.name)}
            className="bp-pill !px-2.5 !py-1 !text-[13px]"
          >
            {storm.name.replace(" (ice storm)", "").replace(" (Dallas derecho)", "")} {storm.start.slice(0, 4)}
          </button>
        ))}
      </div>
      {selected ? (
        <div className="bp-info space-y-2 p-3 text-[12px] leading-[18px]">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] leading-[21px] font-semibold">{selected.name}</p>
            <button type="button" onClick={() => onSelect(null)} aria-label="Clear storm" className="rounded-full p-0.5 hover:bg-white/60">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <p>
            {selected.counties.length} counties with outages,{" "}
            {millions.format(selected.counties.reduce((sum, c) => sum + c.customer_hours, 0) / 1e6)}M customer-hours in the
            dark ({selected.start} to {selected.end}).
          </p>
          <ol className="space-y-0.5">
            {selected.counties.slice(0, 6).map((c) => (
              <li key={c.fips} className="flex justify-between gap-2 tabular-nums">
                <span className="font-semibold">{countyName(c.fips)}</span>
                <span>
                  {whole.format(c.peak_out)} out at peak ({whole.format(c.peak_out_pct)}%)
                </span>
              </li>
            ))}
          </ol>
          <p className="opacity-80">EAGLE-I county outage records; storm windows from NWS, NHC and TDEM.</p>
        </div>
      ) : (
        <p className="text-[12px] leading-[18px] text-muted-foreground">
          Storms with outage records (2018 on). Harvey and Ike predate them.
        </p>
      )}
    </div>
  );
}
