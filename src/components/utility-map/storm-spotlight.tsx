"use client";

import type { SpotlightStorm } from "@/lib/utility-map/hazard-style";

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const millions = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** Pick a labeled storm to see which counties it darkened (EAGLE-I, 2018 on). One storm at a time. */
export function StormList({
  storms,
  selected,
  countyName,
  onSelect,
}: {
  storms: SpotlightStorm[];
  selected: SpotlightStorm | null;
  countyName: (fips: string) => string;
  onSelect: (name: string) => void;
}) {
  if (storms.length === 0) {
    return <p className="text-[12px] leading-[18px] text-muted-foreground">Loading storms with outage records.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-[12px] leading-[18px] font-semibold text-muted-foreground">Storm</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Storm">
        {storms.map((storm) => (
          <button
            key={storm.name}
            type="button"
            role="radio"
            aria-checked={selected?.name === storm.name}
            onClick={() => onSelect(storm.name)}
            className="bp-pill !px-2.5 !py-1 !text-[13px]"
          >
            {storm.name.replace(" (ice storm)", "").replace(" (Dallas derecho)", "")} {storm.start.slice(0, 4)}
          </button>
        ))}
      </div>
      {selected ? (
        <div className="bp-info space-y-2 p-3 text-[12px] leading-[18px]">
          <p className="text-[14px] leading-[21px] font-semibold">{selected.name}</p>
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
          <p className="opacity-80">
            EAGLE-I county outage records; storm windows from NWS, NHC and TDEM. Harvey and Ike predate the records.
          </p>
        </div>
      ) : (
        <p className="text-[12px] leading-[18px] text-muted-foreground">
          Loading storms with outage records (2018 on).
        </p>
      )}
    </div>
  );
}
