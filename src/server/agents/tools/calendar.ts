// Organization agent tools (D-19): READ tools over the synced calendar/tasks, and event writes that always go through approval.
// Everything here is owner-private (Tool.private): it taints the run so free models never see it (D-09).
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { eventCreatePayload, eventDeletePayload, eventFields, eventUpdatePayload } from "@/lib/event-payload";
import { formatHM, sydneyParts, TZ } from "@/server/time";
import { connections } from "../../db/schema";
import type { DB } from "../../db/client";
import { calendarById } from "../../calendar/calendars";
import { providerLabel } from "../../calendar/errors";
import { createEvent, deleteEvent, updateEvent, type WriteCtx, type WriteOutcome } from "../../calendar/events";
import { providerFor } from "../../calendar/providers";
import { addDaysYmd } from "../../calendar/free-slots";
import { conflictsIn, freeSlotsOn, listEvents, loadTasks, occurrenceOf, pickDefaultCalendar, storedEvent, viewRange } from "../../calendar/queries";
import { ToolError, type Tool, type ToolContext } from "../types";

const NOT_CONNECTED = "No calendar is connected yet, so I can't see your schedule. Connect Google Calendar or iCloud in Settings → Connections.";
const CANT_WRITE = "That calendar can't be written.";
const CHANGED = "This event changed after the request was prepared, so it can't be applied. Reject it and ask again.";
const GONE = "That event no longer exists.";
const MAX_STR = 500;
const cut = (s: string | null | undefined) => (s ?? "").slice(0, MAX_STR);

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const limit = z.number().int().min(1).max(50).default(20);

const listOut = z.object({ connected: z.boolean(), message: z.string().optional(), items: z.array(z.record(z.string(), z.unknown())) });
type ListOut = z.infer<typeof listOut>;

const mon = (d: Date) => new Intl.DateTimeFormat("en-AU", { timeZone: TZ, month: "short" }).format(d);
const day = (d: Date) => `${sydneyParts(d).weekday} ${sydneyParts(d).day} ${mon(d)}`;
/** "Thu 8 Oct 18:00-19:00" (Sydney) so the model never has to convert UTC. */
const when = (a: Date, b: Date) => `${day(a)} ${formatHM(a)}-${sydneyParts(b).day === sydneyParts(a).day ? "" : `${day(b)} `}${formatHM(b)}`;

async function hasCalendar(h: DB) {
  return (await h.select({ id: connections.id }).from(connections).where(inArray(connections.id, ["google_calendar", "icloud_calendar"]))).length > 0;
}

function calRead<I extends object>(
  name: string,
  label: string,
  description: string,
  input: z.ZodType<I>,
  run: (i: I, ctx: ToolContext) => Promise<Record<string, unknown>[]>,
  needsCalendar = true,
): Tool<I, ListOut> {
  return {
    name,
    label,
    description,
    input,
    output: listOut,
    tier: "READ",
    sideEffect: false,
    private: true,
    async handler(i, ctx) {
      if (needsCalendar && !(await hasCalendar(ctx.handle))) return { connected: false, message: NOT_CONNECTED, items: [] };
      return { connected: true, items: await run(i, ctx) };
    },
  };
}

const listEventsTool = calRead(
  "calendar.list_events",
  "Searching your calendar",
  "List calendar events (each occurrence of recurring events listed) from a Sydney date to another, optionally filtered by title text. Dates are YYYY-MM-DD.",
  z.object({ from: ymd, to: ymd.optional(), query: z.string().max(100).optional(), limit }),
  async (i, ctx) =>
    (await listEvents(ctx.handle, i.from, i.to ?? i.from, i.query, i.limit)).map((e) => ({
      id: e.eventId,
      instanceStart: e.instanceStart,
      calendar: cut(e.calendarName),
      category: e.category,
      title: cut(e.title),
      start: e.allDay ? e.startDate : e.start,
      end: e.allDay ? e.endDate : e.end,
      when: e.allDay ? `${day(new Date(e.start))} all day` : when(new Date(e.start), new Date(e.end)),
      allDay: e.allDay,
      location: cut(e.location),
      recurring: e.recurring,
      readOnly: e.readOnly,
    })),
);

