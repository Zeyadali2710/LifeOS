// OUT-02 pipeline: owner writes go direct and are audited (ids and stages only, never titles). Server only.
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { canMove, STAGE, type Stage } from "../../lib/outreach-types";
import { ProviderError } from "../calendar/errors";
import { createEvent, deleteEvent, type WriteCtx } from "../calendar/events";
import { pickDefaultCalendar } from "../calendar/queries";
import type { DB } from "../db/client";
import { auditLog, calendarEvents, outreachEvents, tasks } from "../db/schema";
import { emitActivity, notifyLive } from "../events";
import { log } from "../log";
import { createTask } from "../tasks";

async function aud(h: DB, action: string, id: string, metadata: Record<string, unknown>) {
  try {
    await h.insert(auditLog).values({ actor: "owner", action, target: id, metadata });
  } catch (err) {
    log.error({ err, action }, "audit write failed");
  }
}

const label = (s: Stage | null) => (s ? STAGE[s].label : "Discovered");
const row = async (h: DB, id: string) => (await h.select().from(outreachEvents).where(eq(outreachEvents.id, id)))[0];
const stageAct = (h: DB, from: Stage | null, to: Stage | null, title: string) => emitActivity({ type: "outreach.stage", source: "outreach", title: `${label(from)} → ${label(to)}`, detail: title }, undefined, h);

export type MoveResult = { ok: true } | { ok: false; error: "invalid" | "changed" | "not_found" };

export async function moveStage(h: DB, id: string, from: Stage | null, to: Stage | null, now: Date): Promise<MoveResult> {
  if (!canMove(from, to) || to === "FOLLOW_UP") return { ok: false, error: "invalid" };
  const [r] = await h
    .update(outreachEvents)
    .set({ stage: to, stageChangedAt: now, updatedAt: now })
    .where(and(eq(outreachEvents.id, id), from === null ? isNull(outreachEvents.stage) : eq(outreachEvents.stage, from), isNull(outreachEvents.dismissedAt)))
    .returning({ title: outreachEvents.title });
  if (!r) return { ok: false, error: (await row(h, id)) ? "changed" : "not_found" };
  await aud(h, "outreach.stage", id, { id, from, to });
  await stageAct(h, from, to, r.title);
  await notifyLive(h, "outreach", id);
  return { ok: true };
}

export type DismissResult = { ok: true } | { ok: false; error: "invalid" | "not_found" };

async function setDismissed(h: DB, id: string, on: boolean, now: Date): Promise<DismissResult> {
  const [r] = await h
    .update(outreachEvents)
    .set({ dismissedAt: on ? now : null, updatedAt: now })
    .where(and(eq(outreachEvents.id, id), isNull(outreachEvents.stage), on ? isNull(outreachEvents.dismissedAt) : isNotNull(outreachEvents.dismissedAt)))
    .returning({ id: outreachEvents.id });
  if (!r) {
    const cur = await row(h, id);
    if (!cur) return { ok: false, error: "not_found" };
    if (cur.stage !== null) return { ok: false, error: "invalid" };
    return { ok: true }; // already in the requested state
  }
  await aud(h, on ? "outreach.dismiss" : "outreach.restore", id, { id });
  await notifyLive(h, "outreach", id);
  return { ok: true };
}
export const dismissEvent = (h: DB, id: string, now: Date) => setDismissed(h, id, true, now);
export const restoreEvent = (h: DB, id: string, now: Date) => setDismissed(h, id, false, now);

export type CalendarResult =
  | { ok: true; eventId: string; calendarName: string }
  | { ok: false; error: "mock" | "invalid" | "linked" | "no_calendar" | "not_found" | "reconnect" | "provider" | "read_only" | "changed" };

const ymd = (d: Date, tz: string) => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return p; // YYYY-MM-DD
};

