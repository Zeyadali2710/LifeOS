import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { toTaskDTO, type TaskDTO } from "@/lib/calendar-types";
import { taskInput } from "@/lib/task-payload";
import type { FieldErrors } from "./agents/approvals";
import type { DB } from "./db/client";
import { auditLog, tasks } from "./db/schema";
import { emitActivity, notifyLive } from "./events";
import { log } from "./log";
import { sydneyInstant, sydneyParts } from "./time";

export type TaskResult = { ok: true; task: TaskDTO } | { ok: false; errors: FieldErrors };

// Audit via the caller's handle; metadata is {id} only (no titles or notes).
async function aud(h: DB, action: string, id: string) {
  try {
    await h.insert(auditLog).values({ actor: "owner", action, target: id, metadata: { id } });
  } catch (err) {
    log.error({ err, action }, "audit write failed");
  }
}

/** Sydney dueDate (+ optional HH:mm) -> instant; date-only means end of day (23:59). */
export function deriveDueAt(dueDate: string | null, dueTime: string | null): Date | null {
  if (!dueDate) return null;
  const [y, m, d] = dueDate.split("-").map(Number) as [number, number, number];
  const [hh, mm] = dueTime ? (dueTime.split(":").map(Number) as [number, number]) : [23, 59];
  return sydneyInstant(y, m, d, hh, mm);
}

function parse(raw: unknown, now: Date, prevRemindAt?: Date | null) {
  const p = taskInput.safeParse(raw);
  const errors: FieldErrors = {};
  if (!p.success) {
    for (const i of p.error.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
    return { errors };
  }
  const remindAt = p.data.remindAt ? new Date(p.data.remindAt) : null;
  // An unchanged (possibly already-past) reminder must not block editing other fields.
  const changed = remindAt?.getTime() !== prevRemindAt?.getTime();
  if (remindAt && changed && remindAt.getTime() <= now.getTime()) errors.remindAt = "Reminder must be in the future.";
  return Object.keys(errors).length ? { errors } : { data: p.data, remindAt };
}

export async function createTask(h: DB, raw: unknown, now: Date): Promise<TaskResult> {
  const p = parse(raw, now);
  if (!p.data) return { ok: false, errors: p.errors! };
  const { data } = p;
  const [row] = await h
    .insert(tasks)
    .values({
      title: data.title,
      notes: data.notes,
      dueDate: data.dueDate,
      dueTime: data.dueTime,
      dueAt: deriveDueAt(data.dueDate, data.dueTime),
      priority: data.priority,
      remindAt: p.remindAt,
    })
    .returning();
  await aud(h, "task.create", row!.id);
  await notifyLive(h, "task", row!.id);
  return { ok: true, task: toTaskDTO(row!) };
}

export async function updateTask(h: DB, id: string, raw: unknown, now: Date): Promise<TaskResult | { ok: false; error: "not_found" }> {
  const [cur] = await h.select().from(tasks).where(eq(tasks.id, id));
  if (!cur) return { ok: false, error: "not_found" };
  const p = parse(raw, now, cur.remindAt);
  if (!p.data) return { ok: false, errors: p.errors! };
  const { data } = p;
  const rearm = p.remindAt?.getTime() !== cur.remindAt?.getTime();
  const [row] = await h
    .update(tasks)
    .set({
      title: data.title,
      notes: data.notes,
      dueDate: data.dueDate,
      dueTime: data.dueTime,
      dueAt: deriveDueAt(data.dueDate, data.dueTime),
      priority: data.priority,
      remindAt: p.remindAt,
      ...(rearm ? { remindedAt: null } : {}),
      updatedAt: now,
    })
    .where(eq(tasks.id, id))
    .returning();
  await aud(h, "task.update", id);
  await notifyLive(h, "task", id);
  return { ok: true, task: toTaskDTO(row!) };
}

export async function setTaskCompleted(h: DB, id: string, done: boolean, now: Date): Promise<{ ok: true; task: TaskDTO } | { ok: false; error: "not_found" }> {
  // Reopening disarms a reminder whose time passed while the task was done (it would otherwise fire at once, stale).
  const disarm = done ? {} : { remindedAt: sql`case when ${tasks.remindAt} <= ${now} then coalesce(${tasks.remindedAt}, ${now}) else ${tasks.remindedAt} end` };
  const [row] = await h.update(tasks).set({ completedAt: done ? now : null, ...disarm, updatedAt: now }).where(eq(tasks.id, id)).returning();
  if (!row) return { ok: false, error: "not_found" };
  await aud(h, done ? "task.complete" : "task.reopen", id);
  await notifyLive(h, "task", id);
  return { ok: true, task: toTaskDTO(row) };
}

export async function deleteTask(h: DB, id: string): Promise<{ ok: boolean }> {
  const del = await h.delete(tasks).where(eq(tasks.id, id)).returning({ id: tasks.id });
  if (!del.length) return { ok: false };
  await aud(h, "task.delete", id);
  await notifyLive(h, "task", id);
  return { ok: true };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dueBody(r: { dueDate: string | null; dueTime: string | null; dueAt: Date | null }, now: Date): string {
  if (!r.dueDate || !r.dueAt) return "No due date.";
  const p = sydneyParts(r.dueAt);
  const day = `${p.weekday} ${p.day} ${MONTHS[p.month - 1]}`;
  if (r.dueTime) return `Due ${day} ${r.dueTime}.`;
  const n = sydneyParts(now);
  const today = `${n.year}-${String(n.month).padStart(2, "0")}-${String(n.day).padStart(2, "0")}`;
  return r.dueDate === today ? "Due today." : `Due ${day}.`;
}

/**
 * Claim due, unreminded, open tasks in one UPDATE ... RETURNING (no double-fire across runs), then notify each.
 * emitActivity never throws; a failed notification un-claims its row so the next run retries it.
 */
export async function fireDueReminders(h: DB, now: Date, emit: typeof emitActivity = emitActivity): Promise<number> {
  const claimed = await h
    .update(tasks)
    .set({ remindedAt: now })
    .where(and(lte(tasks.remindAt, now), isNull(tasks.remindedAt), isNull(tasks.completedAt)))
    .returning();
  let fired = 0;
  for (const r of claimed) {
    const sent = await emit(
      { type: "task.reminder", source: "calendar", title: "Reminder", detail: r.title },
      { category: "REMINDER", title: `Reminder: ${r.title}`, body: dueBody(r, now), actionUrl: "/organization#tasks" },
      h,
    );
    // ponytail: a worker crash between claim and emit still drops the reminder; per-row claim+emit in one tx if that matters.
    if (sent) fired++;
    else await h.update(tasks).set({ remindedAt: null }).where(and(eq(tasks.id, r.id), eq(tasks.remindedAt, now)));
  }
  return fired;
}
