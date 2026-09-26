"use client";

import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RISK_HAZARDS, RISK_STRESS } from "@/lib/utility-map/describe-view";
import { filterRiskRows, riskRows, sortRiskRows, type RiskRow, type RiskSortKey } from "@/lib/utility-map/risk-table";
import { LEVEL_COLORS, type Level } from "@/lib/utility-map/scoring";
import type { CountyRecord, LayerId, UtilityMapData } from "@/lib/utility-map/types";
import { cn } from "@/lib/utils";

const SHORT: Partial<Record<LayerId, string>> = {
  flood: "Flood",
  tornado: "Tornado",
  severe_storm: "Hail/wind",
  hurricane: "Hurricane",
  winter: "Freeze",
  heat: "Heat",
  outages: "Outages",
  price_spikes: "Price spikes",
  peak_demand: "Peak demand",
};

/** Pale-to-dark risk shading for a 0-100 value, in the index's own five colors. */
function shade(value: number | null): { backgroundColor?: string; color?: string } {
  if (value == null) return {};
  const level = Math.min(5, Math.floor(value / 20) + 1) as Level;
  return { backgroundColor: LEVEL_COLORS[level], color: level >= 3 ? "white" : undefined };
}

/**
 * Every Texas county and utility with its Grid Risk Index, both halves and all nine factors,
 * sortable and searchable. Picking a row opens its score card.
 */
export function RiskTableSheet({
  open,
  onOpenChange,
  data,
  countiesByFips,
  initialKind = "utility",
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: UtilityMapData;
  countiesByFips: Map<string, CountyRecord>;
  initialKind?: "utility" | "county";
  onPick: (row: RiskRow, kind: "utility" | "county") => void;
}) {
  const [kind, setKind] = useState<"utility" | "county">(initialKind);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: RiskSortKey; dir: "asc" | "desc" }>({ key: "rank", dir: "asc" });
  const all = useMemo(
    () => ({ utility: riskRows(data, "utility", countiesByFips), county: riskRows(data, "county", countiesByFips) }),
    [data, countiesByFips],
  );
  const rows = sortRiskRows(filterRiskRows(all[kind], query), sort.key, sort.dir);

  const header = (key: RiskSortKey, label: string, className?: string) => {
    const active = sort.key === key;
    return (
      <th
        key={key}
        scope="col"
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
        className={cn("sticky top-0 z-10 bg-white px-2 py-2 text-left align-bottom", className)}
      >
        <button
          type="button"
          className="inline-flex items-center gap-1 font-semibold whitespace-nowrap hover:underline"
          onClick={() =>
            setSort((prev) => ({
              key,
              dir: prev.key === key ? (prev.dir === "asc" ? "desc" : "asc") : key === "name" || key === "rank" ? "asc" : "desc",
            }))
          }
        >
          {label}
          {active ? sort.dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden /> : null}
        </button>
      </th>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bp-theme gap-3 bg-white p-0 data-[side=bottom]:h-[90dvh]">
        <SheetHeader className="px-6 pt-5 pb-0">
          <SheetTitle className="text-[22px]">Grid Risk Index: every {kind === "utility" ? "utility" : "county"} in Texas</SheetTitle>
          <SheetDescription>
            1–100 against Texas peers, higher is more at risk. Hazard exposure and grid stress are each half the index;
            the nine factors show each place&apos;s Texas percentile (utilities: customer-weighted over their counties).
            Select a row to open its score card.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center gap-3 px-6">
          <div role="tablist" aria-label="Places" className="flex gap-1 rounded-full bg-[var(--bp-grey-5)] p-1">
            {(["utility", "county"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[13px] font-semibold",
                  kind === k ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.15)]" : "text-muted-foreground",
                )}
              >
                {k === "utility" ? `Utilities (${all.utility.length})` : `Counties (${all.county.length})`}
              </button>
            ))}
          </div>
          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-full border px-3 py-1.5 sm:max-w-xs">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <span className="sr-only">Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${kind === "utility" ? "utilities" : "counties"}`}
              className="w-full bg-transparent text-[14px] outline-none"
            />
          </label>
          <p className="text-[12px] text-muted-foreground">
            {rows.length} shown · sorted by {sort.key === "rank" ? "rank" : sort.key}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
          <table className="w-full border-separate border-spacing-0 text-[13px] leading-[18px]">
            <thead>
              <tr className="text-[12px] text-muted-foreground">
                {header("rank", "#", "w-10")}
                {header("name", kind === "utility" ? "Utility" : "County", "min-w-[200px]")}
                {header("index", "Index")}
                {header("hazard", "Hazard")}
                {header("stress", "Grid stress")}
                {RISK_HAZARDS.map((id) => header(id, SHORT[id]!, "border-l first-of-type:border-l"))}
                {RISK_STRESS.map((id) => header(id, SHORT[id]!))}
                {header("sources", "Sources")}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  onClick={() => onPick(row, kind)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onPick(row, kind);
                    }
                  }}
                  className="cursor-pointer hover:bg-[var(--bp-grey-5)] focus-visible:bg-[var(--bp-grey-5)]"
                >
                  <td className="border-b px-2 py-1.5 tabular-nums text-muted-foreground">{row.rank ?? "—"}</td>
                  <td className="border-b px-2 py-1.5 font-semibold">{row.name}</td>
                  <td className="border-b px-2 py-1.5">
                    {row.index == null ? (
                      "—"
                    ) : (
                      <span
                        className="inline-flex min-w-[64px] items-center justify-between gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold"
                        style={shade(row.index)}
                      >
                        <span className="tabular-nums">{row.index}</span>
                        <span>{row.band}</span>
                      </span>
                    )}
                  </td>
                  <td className="border-b px-2 py-1.5 tabular-nums">{row.hazard ?? "—"}</td>
                  <td className="border-b px-2 py-1.5 tabular-nums">{row.stress ?? "—"}</td>
                  {[...RISK_HAZARDS, ...RISK_STRESS].map((id, i) => (
                    <td key={id} className={cn("border-b px-1 py-1", i === 0 && "border-l")}>
                      <span
                        className="block rounded px-1.5 py-0.5 text-center tabular-nums"
                        style={shade(row.factors[id] ?? null)}
                        title={row.factors[id] == null ? "No data" : `Higher than ${row.factors[id]}% of Texas counties`}
                      >
                        {row.factors[id] ?? "—"}
                      </span>
                    </td>
                  ))}
                  <td className="border-b px-2 py-1.5 tabular-nums text-muted-foreground">
                    {row.sources} / {row.sourcesTotal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SheetContent>
    </Sheet>
  );
}
