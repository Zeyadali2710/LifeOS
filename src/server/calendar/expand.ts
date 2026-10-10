// Read-time expansion of stored masters + overrides (Google rows or CalDAV ICS) into display instances (D-04).
// Recurrence runs on floating wall-clock times (ical.js), each occurrence is converted to an instant per zone, so DST is exact.
import ICAL from "ical.js";
import type { StoredEvent } from "./types";

const SYDNEY = "Australia/Sydney";
const MAX_OCCURRENCES = 2000; // ponytail: 2000 occurrences per series cap, raise if a far-future window needs more
const DAY = 86400000;

export type Instance = {
  key: string;
  eventId: string;
  calendarId: string;
  remoteId: string;
  title: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  startDate: string | null;
  endDate: string | null;
  tz: string | null;
  recurring: boolean;
  rrule: string | null;
  instanceStart: string | null;
  status: string;
  transparency: string;
  declined: boolean;
};

// ---- zones ----
const dtfs = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = dtfs.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    dtfs.set(tz, f);
  }
  return f;
}

export function isIanaZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    dtf(tz);
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(tz: string, d: Date) {
  const p = Object.fromEntries(dtf(isIanaZone(tz) ? tz : SYDNEY).formatToParts(d).map((x) => [x.type, +x.value])) as Record<string, number>;
  return { y: p.year!, m: p.month!, d: p.day!, h: p.hour!, min: p.minute!, s: p.second! };
}

function offsetMs(tz: string, d: Date) {
  const p = zonedParts(tz, d);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(d.getTime() / 1000) * 1000;
}

/** Wall time in tz -> instant; offset rechecked once so DST edges are right. Invalid zone -> Sydney. */
export function zonedInstant(tz: string, y: number, m: number, d: number, h: number, min: number, s = 0) {
  const zone = isIanaZone(tz) ? tz : SYDNEY;
  const guess = Date.UTC(y, m - 1, d, h, min, s);
  const t = guess - offsetMs(zone, new Date(guess));
  return new Date(guess - offsetMs(zone, new Date(t)));
}

// ---- helpers ----
const pad = (n: number) => String(n).padStart(2, "0");
const dateStr = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const addDays = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const dayInstant = (s: string) => {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return zonedInstant(SYDNEY, y, m, d, 0, 0);
};
const normKey = (s: string) => (/^\d{4}-\d\d-\d\d$/.test(s) ? s : String(Date.parse(s)));
const num = (x?: string) => Number(x);
const unfold = (s: string) => s.replace(/\r?\n[ \t]/g, "");

type Conv = (t: ICAL.Time) => Date;
type Zones = Map<string, ICAL.Timezone>;

function converter(tzid: string | null, utc: boolean, zones: Zones): Conv {
  const f = (t: ICAL.Time) => [t.year, t.month, t.day, t.hour, t.minute, t.second] as const;
  if (utc) return (t) => new Date(Date.UTC(...(([y, m, d, h, mi, s]) => [y, m - 1, d, h, mi, s] as const)(f(t))));
  if (tzid && isIanaZone(tzid)) return (t) => zonedInstant(tzid, t.year, t.month, t.day, t.hour, t.minute, t.second);
  const z = tzid ? zones.get(tzid) : undefined;
  if (z) {
    return (t) =>
      new Date(ICAL.Time.fromData({ year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute, second: t.second }, z).toUnixTime() * 1000);
  }
  return (t) => zonedInstant(SYDNEY, t.year, t.month, t.day, t.hour, t.minute, t.second); // floating -> Sydney
}

/** EXDATE/RDATE/RECURRENCE-ID content line -> comparable keys (instant ms, or YYYY-MM-DD). */
function lineKeys(line: string, defTz: string | null, zones: Zones): string[] {
  const i = line.indexOf(":");
  if (i < 0) return [];
  const params = line.slice(0, i).split(";").slice(1);
  const tzid = params.find((p) => /^TZID=/i.test(p))?.slice(5).replace(/^"|"$/g, "") ?? defTz;
  const out: string[] = [];
  for (const v of line.slice(i + 1).split(",")) {
    const date = /^(\d{4})(\d\d)(\d\d)$/.exec(v);
    if (date) {
      out.push(`${date[1]}-${date[2]}-${date[3]}`);
      continue;
    }
    const m = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)(Z?)$/.exec(v);
    if (!m) continue;
    const t = ICAL.Time.fromData({ year: num(m[1]), month: num(m[2]), day: num(m[3]), hour: num(m[4]), minute: num(m[5]), second: num(m[6]) });
    out.push(String(converter(tzid, m[7] === "Z", zones)(t).getTime()));
  }
  return out;
}

