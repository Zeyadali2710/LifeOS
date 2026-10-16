"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { goalInput, objectiveInput, visionInput } from "@/lib/goals";
import { db, type DB } from "./db/client";
import { auditLog, goals, objectiveProjects, objectives, settings } from "./db/schema";
import { VISION_KEY } from "./goals";
import { requireOwner } from "./session";

type Result = { ok: true; id?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const issue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the entered values.";
const uuid = z.uuid();
// FK violations (a goal, objective or project deleted in another tab) come back as "no longer exists".
const isFkError = (err: unknown) => typeof err === "object" && err !== null && "cause" in err && (err.cause as { code?: string })?.code === "23503";

/**
 * Runs a mutation and its audit row in one transaction, so a failed audit never leaves a change applied
 * behind an error (which would invite a duplicate retry). `fn` returns the target id, or null when the row is gone.
 */
async function mutate(action: string, fn: (tx: DB) => Promise<string | null>, missing: string, metadata: Record<string, unknown> = {}): Promise<Result> {
  try {
    const id = await db().transaction(async (tx) => {
      const target = await fn(tx as unknown as DB);
      if (target !== null) await tx.insert(auditLog).values({ actor: "owner", action, target: target || null, metadata });
      return target;
    });
    if (id === null) return fail(missing);
    revalidatePath("/goals");
    return { ok: true, id: id || undefined };
  } catch (err) {
    if (isFkError(err)) return fail(missing);
    throw err;
  }
}

export async function saveVisionAction(raw: string): Promise<Result> {
  await requireOwner();
  const p = visionInput.safeParse(raw);
  if (!p.success) return fail(issue(p.error));
  return mutate("goals.vision", async (tx) => {
    await tx.insert(settings).values({ key: VISION_KEY, value: p.data }).onConflictDoUpdate({ target: settings.key, set: { value: p.data } });
    return "";
  }, "Could not save the vision.");
}

export async function saveGoalAction(raw: unknown, id?: string): Promise<Result> {
  await requireOwner();
  const p = goalInput.safeParse(raw);
  if (!p.success) return fail(issue(p.error));
  if (id !== undefined && !uuid.safeParse(id).success) return fail("Unknown goal.");
  return mutate(id ? "goal.update" : "goal.create", async (tx) => {
    const [row] = id
      ? await tx.update(goals).set({ ...p.data, updatedAt: new Date() }).where(eq(goals.id, id)).returning({ id: goals.id })
      : await tx.insert(goals).values({ ...p.data, sortOrder: sql`coalesce((select max(sort_order) + 1 from goals), 0)` }).returning({ id: goals.id });
    return row?.id ?? null;
  }, "This goal no longer exists.");
}

export async function deleteGoalAction(id: string): Promise<Result> {
  await requireOwner();
  if (!uuid.safeParse(id).success) return fail("Unknown goal.");
  return mutate("goal.delete", async (tx) => (await tx.delete(goals).where(eq(goals.id, id)).returning({ id: goals.id }))[0]?.id ?? null, "This goal no longer exists.");
}

export async function saveObjectiveAction(raw: unknown, id?: string): Promise<Result> {
  await requireOwner();
  const p = objectiveInput.safeParse(raw);
  if (!p.success) return fail(issue(p.error));
  if (id !== undefined && !uuid.safeParse(id).success) return fail("Unknown objective.");
  return mutate(id ? "objective.update" : "objective.create", async (tx) => {
    const [row] = id
      ? await tx.update(objectives).set({ ...p.data, updatedAt: new Date() }).where(eq(objectives.id, id)).returning({ id: objectives.id })
      : await tx.insert(objectives).values({ ...p.data, sortOrder: sql`coalesce((select max(sort_order) + 1 from objectives where goal_id = ${p.data.goalId}), 0)` }).returning({ id: objectives.id });
    return row?.id ?? null;
  }, id ? "This objective no longer exists." : "That goal no longer exists.");
}

export async function deleteObjectiveAction(id: string): Promise<Result> {
  await requireOwner();
  if (!uuid.safeParse(id).success) return fail("Unknown objective.");
  return mutate("objective.delete", async (tx) => (await tx.delete(objectives).where(eq(objectives.id, id)).returning({ id: objectives.id }))[0]?.id ?? null, "This objective no longer exists.");
}

/** Links a project to one objective; linking it elsewhere moves it (one objective per project). */
export async function linkProjectAction(objectiveId: string, projectId: string): Promise<Result> {
  await requireOwner();
  if (!uuid.safeParse(objectiveId).success || !uuid.safeParse(projectId).success) return fail("Unknown project or objective.");
  return mutate("objective.link_project", async (tx) => {
    await tx.insert(objectiveProjects).values({ objectiveId, projectId })
      .onConflictDoUpdate({ target: objectiveProjects.projectId, set: { objectiveId, createdAt: new Date() } });
    return objectiveId;
  }, "That project or objective no longer exists.", { projectId });
}

export async function unlinkProjectAction(projectId: string): Promise<Result> {
  await requireOwner();
  if (!uuid.safeParse(projectId).success) return fail("Unknown project.");
  return mutate("objective.unlink_project", async (tx) => {
    await tx.delete(objectiveProjects).where(eq(objectiveProjects.projectId, projectId));
    return "";
  }, "Could not unlink the project.", { projectId });
}
