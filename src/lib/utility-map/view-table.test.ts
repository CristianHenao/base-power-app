import assert from "node:assert/strict";
import { test } from "node:test";
import type { TableSpec } from "./describe-view.ts";
import { filterTableRows, sortTableRows } from "./view-table.ts";

const rows: TableSpec["rows"] = [
  { id: "a", name: "Oncor", cells: ["10%", "No data"], values: [10, null] },
  { id: "b", name: "Austin Energy", cells: ["2%", "5 MW"], values: [2, 5] },
  { id: "c", name: "CenterPoint", cells: ["30%", "9 MW"], values: [30, 9] },
];

test("sorts by a column numerically, places without data last either way", () => {
  assert.deepEqual(sortTableRows(rows, 0, "desc").map((r) => r.id), ["c", "a", "b"]);
  assert.deepEqual(sortTableRows(rows, 0, "asc").map((r) => r.id), ["b", "a", "c"]);
  assert.deepEqual(sortTableRows(rows, 1, "asc").map((r) => r.id), ["b", "c", "a"]);
  assert.deepEqual(sortTableRows(rows, 1, "desc").map((r) => r.id), ["c", "b", "a"]);
});

test("sorts by name and keeps the original order when no sort is picked", () => {
  assert.deepEqual(sortTableRows(rows, "name", "asc").map((r) => r.id), ["b", "c", "a"]);
  assert.deepEqual(sortTableRows(rows, null, "asc").map((r) => r.id), ["a", "b", "c"]);
});

test("search matches names, ignoring case and spaces", () => {
  assert.deepEqual(filterTableRows(rows, "  center ").map((r) => r.id), ["c"]);
  assert.equal(filterTableRows(rows, "").length, 3);
});