export async function addToCalendar(h: DB, id: string, calendarId: string | null, ctx: WriteCtx): Promise<CalendarResult> {
  // (1) validate under a short lock; no provider call inside this transaction.
  const v = await h.transaction(async (tx) => {
    const [r] = await tx.select().from(outreachEvents).where(eq(outreachEvents.id, id)).for("update");
    if (!r) return { error: "not_found" as const };
    if (r.isMock) return { error: "mock" as const };
    if (r.stage !== "ATTENDING" && r.stage !== "ATTENDED" && r.stage !== "FOLLOW_UP") return { error: "invalid" as const };
    if (r.calendarEventId) return { error: "linked" as const };
    const cal = calendarId ?? (await pickDefaultCalendar(tx as unknown as DB));
    if (!cal) return { error: "no_calendar" as const };
    return { r, cal, error: undefined };
  });
  if (v.error) return { ok: false, error: v.error };
  const { r, cal } = v as { r: NonNullable<typeof v.r>; cal: string };

  const tz = r.timeZone ?? "Australia/Sydney";
  const end = r.endAt ?? new Date(r.startAt.getTime() + 2 * 3600_000);
  let start: string;
  let finish: string;
  if (r.allDay) {
    start = ymd(r.startAt, tz);
    finish = ymd(end, tz);
    if (finish <= start) finish = ymd(new Date(r.startAt.getTime() + 36 * 3600_000), tz);
  } else {
    start = r.startAt.toISOString();
    finish = end.toISOString();
  }
  const description = [r.url ?? "", r.description.slice(0, 2000)].filter(Boolean).join("\n\n");

  // (2) provider write, outside any transaction.
  let made: Awaited<ReturnType<typeof createEvent>>;
  try {
    made = await createEvent(h, { calendarId: cal, input: { title: r.title.slice(0, 200), start, end: finish, allDay: r.allDay, timeZone: tz, location: (r.location ?? "").slice(0, 300), description, showAs: "busy" } }, { ...ctx, actor: "owner" });
  } catch (err) {
    if (err instanceof ProviderError) return { ok: false, error: err.kind === "auth" ? "reconnect" : "provider" };
    throw err;
  }
  if (!made.ok) return { ok: false, error: made.error };

  // (3) link only if nobody else did meanwhile; the loser removes its own remote event.
  const [linked] = await h
    .update(outreachEvents)
    .set({ calendarEventId: made.eventId, updatedAt: ctx.now() })
    .where(and(eq(outreachEvents.id, id), isNull(outreachEvents.calendarEventId)))
    .returning({ id: outreachEvents.id });
  if (!linked) {
    try {
      const [ce] = await h.select({ etag: calendarEvents.etag }).from(calendarEvents).where(eq(calendarEvents.id, made.eventId));
      await deleteEvent(h, { eventId: made.eventId, etag: ce?.etag ?? null, scope: "all", instanceStart: null }, { ...ctx, actor: "owner" });
    } catch (err) {
      log.error({ err }, "outreach duplicate calendar cleanup failed");
    }
    return { ok: false, error: "linked" };
  }
  await aud(h, "outreach.calendar", id, { id, calendarEventId: made.eventId });
  await notifyLive(h, "outreach", id);
  return { ok: true, eventId: made.eventId, calendarName: made.calendarName };
}

export type FollowUpResult =
  | { ok: true; count: number }
  | { ok: false; error: "invalid" | "mock" | "changed" | "not_found" }
  | { ok: false; errors: Record<string, string> };

class Rollback extends Error {
  constructor(public errors: Record<string, string>) {
    super("rollback");
  }
}

export async function createFollowUps(h: DB, id: string, lines: { title: string; dueDate: string | null }[], now: Date): Promise<FollowUpResult> {
  if (lines.length < 1 || lines.length > 10) return { ok: false, error: "invalid" };
  try {
    const out = await h.transaction(async (tx) => {
      const [r] = await tx.select().from(outreachEvents).where(eq(outreachEvents.id, id)).for("update");
      if (!r) return { error: "not_found" as const };
      if (r.isMock) return { error: "mock" as const };
      if (r.stage !== "ATTENDED" || r.dismissedAt) return { error: "changed" as const };
      const notes = `From event: ${r.title}${r.url ? ` · ${r.url}` : ""}`;
      for (const [i, l] of lines.entries()) {
        const t = await createTask(tx as unknown as DB, { title: l.title, dueDate: l.dueDate, priority: 2, notes }, now);
        if (!t.ok) throw new Rollback(Object.fromEntries(Object.entries(t.errors).map(([k, m]) => [`lines.${i}.${k}`, m])));
        await tx.update(tasks).set({ outreachEventId: id }).where(eq(tasks.id, t.task.id));
      }
      await tx.update(outreachEvents).set({ stage: "FOLLOW_UP", stageChangedAt: now, updatedAt: now }).where(eq(outreachEvents.id, id));
      return { title: r.title, error: undefined };
    });
    if (out.error) return { ok: false, error: out.error };
    await aud(h, "outreach.follow_up", id, { id, from: "ATTENDED", to: "FOLLOW_UP", count: lines.length });
    await stageAct(h, "ATTENDED", "FOLLOW_UP", out.title ?? "");
    await notifyLive(h, "outreach", id);
    return { ok: true, count: lines.length };
  } catch (err) {
    if (err instanceof Rollback) return { ok: false, errors: err.errors };
    throw err;
  }
}
