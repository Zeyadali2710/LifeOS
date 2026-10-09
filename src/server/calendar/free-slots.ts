import { sydneyInstant, sydneyParts } from "@/server/time";

export const WAKE_START = 8;
export const WAKE_END = 22;
export const SLOT_MIN = 15;
export type FreeSlot = { start: number; end: number };

const Q = SLOT_MIN * 60000;
const up = (n: number) => Math.ceil(n / Q) * Q; // Sydney offsets are whole 15-min multiples
const down = (n: number) => Math.floor(n / Q) * Q;

export function sydneyYmd(d: Date): string {
  const p = sydneyParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function wakingWindow(ymd: string): FreeSlot {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return { start: sydneyInstant(y, m, d, WAKE_START).getTime(), end: sydneyInstant(y, m, d, WAKE_END).getTime() };
}

export function freeSlots(
  busy: { start: number; end: number }[],
  window: FreeSlot,
  opts: { now?: number; minMinutes?: number } = {},
): FreeSlot[] {
  const min = (opts.minMinutes ?? SLOT_MIN) * 60000;
  let cursor = opts.now === undefined ? window.start : Math.max(window.start, up(opts.now));
  const out: FreeSlot[] = [];
  const push = (from: number, to: number) => {
    const s = up(from);
    const e = down(to);
    if (e - s >= min && e > s) out.push({ start: s, end: e });
  };
  for (const b of [...busy].sort((x, y) => x.start - y.start)) {
    if (b.end <= cursor) continue;
    if (b.start >= window.end) break;
    if (b.start > cursor) push(cursor, b.start);
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < window.end) push(cursor, window.end);
  return out;
}
