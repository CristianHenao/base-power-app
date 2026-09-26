"use client";

import { FLOOD_ZONE_COLORS } from "@/components/utility-map/map-layers";

/** A five-step ramp with a label under each step, plus a title and optional note. */
export function SequentialLegend({
  title,
  colors,
  labels,
  note,
}: {
  title: string;
  colors: readonly string[];
  labels: readonly string[];
  note?: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[12px] leading-[18px] font-semibold text-muted-foreground">{title}</p>
      <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${colors.length}, minmax(0, 1fr))` }}>
        {colors.map((color, i) => (
          <li key={color} className="space-y-1">
            <span className="block h-3 rounded-sm ring-1 ring-black/10" style={{ backgroundColor: color }} aria-hidden />
            <span className="block text-[11px] leading-tight text-muted-foreground">{labels[i]}</span>
          </li>
        ))}
      </ol>
      {note ? <p className="text-[11px] leading-tight text-muted-foreground">{note}</p> : null}
    </div>
  );
}

/** FEMA flood-zone swatches, matching the map's fills and floodway hatch. */
export function FloodZoneLegend() {
  const hatch = "repeating-linear-gradient(135deg, rgba(255,255,255,0.8) 0 2px, transparent 2px 6px)";
  const rows = [
    { label: "Floodway", color: FLOOD_ZONE_COLORS.floodway, pattern: hatch },
    { label: "1% annual chance (100-year)", color: FLOOD_ZONE_COLORS["1pct"] },
    { label: "0.2% annual chance (500-year)", color: FLOOD_ZONE_COLORS["0.2pct"] },
  ];
  return (
    <div className="space-y-2">
      <p className="text-[12px] leading-[18px] font-semibold text-muted-foreground">FEMA flood zones (effective maps)</p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-[12px] leading-[18px]">
            <span
              className="size-3.5 rounded-sm ring-1 ring-black/10"
              style={{ backgroundColor: row.color, backgroundImage: row.pattern }}
              aria-hidden
            />
            {row.label}
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-tight text-muted-foreground">
        Mapped for Harris, Galveston, Travis, Collin and Nueces counties.
      </p>
    </div>
  );
}

/** 3×3 square: rows = first hazard (up = higher), columns = second hazard (right = higher). */
export function BivariateLegend({
  colors,
  first,
  second,
}: {
  colors: readonly string[];
  first: string;
  second: string;
}) {
  const rows = [2, 1, 0];
  return (
    <div className="space-y-2">
      <p className="text-[12px] leading-[18px] font-semibold text-muted-foreground">
        {first} × {second}, Texas thirds
      </p>
      <div className="flex items-end gap-2">
        <span className="text-[11px] leading-tight text-muted-foreground [writing-mode:vertical-rl] rotate-180">
          {first} higher →
        </span>
        <div>
          <div className="grid grid-cols-3 gap-0.5">
            {rows.flatMap((row) =>
              [0, 1, 2].map((col) => (
                <span
                  key={`${row}-${col}`}
                  className="block size-5 ring-1 ring-black/5"
                  style={{ backgroundColor: colors[row * 3 + col] }}
                  aria-hidden
                />
              )),
            )}
          </div>
          <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{second} higher →</p>
        </div>
      </div>
      <p className="text-[11px] leading-tight text-muted-foreground">
        Dark corner: both in the top third of Texas counties.
      </p>
    </div>
  );
}