// ---- series ----
type Series = {
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  tz: string | null;
  start: ICAL.Time; // floating wall time (or date)
  conv: Conv;
  durMs: number;
  durDays: number;
  rrule: string | null;
  lines: string[]; // EXDATE / RDATE
  zones: Zones;
  zoneId: string | null;
  status: string;
  transparency: string;
  declined: boolean;
};

type Occ = { start: Date; end: Date; startDate: string | null; endDate: string | null; key: string };

function* occurrences(s: Series, to: Date): Generator<Occ> {
  const ex = new Set<string>();
  const rd: ICAL.Time[] = [];
  for (const l of s.lines) {
    const name = l.slice(0, l.search(/[;:]/)).toUpperCase();
    if (name === "EXDATE") for (const k of lineKeys(l, s.zoneId, s.zones)) ex.add(k);
    else if (name === "RDATE") {
      for (const v of l.slice(l.indexOf(":") + 1).split(",")) {
        const m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d))?/.exec(v);
        if (m) rd.push(ICAL.Time.fromData({ year: num(m[1]), month: num(m[2]), day: num(m[3]), hour: num(m[4] ?? "0"), minute: num(m[5] ?? "0"), second: num(m[6] ?? "0"), isDate: s.allDay }));
      }
    }
  }
  const make = (t: ICAL.Time): Occ => {
    if (s.allDay) {
      const startDate = dateStr(t.year, t.month, t.day);
      return { start: dayInstant(startDate), end: dayInstant(addDays(startDate, s.durDays)), startDate, endDate: addDays(startDate, s.durDays), key: startDate };
    }
    const start = s.conv(t);
    return { start, end: new Date(start.getTime() + s.durMs), startDate: null, endDate: null, key: String(start.getTime()) };
  };
  let n = 0;
  for (const t of rd) {
    const o = make(t);
    if (!ex.has(o.key) && n++ < MAX_OCCURRENCES) yield o;
  }
  if (!s.rrule) {
    const o = make(s.start);
    if (!ex.has(o.key)) yield o;
    return;
  }
  const recur = ICAL.Recur.fromString(s.rrule);
  if (recur.until && !recur.until.isDate && recur.until.zone === ICAL.Timezone.utcTimezone) {
    // UTC UNTIL -> series wall clock so it compares with the floating iterator
    const u = recur.until;
    const inst = new Date(Date.UTC(u.year, u.month - 1, u.day, u.hour, u.minute, u.second));
    const w = s.tz && isIanaZone(s.tz) ? zonedParts(s.tz, inst) : zonedParts(SYDNEY, inst);
    recur.until = ICAL.Time.fromData({ year: w.y, month: w.m, day: w.d, hour: w.h, minute: w.min, second: w.s });
  }
  const it = recur.iterator(s.start);
  for (let t = it.next(); t && n < MAX_OCCURRENCES; t = it.next()) {
    n++;
    const o = make(t);
    if (o.start >= to) return;
    if (!ex.has(o.key)) yield o;
  }
}

function zoneName(tzid: string | null, utc: boolean) {
  return utc ? "UTC" : isIanaZone(tzid) ? tzid : SYDNEY;
}

function googleSeries(row: StoredEvent): Series {
  const tz = isIanaZone(row.tz) ? row.tz : SYDNEY;
  const rec = row.recurrence ?? [];
  let start: ICAL.Time;
  let durMs = 0;
  let durDays = 1;
  if (row.allDay && row.startDate) {
    start = ICAL.Time.fromDateString(row.startDate);
    durDays = row.endDate ? Math.max(1, Math.round((Date.parse(row.endDate) - Date.parse(row.startDate)) / DAY)) : 1;
  } else {
    if (!row.startAt) throw new Error("no start");
    const p = zonedParts(tz, row.startAt);
    start = ICAL.Time.fromData({ year: p.y, month: p.m, day: p.d, hour: p.h, minute: p.min, second: p.s });
    durMs = row.endAt ? row.endAt.getTime() - row.startAt.getTime() : 0;
  }
  return {
    title: row.title, description: row.description, location: row.location, allDay: row.allDay, tz, start,
    conv: converter(tz, false, new Map()), durMs, durDays,
    rrule: rec.find((l) => /^RRULE:/i.test(l))?.slice(6) ?? null,
    lines: rec.filter((l) => /^(EXDATE|RDATE)[;:]/i.test(l)),
    zones: new Map(), zoneId: tz, status: row.status, transparency: row.transparency, declined: row.declined,
  };
}

