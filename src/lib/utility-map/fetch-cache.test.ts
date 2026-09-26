import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeFetched, toFetch } from "./fetch-cache.ts";

test("a failed file is not fetched again, and a loaded one is not refetched", () => {
  assert.deepEqual(toFetch(["a", "b", "c"], { a: 1 }, new Set(["b"])), ["c"]);
});

test("merging results keeps the same cache object when nothing loaded, so effects don't loop", () => {
  const prev = { a: 1 };
  const same = mergeFetched(prev, ["b"], [null]);
  assert.equal(same.cache, prev);
  assert.deepEqual([...same.failed], ["b"]);
  const next = mergeFetched(prev, ["b", "c"], [2, null]);
  assert.deepEqual(next.cache, { a: 1, b: 2 });
  assert.deepEqual([...next.failed], ["c"]);
});
