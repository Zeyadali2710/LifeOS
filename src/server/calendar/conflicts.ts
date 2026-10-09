// Pure scheduling rules (D-14). No db/next imports: safe for client components.
export type SchedItem = {
  id: string;
  start: number;
  end: number;
  allDay: boolean;
  transparency: "opaque" | "transparent";
  declined: boolean;
  status: "confirmed" | "tentative" | "cancelled";
};

export type Busy = { id: string; start: number; end: number };

export function busyOf(items: SchedItem[]): Busy[] {
  return items
    .filter((i) => !i.allDay && i.transparency === "opaque" && !i.declined && i.status !== "cancelled")
    .map(({ id, start, end }) => ({ id, start, end }));
}

export function conflicts(busy: Busy[]): { a: string; b: string; start: number; end: number }[] {
  const s = [...busy].sort((x, y) => x.start - y.start || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const out: { a: string; b: string; start: number; end: number }[] = [];
  // ponytail: O(n*k) on overlap depth, fine for a personal calendar
  for (let i = 0; i < s.length; i++) {
    for (let j = i + 1; j < s.length; j++) {
      if (s[j]!.start >= s[i]!.end) break; // sorted by start: nothing later overlaps i
      out.push({ a: s[i]!.id, b: s[j]!.id, start: s[j]!.start, end: Math.min(s[i]!.end, s[j]!.end) });
    }
  }
  return out.sort((x, y) => x.start - y.start || (x.a + x.b < y.a + y.b ? -1 : 1));
}
