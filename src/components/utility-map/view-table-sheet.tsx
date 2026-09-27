"use client";

import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { TableSpec, ViewDescription } from "@/lib/utility-map/describe-view";
import { filterTableRows, sortTableRows } from "@/lib/utility-map/view-table";
import { cn } from "@/lib/utils";

type Kind = TableSpec["rowKind"];
type SortKey = number | "name" | null;

/**
 * The full table for the current view (hazards, storm, grid, fleet): every row and column from
 * describeView, with a utilities / counties tab where the view has both, sortable and searchable.
 * Picking a row opens its score card. The Grid Risk Index has its own sheet (RiskTableSheet).
 */
export function ViewTableSheet({
  open,
  onOpenChange,
  described,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  described: ViewDescription;
  onPick: (id: string, kind: Kind) => void;
}) {
  const tables = [described.table, described.countyTable].filter((t): t is TableSpec => t != null);
  const [kind, setKind] = useState<Kind>(described.table.rowKind);
  const [query, setQuery] = useState("");
  // null keeps the view's own order (the same order as the map and the card).
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: null, dir: "desc" });
  const table = tables.find((t) => t.rowKind === kind) ?? tables[0];
  const rows = sortTableRows(filterTableRows(table.rows, query), sort.key, sort.dir);
  const noun = (k: Kind, t: TableSpec) => `${k === "utility" ? "Utilities" : "Counties"} (${t.rows.length})`;

  const pickTab = (k: Kind) => {
    setKind(k);
    setSort({ key: null, dir: "desc" });
  };

  const header = (key: Exclude<SortKey, null>, label: string, className?: string) => {
    const active = sort.key === key;
    return (
      <th
        key={String(key)}
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
              dir: prev.key === key ? (prev.dir === "asc" ? "desc" : "asc") : key === "name" ? "asc" : "desc",
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
          <p className="text-[12px] leading-[18px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
            {described.intro.eyebrow}
          </p>
          <SheetTitle className="text-[22px]">{described.intro.title}</SheetTitle>
          <SheetDescription>
            {described.intro.lead} {described.intro.read}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center gap-3 px-6">
          {tables.length > 1 ? (
            <div role="tablist" aria-label="Places" className="flex gap-1 rounded-full bg-[var(--bp-grey-5)] p-1">
              {tables.map((t) => (
                <button
                  key={t.rowKind}
                  type="button"
                  role="tab"
                  aria-selected={table.rowKind === t.rowKind}
                  onClick={() => pickTab(t.rowKind)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[13px] font-semibold",
                    table.rowKind === t.rowKind ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.15)]" : "text-muted-foreground",
                  )}
                >
                  {noun(t.rowKind, t)}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[13px] font-semibold">{noun(table.rowKind, table)}</p>
          )}
          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-full border px-3 py-1.5 sm:max-w-xs">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <span className="sr-only">Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${table.rowKind === "utility" ? "utilities" : "counties"}`}
              className="w-full bg-transparent text-[14px] outline-none"
            />
          </label>
          <p className="text-[12px] text-muted-foreground">
            {rows.length} shown ·{" "}
            {sort.key == null ? "in map order" : `sorted by ${sort.key === "name" ? "name" : table.columns[sort.key]}`}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
          {table.rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed px-4 py-3 text-[14px] text-muted-foreground">Nothing to list.</p>
          ) : (
            <table className="w-full border-separate border-spacing-0 text-[13px] leading-[18px]">
              <thead>
                <tr className="text-[12px] text-muted-foreground">
                  <th scope="col" className="sticky top-0 z-10 w-10 bg-white px-2 py-2 text-left align-bottom font-semibold">
                    #
                  </th>
                  {header("name", table.rowKind === "utility" ? "Utility" : "County", "min-w-[200px]")}
                  {table.columns.map((col, i) => header(i, col))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, n) => (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    onClick={() => onPick(row.id, table.rowKind)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onPick(row.id, table.rowKind);
                      }
                    }}
                    className="cursor-pointer hover:bg-[var(--bp-grey-5)] focus-visible:bg-[var(--bp-grey-5)]"
                  >
                    <td className="border-b px-2 py-1.5 tabular-nums text-muted-foreground">{n + 1}</td>
                    <td className="border-b px-2 py-1.5 font-semibold">{row.name}</td>
                    {row.cells.map((cell, i) => (
                      <td
                        key={table.columns[i]}
                        className={cn("border-b px-2 py-1.5 whitespace-nowrap tabular-nums", i === table.primary && "font-semibold")}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
