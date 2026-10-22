// Per-day "Skip" state for plan items, kept in the browser only (T-04-52).
export type SkipStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const PREFIX = "lifeos.plan.skipped.";

export function skippedFor(day: string, s: SkipStorage): Set<string> {
  try {
    const v: unknown = JSON.parse(s.getItem(PREFIX + day) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function write(day: string, ids: Set<string>, s: SkipStorage) {
  try {
    const stale: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(PREFIX) && k !== PREFIX + day) stale.push(k);
    }
    for (const k of stale) s.removeItem(k);
    s.setItem(PREFIX + day, JSON.stringify([...ids]));
  } catch {
    // quota or denied: skip state is a convenience only
  }
}

export function skip(day: string, id: string, s: SkipStorage): Set<string> {
  const ids = skippedFor(day, s).add(id);
  write(day, ids, s);
  return ids;
}

export function unskip(day: string, id: string, s: SkipStorage): Set<string> {
  const ids = skippedFor(day, s);
  ids.delete(id);
  write(day, ids, s);
  return ids;
}
