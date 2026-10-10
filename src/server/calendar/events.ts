// The single calendar write service (D-06): owner actions and approved agent writes both land here.
// Direct write + audit, stale-etag refusal (T-04-39), no event text in audit metadata (T-04-40).
import { and, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import type { eventFields, EventInput } from "../../lib/event-payload";
import type { DB } from "../db/client";
import { auditLog, calendarEvents } from "../db/schema";
import { notifyLive } from "../events";
import { log } from "../log";
import { calendarById, calendarRef, setLastUsedCalendar } from "./calendars";
import { markCalendarError } from "./connections";
import { ProviderError } from "./errors";
import type { providerFor } from "./providers";
import { loadInstances, storedEvent } from "./queries";
import type { CalendarProvider, CalendarRef, EventWrite, NormalizedEvent, WriteResult, WriteScope } from "./types";

export type WriteCtx = { actor: "owner" | "agent"; approvalId?: string; providerFor: typeof providerFor; now: () => Date };
export type EventFieldsLike = z.infer<typeof eventFields> & { repeat?: EventInput["repeat"] };
type Target = { eventId: string; etag: string | null; scope: WriteScope; instanceStart: string | null };

export type WriteOk = {
  ok: true;
  eventId: string;
  remoteId: string;
  calendarId: string;
  calendarName: string;
  start: string;
  overlaps: { title: string; start: string } | null;
};
export type WriteFail = { ok: false; error: "read_only" | "changed" | "not_found" };
export type WriteOutcome = WriteOk | WriteFail;

type CalRow = NonNullable<Awaited<ReturnType<typeof calendarById>>>;
const writable = (c: CalRow | null): c is CalRow => !!c && c.enabled && c.category !== null && (c.access === "owner" || c.access === "writer");

async function aud(h: DB, ctx: WriteCtx, action: string, id: string, metadata: Record<string, unknown>) {
  try {
    await h.insert(auditLog).values({ actor: ctx.actor, action, target: id, metadata: { ...metadata, actor: ctx.actor, ...(ctx.approvalId ? { approvalId: ctx.approvalId } : {}) } });
  } catch (err) {
    log.error({ err, action }, "audit write failed");
  }
}

const rowOf = (calendarId: string, e: NormalizedEvent) => ({ calendarId, ...e, raw: e.raw ?? {} });

async function apply(h: DB, calendarId: string, r: WriteResult, now: Date) {
  await h.transaction(async (tx) => {
    for (const e of r.upserts) {
      const row = rowOf(calendarId, e);
      await tx.insert(calendarEvents).values(row).onConflictDoUpdate({ target: [calendarEvents.calendarId, calendarEvents.remoteId], set: { ...row, updatedAt: now } });
    }
    if (r.deletes.length) await tx.delete(calendarEvents).where(and(eq(calendarEvents.calendarId, calendarId), inArray(calendarEvents.remoteId, r.deletes)));
  });
}

function toWrite(input: EventFieldsLike, ctx: WriteCtx, kind: "create" | "update"): EventWrite {
  const asked = ctx.actor === "agent" ? "none" : (input.repeat ?? "none");
  // "custom" is a rule the form cannot express; on update it means leave the existing rule alone.
  const repeat = asked === "custom" ? (kind === "update" ? "keep" : "none") : asked;
  return {
    title: input.title,
    start: input.start,
    end: input.end,
    allDay: input.allDay,
    timeZone: input.timeZone || "Australia/Sydney",
    location: input.location,
    description: input.description,
    showAs: input.showAs,
    repeat,
    marker: ctx.approvalId ?? null,
  };
}

/** Busy instance overlapping the written event (D-14 detection only, never blocks). */
async function overlapOf(h: DB, eventId: string, w: EventWrite): Promise<WriteOk["overlaps"]> {
  if (w.showAs === "free") return null;
  const from = w.allDay ? new Date(`${w.start}T00:00:00Z`) : new Date(w.start);
  const to = w.allDay ? new Date(`${w.end}T00:00:00Z`) : new Date(w.end);
  const inst = await loadInstances(h, from, to);
  const mine = inst.find((i) => i.eventId === eventId);
  if (!mine || mine.free) return null;
  const other = inst.find((i) => i.eventId !== eventId && !i.free && !i.allDay && !mine.allDay && i.start < mine.end && mine.start < i.end);
  return other ? { title: other.title, start: other.start } : null;
}

// Auth failures pause the connection; every ProviderError is rethrown for the caller to map.
async function guard<T>(h: DB, cal: CalendarRef, f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof ProviderError && e.kind === "auth") await markCalendarError(h, cal.connectionId, "Access was rejected.");
    throw e;
  }
}

