"use client";

import { BookOpen } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { ViewDescription } from "@/lib/utility-map/describe-view";
import { formatPeriod } from "@/lib/utility-map/format";
import type { UtilityMapData } from "@/lib/utility-map/types";

/** Every number on screen traced to a source, and the current view as a table: same question, every row. */
export function MethodsSheet({ data, described }: { data: UtilityMapData; described: ViewDescription }) {
  const [tab, setTab] = useState<"sources" | "table">("sources");
  const sourceName = (id: string) => data.sources.find((s) => s.id === id);
  const { table } = described;
  return (
    <Sheet>
      <SheetTrigger className="bp-link">
        <BookOpen className="size-4" aria-hidden />
        Methods and sources
      </SheetTrigger>
      <SheetContent side="right" className="bp-theme w-full overflow-y-auto bg-white p-6 sm:max-w-2xl">
        <SheetHeader className="p-0">
          <SheetTitle className="text-[20px]">Methods and sources</SheetTitle>
          <SheetDescription>
            Release {data.release_id ?? "mock"} ({data.as_of}). Every value is an estimate, ranked against Texas counties.
          </SheetDescription>
        </SheetHeader>
        <div className="flex gap-2" role="group" aria-label="View">
          {(["sources", "table"] as const).map((id) => (
            <button key={id} type="button" aria-pressed={tab === id}
              onClick={() => setTab(id)} className="bp-pill">
              {id === "sources" ? "Layers and sources" : "View as table"}
            </button>
          ))}
        </div>
        {tab === "sources" ? (
          <ul className="space-y-4">
            {data.layers.map((layer) => (
              <li key={layer.id} className="space-y-1 border-b pb-3 text-[13px] leading-[19px]">
                <p className="text-[15px] font-semibold">
                  {layer.label}{" "}
                  {!layer.available ? <span className="font-medium text-muted-foreground">(coming)</span> : null}
                </p>
                {layer.available ? (
                  <>
                    <p>{layer.unit} · {formatPeriod(layer)}</p>
                    <p className="text-muted-foreground">{layer.method}</p>
                    <p>
                      {layer.source_ids.map((id, i) => {
                        const s = sourceName(id);
                        return (
                          <span key={id}>
                            {i > 0 ? " · " : ""}
                            {s ? <a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.name}</a> : id}
                          </span>
                        );
                      })}
                    </p>
                    {layer.outage_link?.rho != null && layer.id !== "outages" ? (
                      <p className={layer.outage_link.weak ? "font-semibold text-[var(--bp-red-80)]" : ""}>
                        Rank correlation with long-outage hours across {layer.outage_link.n} counties: ρ ={" "}
                        {layer.outage_link.rho.toFixed(2)}
                        {layer.outage_link.weak ? " (weak link)" : ""}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-muted-foreground">{layer.unavailable_reason}</p>
                )}
              </li>
            ))}
            <li className="text-[13px] leading-[19px] text-muted-foreground">
              Utility scores weight each county by the utility&apos;s estimated customers there (EIA-861 service
              territories, modeled split). Base fleet numbers are idealized ceilings: {data.battery.kwh_per_core} kWh and{" "}
              {data.battery.kw_per_core} kW per Core, {Math.round(data.battery.reserve_fraction * 100)}% kept for backup.
            </li>
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px] leading-[18px]">
              <caption className="pb-2 text-left text-muted-foreground">
                <span className="block font-semibold text-foreground">
                  {described.caption.title} · {described.caption.qualifier}
                </span>
                {table.caption}.
              </caption>
              <thead>
                <tr className="border-b">
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-2">{table.rowKind === "county" ? "County" : "Utility"}</th>
                  {table.columns.map((col) => (
                    <th key={col} className="py-1 pr-2">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={row.id} className="border-b align-top">
                    <td className="py-1 pr-2 tabular-nums">{i + 1}</td>
                    <td className="py-1 pr-2 font-semibold">{row.name}</td>
                    {row.cells.map((cell, j) => (
                      <td key={j} className="py-1 pr-2 tabular-nums">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
