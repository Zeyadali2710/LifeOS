// Client-safe display helpers for Outreach. Everything is shown in Sydney time (UI-SPEC).
import type { OutreachEventDTO } from "@/lib/outreach-types";

const TZ = "Australia/Sydney";
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-AU", { timeZone: TZ, ...o });
const F = {
  wd: fmt({ weekday: "short" }),
  day: fmt({ day: "numeric" }),
  mon: fmt({ month: "short" }),
  year: fmt({ year: "numeric" }),
  time: fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
  zone: fmt({ timeZoneName: "short" }),
  ymd: new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }),
};

export const wd = (iso: string) => F.wd.format(new Date(iso));
export const dayNum = (iso: string) => F.day.format(new Date(iso));
export const hhmm = (iso: string) => F.time.format(new Date(iso));
export const sydneyYmd = (iso: string) => F.ymd.format(new Date(iso));
/** "Tue 20 Oct" */
export const dateShort = (iso: string) => `${wd(iso)} ${dayNum(iso)} ${F.mon.format(new Date(iso))}`;
export const dateLong = (iso: string) => `${dateShort(iso)} ${F.year.format(new Date(iso))}`;
export const zoneName = (iso: string) => F.zone.formatToParts(new Date(iso)).find((p) => p.type === "timeZoneName")?.value ?? "";

type T = Pick<OutreachEventDTO, "startAt" | "endAt" | "allDay">;
/** "18:00–20:00", the start alone when there is no end, "All day" for all-day events */
export function timeRange(e: T): string {
  if (e.allDay) return "All day";
  return e.endAt ? `${hhmm(e.startAt)}–${hhmm(e.endAt)}` : hhmm(e.startAt);
}

/** UI-SPEC score colours: 85+ green, 70-84 cyan, otherwise text-2. */
export const scoreColor = (n: number) => (n >= 85 ? "var(--status-working)" : n >= 70 ? "var(--status-approval)" : "var(--ink-2)");

/** Due date for a follow-up: (end ?? start) + 2 days, as a Sydney YYYY-MM-DD. */
export function followUpDue(e: T): string {
  const base = e.endAt ?? e.startAt;
  const [y, m, d] = sydneyYmd(base).split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 2)).toISOString().slice(0, 10);
}