const freeSlotsTool = calRead(
  "calendar.find_free_slots",
  "Finding free time",
  "Find free time between 08:00 and 22:00 Sydney on one date (YYYY-MM-DD), at least minMinutes long. Past time today is excluded.",
  z.object({ date: ymd, minMinutes: z.number().int().min(15).max(480).default(30) }),
  async (i, ctx) =>
    (await freeSlotsOn(ctx.handle, i.date, i.minMinutes, ctx.now())).map((s) => ({
      start: new Date(s.start).toISOString(),
      end: new Date(s.end).toISOString(),
      when: when(new Date(s.start), new Date(s.end)),
      minutes: Math.round((s.end - s.start) / 60000),
    })),
);

const conflictsTool = calRead(
  "calendar.detect_conflicts",
  "Checking for conflicts",
  "Find overlapping busy events from one date to another (YYYY-MM-DD, at most 62 days).",
  z.object({ from: ymd, to: ymd.optional() }),
  async (i, ctx) => {
    const last = addDaysYmd(i.from, 62);
    const to = i.to && i.to < last ? i.to : last;
    const r = await conflictsIn(ctx.handle, viewRange("day", i.from).from, viewRange("day", to).to);
    return r.slice(0, 50).map((c) => ({ a: cut(c.aTitle), b: cut(c.bTitle), start: c.start, end: c.end, when: when(new Date(c.start), new Date(c.end)) }));
  },
);

const tasksTool = calRead(
  "tasks.list",
  "Reading your tasks",
  "List LifeOS tasks: due today (plus overdue), all open, or recently completed.",
  z.object({ which: z.enum(["today", "open", "completed"]).default("today"), limit }),
  async (i, ctx) =>
    (await loadTasks(ctx.handle, i.which, ctx.now())).slice(0, i.limit).map((t) => ({
      id: t.id,
      title: cut(t.title),
      due: t.dueAt,
      priority: t.priority,
      completed: t.completedAt !== null,
    })),
  false,
);

// ---- writes ----
type CalRow = NonNullable<Awaited<ReturnType<typeof calendarById>>>;
const writable = (c: CalRow | null): c is CalRow => !!c && c.enabled && c.category !== null && (c.access === "owner" || c.access === "writer");
const target = (c: CalRow) => {
  const provider = c.connectionId === "google_calendar" ? ("google" as const) : ("icloud" as const);
  return { calendarId: c.id, calendarLabel: `${providerLabel(provider)} · ${c.name}`, provider };
};
const parseOr = <S extends z.ZodType>(schema: S, v: unknown): z.infer<S> => {
  const r = schema.safeParse(v);
  if (!r.success) throw new ToolError("invalid_input", r.error.issues[0]?.message ?? "Invalid event.");
  return r.data;
};
const wctx = (ctx: ToolContext): WriteCtx => ({
  actor: "agent",
  approvalId: ctx.approvalId,
  providerFor: (id, h) => providerFor(id, h, { fetch: ctx.fetch }),
  now: ctx.now,
});
const needApproval = (ctx: ToolContext) => {
  if (!ctx.approvalId) throw new ToolError("not_allowed", "Calendar changes require an approval.");
};
const fail = (o: Extract<WriteOutcome, { ok: false }>): never => {
  throw new ToolError(o.error === "changed" ? "unavailable" : "not_found", o.error === "changed" ? CHANGED : o.error === "read_only" ? CANT_WRITE : GONE);
};
const writeOut = z.object({ eventId: z.string(), calendarId: z.string(), start: z.string() });
type WriteOut = z.infer<typeof writeOut>;
const done = (o: Extract<WriteOutcome, { ok: true }>): WriteOut => ({ eventId: o.eventId, calendarId: o.calendarId, start: o.start });

const reason = z.string().max(500).optional();
const locked = {
  calendarId: z.uuid().optional(),
  calendarLabel: z.string().max(200).optional(), // always overwritten by resolve
  provider: z.enum(["google", "icloud"]).optional(), // always overwritten by resolve
};
const instanceIn = {
  eventId: z.uuid(),
  instanceStart: z.string().nullable().optional(),
  scope: z.enum(["this", "following", "all"]).optional(),
  etag: z.string().nullable().optional(), // always overwritten by resolve
};

const createInput = z.object({ ...eventFields.shape, ...locked, reason });
type CreateInput = z.infer<typeof createInput>;

