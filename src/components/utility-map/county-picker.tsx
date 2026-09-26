"use client";

import { ChevronRight } from "lucide-react";
import type { PickerOption } from "@/lib/utility-map/selection";

const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });

/** Asks which utility the rep means when a county is served by several. */
export function CountyPicker({
  countyName,
  options,
  onPick,
  onCancel,
}: {
  countyName: string;
  options: PickerOption[];
  onPick: (utilityId: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-[20px] leading-[27px]">{countyName} County</h2>
        <p className="text-[14px] leading-[21px] text-muted-foreground">
          Served by {options.length} utilities. Pick one to open it. Shares are estimated from EIA-861
          customer counts.
        </p>
      </div>
      <ul className="bp-row-list">
        {options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              onClick={() => onPick(option.id)}
              className="bp-row flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="block truncate text-[14px] leading-[21px] font-semibold">
                  {option.name}
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bp-grey-20)]">
                    <span
                      className="block h-full rounded-full bg-[var(--bp-green-90)]"
                      style={{ width: `${Math.round((option.share ?? 0) * 100)}%` }}
                    />
                  </span>
                  <span className="w-20 text-right text-[12px] leading-[18px] text-muted-foreground tabular-nums">
                    {option.share == null ? "share unknown" : `≈ ${percent.format(option.share)}`}
                  </span>
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="bp-link" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