function icsSeries(v: ICAL.Component, zones: Zones): Series {
  const ds = v.getFirstProperty("dtstart");
  if (!ds) throw new Error("no dtstart");
  const raw = String(ds.jCal[3]);
  const allDay = raw.length === 10;
  const utc = raw.endsWith("Z");
  const tzid = (ds.getParameter("tzid") as string | undefined) ?? null;
  const conv = converter(tzid, utc, zones);
  const start = allDay ? ICAL.Time.fromDateString(raw) : ICAL.Time.fromDateTimeString(raw.replace("Z", ""));
  let durMs = 0;
  let durDays = 1;
  const de = v.getFirstProperty("dtend");
  if (de) {
    const er = String(de.jCal[3]);
    if (allDay) durDays = Math.max(1, Math.round((Date.parse(er.slice(0, 10)) - Date.parse(raw)) / DAY));
    else {
      const eTz = (de.getParameter("tzid") as string | undefined) ?? null;
      const end = converter(eTz, er.endsWith("Z"), zones)(ICAL.Time.fromDateTimeString(er.replace("Z", "")));
      durMs = end.getTime() - conv(start).getTime();
    }
  } else {
    const dur = v.getFirstPropertyValue("duration") as ICAL.Duration | null;
    if (dur) {
      if (allDay) durDays = Math.max(1, Math.round(dur.toSeconds() / 86400));
      else durMs = dur.toSeconds() * 1000;
    }
  }
  const text = (n: string) => (v.getFirstPropertyValue(n) as string | null) ?? null;
  const lines = [...v.getAllProperties("exdate"), ...v.getAllProperties("rdate")].map((p) => unfold(p.toICALString()));
  return {
    title: text("summary") ?? "", description: text("description"), location: text("location"), allDay,
    tz: zoneName(tzid, utc), start, conv, durMs, durDays,
    rrule: v.getFirstPropertyValue("rrule")?.toString() ?? null, lines, zones, zoneId: tzid,
    status: (text("status") ?? "confirmed").toLowerCase(), transparency: (text("transp") ?? "OPAQUE").toLowerCase() === "transparent" ? "transparent" : "opaque",
    declined: false,
  };
}

function loadZones(root: ICAL.Component): Zones {
  const zones: Zones = new Map();
  for (const z of root.getAllSubcomponents("vtimezone")) {
    const id = z.getFirstPropertyValue("tzid") as string | null;
    if (id) zones.set(id, new ICAL.Timezone(z));
  }
  return zones;
}