const createEventTool: Tool<CreateInput, WriteOut> = {
  name: "calendar.create_event",
  label: "Preparing an event",
  description: "Propose a new, one-off calendar event. start/end are ISO instants with offset (or YYYY-MM-DD with exclusive end when allDay). Needs owner approval.",
  input: createInput,
  output: writeOut,
  tier: "APPROVE",
  sideEffect: true,
  private: true,
  async resolve(i, ctx) {
    const id = i.calendarId ?? (await pickDefaultCalendar(ctx.handle));
    const cal = id ? await calendarById(ctx.handle, id) : null;
    if (!writable(cal)) throw new ToolError("not_found", CANT_WRITE);
    const next = { ...i, ...target(cal) };
    parseOr(eventCreatePayload, withoutReason(next));
    return next;
  },
  toApproval({ reason: r, ...payload }) {
    return { payload: eventCreatePayload.parse(payload), reason: r ?? null };
  },
  async handler(i, ctx) {
    needApproval(ctx);
    const p = parseOr(eventCreatePayload, withoutReason(i));
    const o = await createEvent(ctx.handle, { calendarId: p.calendarId, input: p }, wctx(ctx));
    return o.ok ? done(o) : fail(o);
  },
};

function withoutReason<T extends { reason?: string }>(v: T): Omit<T, "reason"> {
  const rest = { ...v };
  delete rest.reason;
  return rest;
}

type Loaded = {
  cal: CalRow;
  event: NonNullable<Awaited<ReturnType<typeof storedEvent>>>["event"];
  scope: "this" | "following" | "all";
  instanceStart: string | null;
  now: { title: string; start: string; end: string; allDay: boolean; location: string; description: string; showAs: "busy" | "free" };
};

/** Fresh DB view of the target event/occurrence; the model only supplies ids. */
async function load(i: { eventId: string; scope?: Loaded["scope"]; instanceStart?: string | null }, ctx: ToolContext): Promise<Loaded> {
  const s = await storedEvent(ctx.handle, i.eventId);
  if (!s) throw new ToolError("not_found", GONE);
  if (!writable(s.calendar)) throw new ToolError("not_found", CANT_WRITE);
  const recurring = !!s.event.recurrence?.length || !!s.event.recurringRemoteId;
  const scope = recurring ? (i.scope ?? "this") : "all";
  const e = s.event;
  let now: Loaded["now"] = {
    title: e.title,
    start: e.allDay ? (e.startDate ?? "") : (e.startAt?.toISOString() ?? ""),
    end: e.allDay ? (e.endDate ?? "") : (e.endAt?.toISOString() ?? ""),
    allDay: e.allDay,
    location: e.location ?? "",
    description: e.description ?? "",
    showAs: e.transparency === "transparent" ? "free" : "busy",
  };
  let instanceStart: string | null = null;
  if (recurring && scope !== "all") {
    const raw = i.instanceStart ?? "";
    const t = Date.parse(raw);
    if (Number.isNaN(t)) throw new ToolError("invalid_input", "Give the instanceStart of the occurrence from list_events.");
    // Canonical form, so "…T08:00:00Z" and "…T08:00:00.000Z" both match the stored occurrence (IN-A05).
    instanceStart = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date(t).toISOString();
    const occ = await occurrenceOf(ctx.handle, i.eventId, instanceStart);
    if (!occ) throw new ToolError("not_found", "That occurrence no longer exists.");
    now = { ...now, start: occ.allDay ? (occ.startDate ?? "") : occ.start, end: occ.allDay ? (occ.endDate ?? "") : occ.end, allDay: occ.allDay, title: occ.title, location: occ.location ?? "", showAs: occ.free ? "free" : "busy" };
  }
  return { cal: s.calendar, event: e, scope, instanceStart, now };
}

const updateInput = z.object({
  ...instanceIn,
  ...locked,
  before: z.object({ title: z.string(), start: z.string(), end: z.string(), allDay: z.boolean(), location: z.string(), description: z.string(), showAs: z.string() }).optional(),
  title: eventFields.shape.title.optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  allDay: z.boolean().optional(),
  timeZone: z.string().optional(),
  location: z.string().max(300).optional(),
  description: z.string().max(8000).optional(),
  showAs: z.enum(["busy", "free"]).optional(),
  reason,
});
type UpdateInput = z.infer<typeof updateInput>;

