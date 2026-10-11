"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { eventFields, eventInput } from "../lib/event-payload";
import { calendarById } from "./calendar/calendars";
import { createEvent, deleteEvent, updateEvent, type WriteCtx, type WriteOutcome } from "./calendar/events";
import { ProviderError, type ProviderName } from "./calendar/errors";
import { providerFor } from "./calendar/providers";
import { occurrenceOf, pickDefaultCalendar, storedEvent } from "./calendar/queries";
import { db } from "./db/client";
import { tasks } from "./db/schema";
import { log } from "./log";
import { enqueue, QUEUES } from "./queue";
import { requireOwner } from "./session";

type Written = Extract<WriteOutcome, { ok: true }>;
type Fail =
  | { ok: false; errors: Record<string, string> }
  | { ok: false; error: "changed" | "reconnect" | "provider" | "not_found" | "read_only"; provider: ProviderName | null };
export type EventActionResult = { ok: true; eventId: string; calendarName: string; start: string; overlaps: Written["overlaps"] } | Fail;

const ctx = (): WriteCtx => ({ actor: "owner", providerFor, now: () => new Date() });
const ids = z.object({ eventId: z.uuid(), etag: z.string().nullable(), scope: z.enum(["this", "following", "all"]), instanceStart: z.string().nullable() });

const fieldErrors = (e: z.ZodError): Fail => {
  const errors: Record<string, string> = {};
  for (const i of e.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
  return { ok: false, errors };
};

async function providerOfEvent(eventId: string): Promise<ProviderName | null> {
  const s = await storedEvent(db(), eventId);
  return s ? (s.calendar.connectionId === "google_calendar" ? "google" : "icloud") : null;
}

// Runs a write and maps the outcome to the fixed codes the UI renders (never provider text).
async function run(prov: () => Promise<ProviderName | null>, f: () => Promise<WriteOutcome>): Promise<EventActionResult> {
  try {
    const r = await f();
    if (r.ok) return { ok: true, eventId: r.eventId, calendarName: r.calendarName, start: r.start, overlaps: r.overlaps };
    return { ok: false, error: r.error, provider: await prov() };
  } catch (err) {
    if (err instanceof ProviderError) {
      const error = err.kind === "auth" ? "reconnect" : err.kind === "conflict" ? "changed" : "provider";
      return { ok: false, error, provider: err.provider };
    }
    log.error({ err }, "calendar action failed");
    return { ok: false, error: "provider", provider: await prov().catch(() => null) };
  }
}

const providerOfCalendar = async (calendarId: string): Promise<ProviderName | null> => {
  const c = await calendarById(db(), calendarId);
  return c ? (c.connectionId === "google_calendar" ? "google" : "icloud") : null;
};

export async function createEventAction(raw: unknown): Promise<EventActionResult> {
  await requireOwner();
  const p = eventInput.safeParse(raw);
  if (!p.success) return fieldErrors(p.error);
  const { calendarId, ...input } = p.data;
  return run(() => providerOfCalendar(calendarId), () => createEvent(db(), { calendarId, input }, ctx()));
}

export async function updateEventAction(raw: unknown): Promise<EventActionResult> {
  await requireOwner();
  const t = ids.safeParse(raw);
  if (!t.success) return fieldErrors(t.error);
  // The calendar of an existing event never moves, so the form need not send it.
  const p = eventInput.safeParse({ calendarId: t.data.eventId, ...(raw as object) });
  if (!p.success) return fieldErrors(p.error);
  const { calendarId: _ignored, ...input } = p.data;
  void _ignored;
  return run(() => providerOfEvent(t.data.eventId), () => updateEvent(db(), { ...t.data, input }, ctx()));
}

export async function deleteEventAction(raw: unknown): Promise<EventActionResult> {
  await requireOwner();
  const t = ids.safeParse(raw);
  if (!t.success) return fieldErrors(t.error);
  return run(() => providerOfEvent(t.data.eventId), () => deleteEvent(db(), t.data, ctx()));
}

export type ReloadResult =
  | { ok: true; title: string; start: string; end: string; allDay: boolean; location: string; description: string; showAs: "busy" | "free"; etag: string | null; rrule: string | null }
  | { ok: false; error: "not_found" };

/** Fresh copy of an event. For a recurring occurrence pass its instanceStart: the form must get that occurrence's times, never the series master's. */
export async function reloadEventAction(rawId: unknown, rawInstanceStart?: unknown): Promise<ReloadResult> {
  await requireOwner();
  const id = z.uuid().safeParse(rawId);
  if (!id.success) return { ok: false, error: "not_found" };
  const s = await storedEvent(db(), id.data);
  if (!s) return { ok: false, error: "not_found" };
  const e = s.event;
  const rrule = e.recurrence?.find((l) => /^RRULE:/i.test(l))?.slice(6) ?? null;
  if (typeof rawInstanceStart === "string" && rawInstanceStart) {
    const o = await occurrenceOf(db(), id.data, rawInstanceStart.slice(0, 40));
    if (!o) return { ok: false, error: "not_found" };
    return {
      ok: true,
      title: o.title,
      start: o.allDay ? (o.startDate ?? "") : o.start,
      end: o.allDay ? (o.endDate ?? "") : o.end,
      allDay: o.allDay,
      location: o.location ?? "",
      description: o.description ?? "",
      showAs: o.free ? "free" : "busy",
      etag: e.etag,
      rrule,
    };
  }
  return {
    ok: true,
    title: e.title,
    start: e.allDay ? (e.startDate ?? "") : (e.startAt?.toISOString() ?? ""),
    end: e.allDay ? (e.endDate ?? "") : (e.endAt?.toISOString() ?? ""),
    allDay: e.allDay,
    location: e.location ?? "",
    description: e.description ?? "",
    showAs: e.transparency === "transparent" ? "free" : "busy",
    etag: e.etag,
    rrule,
  };
}

const plan = z.object({ taskId: z.uuid(), start: z.iso.datetime(), end: z.iso.datetime(), calendarId: z.uuid().optional() });

/** D-17: puts a plan item on a calendar. The task itself is left untouched. */
export async function addPlanItemAction(raw: unknown): Promise<EventActionResult> {
  await requireOwner();
  const p = plan.safeParse(raw);
  if (!p.success) return fieldErrors(p.error);
  const [task] = await db().select({ title: tasks.title }).from(tasks).where(eq(tasks.id, p.data.taskId));
  if (!task) return { ok: false, error: "not_found", provider: null };
  const calendarId = p.data.calendarId ?? (await pickDefaultCalendar(db()));
  if (!calendarId) return { ok: false, error: "read_only", provider: null };
  const input = eventFields.safeParse({ title: task.title.slice(0, 200), start: p.data.start, end: p.data.end });
  if (!input.success) return fieldErrors(input.error);
  return run(() => providerOfCalendar(calendarId), () => createEvent(db(), { calendarId, input: input.data }, ctx()));
}

export async function syncCalendarsNowAction(): Promise<{ ok: boolean }> {
  await requireOwner();
  try {
    await enqueue(QUEUES.calendarSync, {}, { singletonKey: "calendar.sync" });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
