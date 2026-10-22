// Pure Sydney time helpers (no date lib, no db/next imports: safe for client components).
export const TZ = "Australia/Sydney";

function fmt(d: Date, opts: Intl.DateTimeFormatOptions) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", { timeZone: TZ, hourCycle: "h23", ...opts })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  ) as Record<Intl.DateTimeFormatPartTypes, string>;
}

export function sydneyParts(d: Date) {
  const p = fmt(d, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" });
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, weekday: p.weekday };
}

/** Sydney UTC offset in ms at instant d. */
export function tzOffset(d: Date) {
  const p = fmt(d, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(d.getTime() / 1000) * 1000;
}

/** Sydney wall time -> instant; offset rechecked once so DST edges are right. */
export function sydneyInstant(y: number, m: number, d: number, h: number, min = 0) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const t = guess - tzOffset(new Date(guess));
  return new Date(guess - tzOffset(new Date(t)));
}

export function greeting(now: Date) {
  const h = sydneyParts(now).hour;
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function dateLabel(now: Date) {
  const p = fmt(now, { weekday: "long", month: "long", day: "numeric" });
  return `${p.weekday}, ${p.month} ${p.day}`.toUpperCase();
}

export function formatHM(d: Date) {
  const { hour, minute } = sydneyParts(d);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Almanac clock: "9:41", "18:00" (no leading zero). */
export function clock(d: Date) {
  const { hour, minute } = sydneyParts(d);
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

export function tzLabel(d: Date) {
  return fmt(d, { timeZoneName: "short" }).timeZoneName;
}

export type SnoozePreset = { key: "hour" | "tonight" | "tomorrow"; label: "1 hour" | "Tonight" | "Tomorrow"; until: Date; hint: string };

export function snoozePresets(now: Date): SnoozePreset[] {
  const { year, month, day } = sydneyParts(now);
  const out: SnoozePreset[] = [];
  const hour = new Date(now.getTime() + 3600000);
  out.push({ key: "hour", label: "1 hour", until: hour, hint: formatHM(hour) });
  const tonight = sydneyInstant(year, month, day, 18);
  if (now < tonight) out.push({ key: "tonight", label: "Tonight", until: tonight, hint: "18:00" });
  const n = new Date(Date.UTC(year, month - 1, day + 1));
  const tomorrow = sydneyInstant(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate(), 9);
  out.push({ key: "tomorrow", label: "Tomorrow", until: tomorrow, hint: `${sydneyParts(tomorrow).weekday} 09:00` });
  return out;
}

const dayKey = (d: Date) => {
  const p = sydneyParts(d);
  return Date.UTC(p.year, p.month - 1, p.day);
};

export function snoozeToast(until: Date, now: Date) {
  const diff = (dayKey(until) - dayKey(now)) / 86400000;
  const hm = formatHM(until);
  if (diff <= 0) return `Snoozed until ${hm}`;
  if (diff === 1) return `Snoozed until tomorrow ${hm}`;
  return `Snoozed until ${sydneyParts(until).weekday} ${hm}`;
}

export type NotificationGroup = "NOW" | "TODAY" | "EARLIER";
type N = { createdAt: string; readAt: string | null; category: string };

export function notificationGroup(n: N, now: Date): NotificationGroup {
  const created = new Date(n.createdAt);
  const important = n.category === "URGENT" || n.category === "IMPORTANT";
  if ((n.readAt === null && important) || now.getTime() - created.getTime() < 3600000) return "NOW";
  return dayKey(created) === dayKey(now) ? "TODAY" : "EARLIER";
}

export function groupNotifications<T extends N>(items: T[], now: Date) {
  return (["NOW", "TODAY", "EARLIER"] as const)
    .map((group) => ({ group, items: items.filter((i) => notificationGroup(i, now) === group) }))
    .filter((g) => g.items.length > 0);
}

export function relativeTime(d: Date, now: Date) {
  if (dayKey(d) === dayKey(now)) return formatHM(d);
  if (now.getTime() - d.getTime() < 7 * 86400000) return sydneyParts(d).weekday;
  const p = fmt(d, { day: "numeric", month: "short" });
  return `${p.day} ${p.month}`;
}
