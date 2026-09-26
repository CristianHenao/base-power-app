/**
 * Lazy file loading for the map (flood zones, tracks, plants): fetch each file once, and
 * remember failures so a missing file is not requested again on every render.
 */

export function toFetch<T>(wanted: string[], cache: Record<string, T>, failed: Set<string>): string[] {
  return wanted.filter((key) => !(key in cache) && !failed.has(key));
}

/** Returns the same cache object when nothing new loaded, so React effects don't re-run. */
export function mergeFetched<T>(
  prev: Record<string, T>,
  keys: string[],
  results: (T | null)[],
): { cache: Record<string, T>; failed: Set<string> } {
  const failed = new Set<string>();
  let cache = prev;
  keys.forEach((key, i) => {
    const result = results[i];
    if (result == null) {
      failed.add(key);
      return;
    }
    if (cache === prev) cache = { ...prev };
    cache[key] = result;
  });
  return { cache, failed };
}
