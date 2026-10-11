// Organization read model (D-16): shared by the page and the agent READ tools. No Date.now(): `now` is passed in.
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, gt, or, sql } from "drizzle-orm";
import {
  type CalendarDTO,
  type ConflictDTO,
  type InstanceDTO,
  type PlanItemDTO,
  type TaskDTO,
  toCalendarDTO,
  toTaskDTO,
} from "@/lib/calendar-types";
import { isCategory } from "@/lib/calendar-categories";
import { formatHM, sydneyInstant, sydneyParts } from "@/server/time";
import type { DB } from "../db/client";
import { calendarEvents, calendars, connections, settings, tasks } from "../db/schema";
import { busyOf, conflicts, type SchedItem } from "./conflicts";
import { expand, type Instance } from "./expand";
import { addDaysYmd, freeSlots, type FreeSlot, sydneyYmd, wakingWindow } from "./free-slots";
import { headline, planDay, type PlanTask, planSummary, type Why, weekStats } from "./plan";
import type { StoredEvent } from "./types";

export type View = "day" | "week" | "month";
const MIN = 60000;
const STALE_MS = 15 * MIN;
const MAX_RANGE_DAYS = 62;

const midnight = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return sydneyInstant(y, m, d, 0);
};
const monday = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return addDaysYmd(ymd, -((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7));
};

export function viewRange(view: View, ymd: string): { from: Date; to: Date; days: string[] } {
  let first = ymd;
  let n = 1;
  if (view === "week") {
    first = monday(ymd);
    n = 7;
  } else if (view === "month") {
    first = monday(`${ymd.slice(0, 7)}-01`);
    n = 42;
  }
  const days = Array.from({ length: n }, (_, i) => addDaysYmd(first, i));
  return { from: midnight(first), to: midnight(addDaysYmd(first, n)), days };
}

const iso = (d: Date) => d.toISOString();

type EventRow = typeof calendarEvents.$inferSelect;
const asStored = (r: EventRow): StoredEvent => ({
  id: r.id, calendarId: r.calendarId, remoteId: r.remoteId, url: r.url, etag: r.etag, title: r.title,
  description: r.description, location: r.location, startAt: r.startAt, endAt: r.endAt, allDay: r.allDay,
  startDate: r.startDate, endDate: r.endDate, tz: r.tz, recurrence: r.recurrence, recurringRemoteId: r.recurringRemoteId,
  originalStart: r.originalStart, status: r.status, transparency: r.transparency, declined: r.declined, raw: r.raw,
});

const sched = (i: { key: string; start: Date | string; end: Date | string; allDay: boolean; free: boolean; declined: boolean; status: string }): SchedItem => ({
  id: i.key,
  start: +new Date(i.start),
  end: +new Date(i.end),
  allDay: i.allDay,
  transparency: i.free ? "transparent" : "opaque",
  declined: i.declined,
  status: i.status as SchedItem["status"],
});

