// Pure grid maths (client-safe): Sydney wall time only via server/time.
import { sydneyParts } from "@/server/time";

export const HOUR_PX = 44;
export const START_HOUR = 7;
const MIN_H = 22;

const ymdOf = (d: Date) => {
  const p = sydneyParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};
const hourOf = (d: Date) => {
  const p = sydneyParts(d);
  return p.hour + p.minute / 60;
};
const hm = (d: Date) => {
  const p = sydneyParts(d);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
};

/** Block box inside one day column; null when the event ends before the visible window. */
export function blockGeometry(startIso: string, endIso: string, ymd: string, startHour = START_HOUR) {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const startsBefore = ymdOf(s) < ymd;
  const endsAfter = ymdOf(e) > ymd;
  const sh = startsBefore ? 0 : hourOf(s);
  const eh = endsAfter ? 24 : hourOf(e);
  if (eh <= startHour && sh < eh) return null;
  const from = Math.max(sh, startHour);
  const top = (from - startHour) * HOUR_PX + 1;
  const height = Math.max(MIN_H, (Math.max(eh, from) - from) * HOUR_PX - 3);
  const timeLine = endsAfter ? `from ${hm(s)}` : startsBefore ? `→ ${hm(e)}` : `${hm(s)}–${hm(e)}`;
  return { top, height, timeLine, startsBefore, endsAfter };
}

/** Cluster column packing: overlapping events share lanes side by side. */
export function packLanes(items: { key: string; start: string; end: string }[]): Record<string, { lane: number; lanes: number }> {
  const out: Record<string, { lane: number; lanes: number }> = {};
  const sorted = items
    .map((i) => ({ key: i.key, s: Date.parse(i.start), e: Date.parse(i.end) }))
    .sort((a, b) => a.s - b.s || b.e - a.e);
  let cluster: { key: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const c of cluster) out[c.key] = { lane: c.lane, lanes: laneEnds.length };
    cluster = [];
    laneEnds = [];
  };
  for (const it of sorted) {
    if (it.s >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= it.s);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = it.e;
    cluster.push({ key: it.key, lane });
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  flush();
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const parse = (ymd: string) => ymd.split("-").map(Number) as [number, number, number];

/** week: array of day ymds; day/month: a single ymd. */
export function rangeLabel(view: "day" | "week" | "month", days: string[] | string): string {
  if (view === "week" && Array.isArray(days)) {
    const [y1, m1, d1] = parse(days[0]!);
    const [y2, m2, d2] = parse(days[days.length - 1]!);
    if (y1 !== y2) return `${d1} ${MONTHS[m1 - 1]} ${y1} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
    if (m1 !== m2) return `${d1} ${MONTHS[m1 - 1]} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
    return `${d1} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
  }
  const [y, m, d] = parse(Array.isArray(days) ? days[0]! : days);
  if (view === "month") return `${LONG[m - 1]} ${y}`;
  return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** Timed events of one day that end at or before 07:00 (hidden above the grid). */
export function earlierCount(items: { start: string; end: string; allDay: boolean }[], ymd: string): number {
  return items.filter((i) => !i.allDay && ymdOf(new Date(i.start)) === ymd && ymdOf(new Date(i.end)) === ymd && hourOf(new Date(i.end)) <= START_HOUR).length;
}

/** "Thu 8 Oct" in Sydney. */
export function shortDate(iso: string): string {
  const p = sydneyParts(new Date(iso));
  return `${p.weekday} ${p.day} ${MONTHS[p.month - 1]}`;
}

/** "HH:mm" in Sydney. */
export const hmOf = (iso: string) => hm(new Date(iso));
