"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import type { TaskDTO } from "@/lib/calendar-types";
import type { FieldErrors } from "./agents/approvals";
import { type DB, db } from "./db/client";
import { taskDependencies, tasks } from "./db/schema";
import { log } from "./log";
import { withBlockTransition } from "./project-blockers";
import { requireOwner } from "./session";
import { createTask, deleteTask, setTaskCompleted, updateTask } from "./tasks";
import { sydneyParts } from "./time";

type Result = { ok: true; task: TaskDTO } | { ok: false; errors: FieldErrors } | { ok: false; error: "failed" | "not_found" };
const uuid = z.uuid();

async function run(fn: () => Promise<Result | { ok: boolean; error?: "not_found" }>): Promise<Result> {
  try {
    return (await fn()) as Result;
  } catch (err) {
    log.error({ err }, "task action failed"); // never log task contents
    return { ok: false, error: "failed" };
  }
}

/** Projects whose blocked state can flip when this task changes: its own (old and, on a move, new) and those whose tasks it blocks. */
async function affectedProjects(h: DB, taskId: string, newProjectId?: unknown): Promise<string[]> {
  const own = await h.select({ p: tasks.projectId }).from(tasks).where(eq(tasks.id, taskId));
  const downstream = await h
    .select({ p: tasks.projectId })
    .from(taskDependencies)
    .innerJoin(tasks, eq(tasks.id, taskDependencies.taskId))
    .where(eq(taskDependencies.blockedByTaskId, taskId));
  const moved = uuid.safeParse(newProjectId);
  return [...[...own, ...downstream].map((r) => r.p), moved.success ? moved.data : null].filter((p): p is string => p !== null);
}

export async function createTaskAction(raw: unknown): Promise<Result> {
  await requireOwner();
  return run(() => createTask(db(), raw, new Date()));
}

export async function updateTaskAction(rawId: string, raw: unknown): Promise<Result> {
  await requireOwner();
  const id = uuid.safeParse(rawId);
  if (!id.success) return { ok: false, error: "not_found" };
  const h = db();
  const now = new Date();
  const newProjectId = raw && typeof raw === "object" && "projectId" in raw ? raw.projectId : undefined;
  return run(async () => withBlockTransition(h, await affectedProjects(h, id.data, newProjectId), now, () => updateTask(h, id.data, raw, now)));
}

export async function toggleTaskAction(rawId: string, done: boolean): Promise<Result> {
  await requireOwner();
  const id = uuid.safeParse(rawId);
  if (!id.success) return { ok: false, error: "not_found" };
  const h = db();
  const now = new Date();
  // Completing/reopening a task can flip blocked state for its own project and for projects whose tasks it blocks.
  return run(async () => withBlockTransition(h, await affectedProjects(h, id.data), now, () => setTaskCompleted(h, id.data, done === true, now)));
}

export async function deleteTaskAction(rawId: string): Promise<{ ok: true } | { ok: false; error: "failed" | "not_found" }> {
  await requireOwner();
  const id = uuid.safeParse(rawId);
  if (!id.success) return { ok: false, error: "not_found" };
  try {
    const h = db();
    // Deleting cascades its task_dependencies rows, which can unblock downstream projects.
    const ok = (await withBlockTransition(h, await affectedProjects(h, id.data), new Date(), () => deleteTask(h, id.data))).ok;
    return ok ? { ok: true } : { ok: false, error: "not_found" };
  } catch (err) {
    log.error({ err }, "task action failed");
    return { ok: false, error: "failed" };
  }
}

/** Quick add: due today (Sydney), no time, no priority. */
export async function quickAddTaskAction(title: string): Promise<Result> {
  await requireOwner();
  const now = new Date();
  const p = sydneyParts(now);
  const dueDate = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return run(() => createTask(db(), { title, dueDate }, now));
}