const updateEventTool: Tool<UpdateInput, WriteOut> = {
  name: "calendar.update_event",
  label: "Preparing an event",
  description:
    "Propose changes to an existing event (id from list_events); send only the fields that change. For a recurring event pass instanceStart from list_events and scope this|following|all (default this). Needs owner approval.",
  input: updateInput,
  output: writeOut,
  tier: "APPROVE",
  sideEffect: true,
  private: true,
  async resolve(i, ctx) {
    const l = await load(i, ctx);
    // A changed allDay without new times would make start/end meaningless; the payload check below rejects it.
    const next = {
      ...i,
      ...target(l.cal),
      eventId: i.eventId,
      etag: l.event.etag,
      scope: l.scope,
      instanceStart: l.instanceStart,
      before: l.now,
      title: i.title ?? l.now.title,
      start: i.start ?? l.now.start,
      end: i.end ?? l.now.end,
      allDay: i.allDay ?? l.now.allDay,
      timeZone: i.timeZone ?? l.event.tz ?? TZ,
      location: i.location ?? l.now.location,
      description: i.description ?? l.now.description,
      showAs: i.showAs ?? l.now.showAs,
    };
    parseOr(eventUpdatePayload, withoutReason(next));
    return next;
  },
  toApproval({ reason: r, ...payload }) {
    return { payload: eventUpdatePayload.parse(payload), reason: r ?? null };
  },
  async handler(i, ctx) {
    needApproval(ctx);
    const p = parseOr(eventUpdatePayload, withoutReason(i));
    const args = { eventId: p.eventId, etag: p.etag, scope: p.scope, instanceStart: p.instanceStart, input: p };
    const o = await updateEvent(ctx.handle, args, wctx(ctx));
    if (o.ok) return done(o);
    // Ambiguous retry: an earlier attempt may have landed (new etag, our values); adopt it instead of failing (AGT-03).
    // ponytail: only non-recurring events are compared; a retried recurring edit reports "changed".
    if (o.error === "changed" && ctx.adopt && p.scope === "all") {
      const s = await storedEvent(ctx.handle, p.eventId);
      const e = s?.event;
      const same =
        !!e &&
        !e.recurrence?.length &&
        e.title === p.title &&
        (e.location ?? "") === p.location &&
        (e.description ?? "") === p.description &&
        e.allDay === p.allDay &&
        (p.allDay ? e.startDate === p.start && e.endDate === p.end : e.startAt?.getTime() === Date.parse(p.start) && e.endAt?.getTime() === Date.parse(p.end)) &&
        (e.transparency === "transparent" ? "free" : "busy") === p.showAs;
      if (same && s) return { eventId: e.id, calendarId: s.calendar.id, start: p.start };
    }
    return fail(o);
  },
};

const deleteInput = z.object({
  ...instanceIn,
  ...locked,
  title: z.string().max(200).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  allDay: z.boolean().optional(),
  reason,
});
type DeleteInput = z.infer<typeof deleteInput>;

const deleteEventTool: Tool<DeleteInput, WriteOut> = {
  name: "calendar.delete_event",
  label: "Preparing to delete an event",
  description: "Propose deleting an event (id from list_events). For a recurring event pass instanceStart and scope this|following|all. High risk: always needs owner approval.",
  input: deleteInput,
  output: writeOut,
  tier: "HIGH_RISK",
  sideEffect: true,
  private: true,
  async resolve(i, ctx) {
    const l = await load(i, ctx);
    const next = { ...i, ...target(l.cal), etag: l.event.etag, scope: l.scope, instanceStart: l.instanceStart, title: l.now.title.slice(0, 200), start: l.now.start, end: l.now.end, allDay: l.now.allDay };
    parseOr(eventDeletePayload, withoutReason(next));
    return next;
  },
  toApproval({ reason: r, ...payload }) {
    return { payload: eventDeletePayload.parse(payload), reason: r ?? null };
  },
  async handler(i, ctx) {
    needApproval(ctx);
    const p = parseOr(eventDeletePayload, withoutReason(i));
    const o = await deleteEvent(ctx.handle, { eventId: p.eventId, etag: p.etag, scope: p.scope, instanceStart: p.instanceStart }, wctx(ctx));
    if (o.ok) return done(o);
    // Retry after a delete that already landed: the event is gone, which is the goal.
    if (o.error === "not_found" && ctx.adopt) return { eventId: p.eventId, calendarId: p.calendarId, start: p.start };
    return fail(o);
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous tool map; each tool validates its own I/O via zod
export const calendarTools: Record<string, Tool<any, any>> = Object.fromEntries(
  [listEventsTool, freeSlotsTool, conflictsTool, tasksTool, createEventTool, updateEventTool, deleteEventTool].map((t) => [t.name, t]),
);