export async function loadInstances(h: DB, from: Date, to: Date): Promise<InstanceDTO[]> {
  const fromYmd = sydneyYmd(from);
  const toYmd = sydneyYmd(to);
  const rows = await h
    .select({ e: calendarEvents, c: calendars })
    .from(calendarEvents)
    .innerJoin(calendars, eq(calendars.id, calendarEvents.calendarId))
    .where(
      and(
        eq(calendars.enabled, true),
        isNotNull(calendars.category),
        or(
          isNotNull(calendarEvents.recurrence),
          isNotNull(calendarEvents.recurringRemoteId),
          sql`jsonb_exists(${calendarEvents.raw}, 'ics')`,
          and(lt(calendarEvents.startAt, to), gt(calendarEvents.endAt, from)),
          and(eq(calendarEvents.allDay, true), lt(calendarEvents.startDate, toYmd), gt(calendarEvents.endDate, fromYmd)),
        ),
      ),
    );
  const cals = new Map(rows.map((r) => [r.c.id, r.c]));
  const etags = new Map(rows.map((r) => [r.e.id, r.e.etag]));
  const live = expand(rows.map((r) => asStored(r.e)), from, to).filter((i) => !i.declined && i.status !== "cancelled");
  const conflictWith = new Map<string, string[]>();
  for (const c of conflicts(busyOf(live.map((i) => sched({ ...i, free: i.transparency === "transparent" }))))) {
    conflictWith.set(c.a, [...(conflictWith.get(c.a) ?? []), c.b]);
    conflictWith.set(c.b, [...(conflictWith.get(c.b) ?? []), c.a]);
  }
  return live
    .map((i: Instance): InstanceDTO => {
      const c = cals.get(i.calendarId)!;
      return {
        key: i.key, eventId: i.eventId, calendarId: i.calendarId, calendarName: c.name,
        category: isCategory(c.category) ? c.category : null,
        title: i.title, description: i.description, location: i.location,
        start: iso(i.start), end: iso(i.end), allDay: i.allDay, startDate: i.startDate, endDate: i.endDate, tz: i.tz,
        recurring: i.recurring, rrule: i.rrule, instanceStart: i.instanceStart,
        status: i.status as InstanceDTO["status"], free: i.transparency === "transparent", declined: i.declined,
        readOnly: c.access === "reader", etag: etags.get(i.eventId) ?? null, conflictWith: conflictWith.get(i.key) ?? [],
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start) || a.key.localeCompare(b.key));
}

export async function storedEvent(h: DB, eventId: string) {
  const [r] = await h
    .select({ e: calendarEvents, c: calendars })
    .from(calendarEvents)
    .innerJoin(calendars, eq(calendars.id, calendarEvents.calendarId))
    .where(eq(calendarEvents.id, eventId))
    .limit(1);
  return r ? { event: asStored(r.e), calendar: r.c } : null;
}

/** One occurrence of a recurring event by its instanceStart (canonical ISO instant or YYYY-MM-DD), or null. */
export async function occurrenceOf(h: DB, eventId: string, instanceStart: string): Promise<InstanceDTO | null> {
  const t = Date.parse(instanceStart);
  if (Number.isNaN(t)) return null;
  const list = await loadInstances(h, new Date(t - 86400000), new Date(t + 2 * 86400000));
  return list.find((x) => x.eventId === eventId && x.instanceStart === instanceStart) ?? null;
}

export async function listEvents(h: DB, fromYmd: string, toYmd: string, query?: string, limit = 50): Promise<InstanceDTO[]> {
  const last = addDaysYmd(fromYmd, MAX_RANGE_DAYS);
  const end = toYmd < last ? toYmd : last;
  const q = query?.trim().toLowerCase();
  const all = await loadInstances(h, midnight(fromYmd), midnight(addDaysYmd(end, 1)));
  return all.filter((i) => !q || i.title.toLowerCase().includes(q)).slice(0, Math.min(limit, 50));
}

export async function freeSlotsOn(h: DB, ymd: string, minMinutes: number, now: Date): Promise<FreeSlot[]> {
  const day = await loadInstances(h, midnight(ymd), midnight(addDaysYmd(ymd, 1)));
  return freeSlots(busyOf(day.map(sched)), wakingWindow(ymd), { now: now.getTime(), minMinutes });
}

const conflictDTOs = (inst: InstanceDTO[]): ConflictDTO[] => {
  const title = new Map(inst.map((i) => [i.key, i.title]));
  return conflicts(busyOf(inst.map(sched))).map((c) => ({
    a: c.a, b: c.b, aTitle: title.get(c.a) ?? "", bTitle: title.get(c.b) ?? "", start: iso(new Date(c.start)), end: iso(new Date(c.end)),
  }));
};

export async function conflictsIn(h: DB, from: Date, to: Date): Promise<ConflictDTO[]> {
  return conflictDTOs(await loadInstances(h, from, to));
}

export async function writableCalendars(h: DB): Promise<CalendarDTO[]> {
  const rows = await h
    .select()
    .from(calendars)
    .where(and(eq(calendars.enabled, true), isNotNull(calendars.category), inArray(calendars.access, ["owner", "writer"])))
    .orderBy(asc(calendars.name));
  return rows.map(toCalendarDTO);
}

export async function pickDefaultCalendar(h: DB): Promise<string | null> {
  const w = await writableCalendars(h);
  const [s] = await h.select().from(settings).where(eq(settings.key, "calendar.last_used")).limit(1);
  const last = typeof s?.value === "string" ? s.value : null;
  return (w.find((c) => c.id === last) ?? w.find((c) => c.isDefault) ?? w[0])?.id ?? null;
}

// ---- tasks ----
export async function loadTasks(h: DB, which: "today" | "open" | "completed", now: Date): Promise<TaskDTO[]> {
  if (which === "completed") {
    return (await h.select().from(tasks).where(isNotNull(tasks.completedAt)).orderBy(desc(tasks.completedAt)).limit(50)).map(toTaskDTO);
  }
  const today = sydneyYmd(now);
  const start = midnight(today);
  const end = midnight(addDaysYmd(today, 1));
  const open = isNull(tasks.completedAt);
  const where =
    which === "open"
      ? open
      : and(open, or(lt(tasks.dueAt, end), and(isNotNull(tasks.remindAt), gt(tasks.remindAt, new Date(start.getTime() - 1)), lt(tasks.remindAt, end))));
  const rows = await h.select().from(tasks).where(where).orderBy(sql`${tasks.dueAt} asc nulls last`, asc(tasks.createdAt));
  return rows.map(toTaskDTO);
}

// ---- page data ----
const dueLabel = (due: number, today: string) => {
  const d = new Date(due);
  return `${sydneyYmd(d) === today ? "today" : sydneyParts(d).weekday} ${formatHM(d)}`;
};
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

function whyText(w: Why, today: string): string {
  const p = w.params;
  const due = typeof p.due === "number" ? dueLabel(p.due, today) : "";
  switch (w.key) {
    case "due_first_slot":
      return `${due ? `Due ${due}. ` : ""}First free slot of ${p.minutes} minutes.`;
    case "priority_due":
      return `Priority ${p.priority}, due ${due}.`;
    case "only_block":
      return "Your only free block before it is due.";
    case "no_slot":
      return `No free slot before it is due (${due}). Move something or extend the deadline.`;
  }
}

export async function organizationData(h: DB, a: { view: View; date: string; now: Date }) {
  const { view, date, now } = a;
  const nowMs = now.getTime();
  const today = sydneyYmd(now);
  const range = viewRange(view, date);
  const week = viewRange("week", date);
  const [instances, weekInst, twoDay, conns, cals, todayT, openT, doneT, calendarsW, defaultCalendarId] = await Promise.all([
    loadInstances(h, range.from, range.to),
    view === "week" ? null : loadInstances(h, week.from, week.to),
    loadInstances(h, midnight(today), midnight(addDaysYmd(today, 2))),
    h.select().from(connections).where(inArray(connections.id, ["google_calendar", "icloud_calendar"])),
    h.select().from(calendars).where(eq(calendars.enabled, true)),
    loadTasks(h, "today", now),
    loadTasks(h, "open", now),
    loadTasks(h, "completed", now),
    writableCalendars(h),
    pickDefaultCalendar(h),
  ]);

  // state
  const connected = conns.length > 0;
  const last = conns.reduce<number | null>((m, c) => (c.lastSyncAt ? Math.max(m ?? 0, c.lastSyncAt.getTime()) : m), null);
  const bad = conns.find((c) => c.status === "error");
  const state = {
    connected,
    syncingCalendars: cals.filter((c) => c.lastSyncedAt === null).length,
    reconnect: (bad?.id as "google_calendar" | "icloud_calendar" | undefined) ?? null,
    stale: connected && (last === null || nowMs - last > STALE_MS),
    lastSyncAt: last === null ? null : new Date(last).toISOString(),
    lastError: bad?.lastError ?? conns.find((c) => c.lastSyncError)?.lastSyncError ?? null,
  };

  // header
  const stats = weekStats((weekInst ?? instances).map(sched), week.days, nowMs);
  const tomorrow = addDaysYmd(today, 1);
  const inDay = (d: string) => twoDay.filter((i) => sydneyYmd(new Date(i.start)) === d);
  const slotsOf = (d: string) => freeSlots(busyOf(inDay(d).map(sched)), wakingWindow(d));
  let head: string;
  if (!connected) head = "Your calendar, in one place.";
  else if (stats.events === 0) head = "Nothing scheduled.";
  else head = headline(slotsOf(today), slotsOf(tomorrow), nowMs) ?? "Your schedule is full today.";
  const n = stats.events;
  const lead = connected
    ? `Calendar, tasks and planning. ${n} ${n === 1 ? "event" : "events"} this week · ${stats.freeHours} free hours · ${
        stats.conflicts === 0 ? "No conflicts" : `${stats.conflicts} ${stats.conflicts === 1 ? "conflict" : "conflicts"}`
      }.`
    : "Connect a calendar to see your week. Tasks work without one.";

  // plan
  const win = wakingWindow(today);
  const dayEnd = midnight(tomorrow).getTime();
  const slots = freeSlots(connected ? busyOf(inDay(today).map(sched)) : [], win, { now: nowMs });
  const planTasks = openT.filter((t) => (t.dueAt ? Date.parse(t.dueAt) < dayEnd : t.priority === 1 || t.priority === 2));
  const byId = new Map(openT.map((t) => [t.id, t]));
  const pt: PlanTask[] = planTasks.map((t) => ({
    id: t.id, title: t.title, dueAt: t.dueAt ? Date.parse(t.dueAt) : null, dueHasTime: t.dueTime !== null,
    priority: t.priority, createdAt: Date.parse(t.createdAt),
  }));
  const placed = planDay({ tasks: pt, slots, dayEnd });
  const items: PlanItemDTO[] = placed.map((p) => ({
    id: `plan:${p.taskId}:${today}`,
    kind: p.kind,
    taskId: p.taskId,
    title: byId.get(p.taskId)?.title ?? "",
    start: p.kind === "task" ? new Date(p.start).toISOString() : null,
    end: p.kind === "task" ? new Date(p.end).toISOString() : null,
    why: cap(whyText(p.why, today)),
    dueAt: p.kind === "conflict" ? new Date(p.dueAt).toISOString() : byId.get(p.taskId)?.dueAt ?? null,
  }));
  const summary = planSummary({
    freeMinutes: Math.round(slots.reduce((s, x) => s + x.end - x.start, 0) / MIN),
    toPlace: placed.filter((p) => p.kind === "task").length,
    unplaced: placed.filter((p) => p.kind === "conflict").length,
    afterHours: nowMs >= win.end,
    open: openT.length,
  });

  return {
    range: { from: iso(range.from), to: iso(range.to), days: range.days },
    instances,
    conflicts: conflictDTOs(instances),
    tasks: { today: todayT, open: openT, completed: doneT },
    plan: { items, summary, tasksOnly: !connected },
    header: { headline: head, lead, ...stats },
    state,
    calendars: calendarsW,
    defaultCalendarId,
  };
}
