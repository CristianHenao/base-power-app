import type { TableSpec } from "./describe-view.ts";

type Row = TableSpec["rows"][number];

/** Sort a view's table by a column's raw numbers or by name; places without data stay last. null keeps the view's order. */
export function sortTableRows(rows: Row[], key: number | "name" | null, dir: "asc" | "desc"): Row[] {
  if (key == null) return rows;
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name") return sign * a.name.localeCompare(b.name);
    const x = a.values[key];
    const y = b.values[key];
    if (x == null || y == null) return Number(x == null) - Number(y == null);
    return sign * (x - y) || a.name.localeCompare(b.name);
  });
}

/** Rows whose name contains the query, ignoring case and surrounding spaces. */
export function filterTableRows(rows: Row[], query: string): Row[] {
  const q = query.trim().toLowerCase();
  return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
}