export async function createEvent(h: DB, args: { calendarId: string; input: EventFieldsLike }, ctx: WriteCtx): Promise<WriteOutcome> {
  const cal = await calendarById(h, args.calendarId);
  if (!writable(cal)) return { ok: false, error: "read_only" };
  const ref = calendarRef(cal);
  const provider: CalendarProvider = await ctx.providerFor(ref.connectionId, h);
  const w = toWrite(args.input, ctx, "create");
  // Deterministic id per approval: a retried approved create adopts the first attempt's event (AGT-03).
  const remoteId = ctx.approvalId ? (ref.connectionId === "google_calendar" ? `lifeos${ctx.approvalId.replaceAll("-", "")}` : `${ctx.approvalId}@lifeos`) : undefined;
  const r = await guard(h, ref, () => provider.create(ref, w, remoteId ? { remoteId } : undefined));
  await apply(h, cal.id, r, ctx.now());
  const made = r.upserts[0];
  const [row] = made ? await h.select({ id: calendarEvents.id }).from(calendarEvents).where(and(eq(calendarEvents.calendarId, cal.id), eq(calendarEvents.remoteId, made.remoteId))) : [];
  if (!made || !row) throw new Error("provider returned no event");
  await setLastUsedCalendar(h, cal.id);
  await aud(h, ctx, "calendar.event.create", row.id, { calendarId: cal.id, eventId: row.id });
  await notifyLive(h, "calendar", cal.connectionId);
  return { ok: true, eventId: row.id, remoteId: made.remoteId, calendarId: cal.id, calendarName: cal.name, start: w.start, overlaps: await overlapOf(h, row.id, w) };
}

export async function updateEvent(h: DB, args: Target & { input: EventFieldsLike }, ctx: WriteCtx): Promise<WriteOutcome> {
  const s = await storedEvent(h, args.eventId);
  if (!s) return { ok: false, error: "not_found" };
  if (!writable(s.calendar)) return { ok: false, error: "read_only" };
  if (args.etag !== s.event.etag) return { ok: false, error: "changed" };
  const ref = calendarRef(s.calendar);
  const provider = await ctx.providerFor(ref.connectionId, h);
  const w = toWrite(args.input, ctx, "update");
  const r = await guard(h, ref, () => provider.update(ref, s.event, w, args.scope, args.instanceStart));
  await apply(h, s.calendar.id, r, ctx.now());
  await aud(h, ctx, "calendar.event.update", args.eventId, { calendarId: s.calendar.id, eventId: args.eventId, scope: args.scope });
  await notifyLive(h, "calendar", ref.connectionId);
  return { ok: true, eventId: args.eventId, remoteId: s.event.remoteId, calendarId: s.calendar.id, calendarName: s.calendar.name, start: w.start, overlaps: await overlapOf(h, args.eventId, w) };
}

export async function deleteEvent(h: DB, args: Target, ctx: WriteCtx): Promise<WriteOutcome> {
  const s = await storedEvent(h, args.eventId);
  if (!s) return { ok: false, error: "not_found" };
  if (!writable(s.calendar)) return { ok: false, error: "read_only" };
  if (args.etag !== s.event.etag) return { ok: false, error: "changed" };
  const ref = calendarRef(s.calendar);
  const provider = await ctx.providerFor(ref.connectionId, h);
  const r = await guard(h, ref, () => provider.remove(ref, s.event, args.scope, args.instanceStart));
  await apply(h, s.calendar.id, r, ctx.now());
  await aud(h, ctx, "calendar.event.delete", args.eventId, { calendarId: s.calendar.id, eventId: args.eventId, scope: args.scope });
  await notifyLive(h, "calendar", ref.connectionId);
  const start = s.event.startAt?.toISOString() ?? s.event.startDate ?? "";
  return { ok: true, eventId: args.eventId, remoteId: s.event.remoteId, calendarId: s.calendar.id, calendarName: s.calendar.name, start, overlaps: null };
}