// ---- expand ----
export function expand(rows: StoredEvent[], from: Date, to: Date): Instance[] {
  const out: Instance[] = [];
  let skipped = 0;
  const masters = new Set(rows.filter((r) => r.recurrence?.length).map((r) => `${r.calendarId}:${r.remoteId}`));
  const overrides = new Map<string, StoredEvent[]>();
  const plain: StoredEvent[] = [];
  for (const r of rows) {
    if (r.recurringRemoteId && masters.has(`${r.calendarId}:${r.recurringRemoteId}`)) {
      const k = `${r.calendarId}:${r.recurringRemoteId}`;
      overrides.set(k, [...(overrides.get(k) ?? []), r]);
    } else plain.push(r);
  }

  const push = (row: StoredEvent, s: Series | null, o: { start: Date; end: Date; startDate: string | null; endDate: string | null } & Partial<Omit<Series, "start">>, recurring: boolean, rrule: string | null, instanceStart: string | null) => {
    const { start, end } = o;
    if (!(start < to && (end > from || start >= from))) return;
    const base = s ?? (o as unknown as Series);
    out.push({
      key: `${row.id}:${instanceStart ?? "single"}`, eventId: row.id, calendarId: row.calendarId, remoteId: row.remoteId,
      title: base.title, description: base.description, location: base.location, start, end, allDay: base.allDay,
      startDate: o.startDate, endDate: o.endDate, tz: base.tz, recurring, rrule, instanceStart,
      status: base.status, transparency: base.transparency, declined: base.declined,
    });
  };

  const single = (row: StoredEvent) => {
    if (row.allDay && row.startDate) {
      const e = row.endDate ?? addDays(row.startDate, 1);
      return { start: dayInstant(row.startDate), end: dayInstant(e), startDate: row.startDate, endDate: e };
    }
    if (!row.startAt) throw new Error("no start");
    return { start: row.startAt, end: row.endAt ?? row.startAt, startDate: null, endDate: null };
  };
  const plainSeries = (row: StoredEvent) => ({
    title: row.title, description: row.description, location: row.location, allDay: row.allDay, tz: row.tz,
    status: row.status, transparency: row.transparency, declined: row.declined,
  }) as Series;

  const series = (row: StoredEvent, s: Series, ovr: { key: string; piece: Parameters<typeof push>[2] & Series; cancelled: boolean }[]) => {
    const map = new Map(ovr.map((x) => [x.key, x]));
    for (const o of occurrences(s, to)) {
      const iso = s.allDay ? o.key : o.start.toISOString();
      const ov = map.get(o.key);
      if (!ov) push(row, s, o, true, s.rrule, iso);
      else if (!ov.cancelled) push(row, null, ov.piece, true, s.rrule, iso);
    }
  };

  for (const row of plain) {
    try {
      if (row.raw && typeof row.raw === "object" && "ics" in row.raw) {
        const root = new ICAL.Component(ICAL.parse(String((row.raw as { ics: string }).ics)));
        const zones = loadZones(root);
        const vs = root.getAllSubcomponents("vevent");
        const master = vs.find((v) => !v.hasProperty("recurrence-id"));
        const exc = vs.filter((v) => v.hasProperty("recurrence-id"));
        const icsPiece = (v: ICAL.Component) => {
          const s = icsSeries(v, zones);
          const st = s.conv(s.start);
          const sd = s.allDay ? dateStr(s.start.year, s.start.month, s.start.day) : null;
          return Object.assign(s, s.allDay
            ? { start: dayInstant(sd!), end: dayInstant(addDays(sd!, s.durDays)), startDate: sd, endDate: addDays(sd!, s.durDays) }
            : { start: st, end: new Date(st.getTime() + s.durMs), startDate: null, endDate: null }) as unknown as Series & { start: Date; end: Date; startDate: string | null; endDate: string | null };
        };
        if (!master) {
          for (const v of exc) {
            const p = icsPiece(v);
            if (p.status !== "cancelled") push(row, null, p as never, false, null, null);
          }
          continue;
        }
        const s = icsSeries(master, zones);
        if (!s.rrule && !s.lines.length) {
          push(row, null, icsPiece(master) as never, false, null, null);
          continue;
        }
        const ovr = exc.flatMap((v) => {
          const rid = v.getFirstProperty("recurrence-id");
          if (!rid) return [];
          const key = lineKeys(unfold(rid.toICALString()), s.zoneId, zones)[0];
          const piece = icsPiece(v);
          return key ? [{ key, piece: piece as never, cancelled: piece.status === "cancelled" }] : [];
        });
        series(row, s, ovr);
      } else if (row.recurrence?.length) {
        const s = googleSeries(row);
        const ovr = (overrides.get(`${row.calendarId}:${row.remoteId}`) ?? []).flatMap((o) =>
          o.originalStart ? [{ key: normKey(o.originalStart), piece: (o.status === "cancelled" ? null : { ...plainSeries(o), ...single(o) }) as never, cancelled: o.status === "cancelled" }] : [],
        );
        series(row, s, ovr);
      } else if (row.status !== "cancelled") {
        push(row, plainSeries(row), single(row), false, null, null);
      }
    } catch {
      skipped++;
    }
  }
  if (skipped) console.warn(`[calendar] skipped ${skipped} unparseable event(s) during expansion`); // count only, never content
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function humanRule(rrule: string): string {
  const p = Object.fromEntries(rrule.split(";").map((x) => x.split("=") as [string, string]));
  const days: Record<string, string> = { MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday", FR: "Friday", SA: "Saturday", SU: "Sunday" };
  switch (p.FREQ) {
    case "DAILY": return "Repeats daily";
    case "WEEKLY": return p.BYDAY && days[p.BYDAY] ? `Repeats weekly on ${days[p.BYDAY]}` : "Repeats weekly";
    case "MONTHLY": return p.BYMONTHDAY ? `Repeats monthly on day ${p.BYMONTHDAY}` : "Repeats monthly";
    case "YEARLY": return "Repeats yearly";
    default: return "Repeats";
  }
}
