"use client";

import { BookOpen } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatLayerValue, formatPeriod } from "@/lib/utility-map/format";
import { offerLabel, utilityLayerQuality, utilityLayerSummary, type ScoreModel } from "@/lib/utility-map/scoring";
import type { CountyRecord, LayerId, UtilityMapData } from "@/lib/utility-map/types";

/** Every number on screen traced to a source: layers, methods, outage check, and the ranking as a table. */
export function MethodsSheet({
  data,
  model,
  activeLayers,
  countiesByFips,
}: {
  data: UtilityMapData;
  model: ScoreModel;
  activeLayers: LayerId[];
  countiesByFips: Map<string, CountyRecord>;
}) {
  const [tab, setTab] = useState<"sources" | "table">("sources");
  const sourceName = (id: string) => data.sources.find((s) => s.id === id);
  const ranked = [...data.utilities]
    .filter((u) => model.utility.get(u.id)?.score != null)
    .sort((a, b) => (model.utility.get(b.id)?.score ?? 0) - (model.utility.get(a.id)?.score ?? 0))
    .slice(0, 25);
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
              <caption className="pb-2 text-left text-muted-foreground">Top 25 utilities for the layers on now.</caption>
              <thead>
                <tr className="border-b">
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-2">Utility</th>
                  <th className="py-1 pr-2">Level</th>
                  <th className="py-1 pr-2">Base offer</th>
                  {activeLayers.map((id) => (
                    <th key={id} className="py-1 pr-2">{data.layers.find((l) => l.id === id)?.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map((u, i) => (
                  <tr key={u.id} className="border-b align-top">
                    <td className="py-1 pr-2 tabular-nums">{i + 1}</td>
                    <td className="py-1 pr-2 font-semibold">{u.name}</td>
                    <td className="py-1 pr-2 tabular-nums">{model.utility.get(u.id)?.level ?? "—"}</td>
                    <td className="py-1 pr-2">{offerLabel(u)}</td>
                    {activeLayers.map((id) => {
                      const meta = data.layers.find((l) => l.id === id)!;
                      const { value } = utilityLayerSummary(u, countiesByFips, id);
                      return (
                        <td key={id} className="py-1 pr-2 tabular-nums">
                          {formatLayerValue(meta, value, utilityLayerQuality(u, countiesByFips, id))}
                        </td>
                      );
                    })}
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
