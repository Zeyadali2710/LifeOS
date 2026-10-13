import { and, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { toTaskDTO, type TaskDTO } from "@/lib/calendar-types";
import { taskInput } from "@/lib/task-payload";
import type { FieldErrors } from "./agents/approvals";
import type { DB } from "./db/client";
import { auditLog, milestones, projects, taskDependencies, tasks } from "./db/schema";
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

/** Project must exist; milestone must belong to that project (a milestone without a project is invalid). */
async function refErrors(h: DB, projectId: string | null, milestoneId: string | null): Promise<FieldErrors> {
  const errors: FieldErrors = {};
  if (projectId) {
    const [p] = await h.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
    if (!p) errors.projectId = "Pick a project.";
  }
  if (milestoneId) {
    const [m] = projectId
      ? await h.select({ id: milestones.id }).from(milestones).where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)))
      : [];
    if (!m) errors.milestoneId = "Pick a milestone from this project.";
  }
  return errors;
}

export async function createTask(h: DB, raw: unknown, now: Date): Promise<TaskResult> {
  const p = parse(raw, now);
  if (!p.data) return { ok: false, errors: p.errors! };
  const { data } = p;
  const refs = await refErrors(h, data.projectId, data.milestoneId);
  if (Object.keys(refs).length) return { ok: false, errors: refs };
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
      projectId: data.projectId,
      milestoneId: data.projectId ? data.milestoneId : null,
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
  // Callers that predate projects (agents, older dialogs) omit projectId: keep the task's project/milestone rather than clearing them.
  const keepRefs = !(raw && typeof raw === "object" && "projectId" in raw);
  const data = keepRefs ? { ...p.data, projectId: cur.projectId, milestoneId: cur.milestoneId } : p.data;
  const refs = await refErrors(h, data.projectId, data.milestoneId);
  if (Object.keys(refs).length) return { ok: false, errors: refs };
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
      projectId: data.projectId,
      milestoneId: data.projectId ? data.milestoneId : null,
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

export function dueBody(r: { dueDate: string | null; dueTime: string | null; dueAt: Date | null }, now: Date): string {
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

/** D-28: titles of mail-linked tasks carry email text, so agent-facing tools show this instead. */
export const MAIL_TASK_TITLE = "Email follow-up (private)";

export async function mailLinkedTaskIds(h: DB, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await h.select({ id: tasks.id }).from(tasks).where(and(inArray(tasks.id, ids), isNotNull(tasks.mailMessageId)));
  return new Set(rows.map((r) => r.id));
}

/** D-28 (WR-S04): blocker labels quote task titles; swap any mail-linked title (the task or its blocker) for MAIL_TASK_TITLE. */
export async function mailBlockerRedactor(h: DB, taskIds: string[]): Promise<(label: string) => string> {
  if (!taskIds.length) return (s) => s;
  const by = await h.select({ id: taskDependencies.blockedByTaskId }).from(taskDependencies).where(inArray(taskDependencies.taskId, taskIds));
  const ids = [...new Set([...taskIds, ...by.map((b) => b.id)])];
  const rows = await h.select({ title: tasks.title }).from(tasks).where(and(inArray(tasks.id, ids), isNotNull(tasks.mailMessageId)));
  return (s) => rows.reduce((acc, r) => acc.replaceAll(`"${r.title}"`, `"${MAIL_TASK_TITLE}"`), s);
}
