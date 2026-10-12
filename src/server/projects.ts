import { and, asc, count, eq, inArray, ne, or, sql } from "drizzle-orm";
import { linkInput, milestoneInput, projectInput } from "@/lib/project-payload";
import type { ProjectCategory, ProjectDTO, ProjectStatus, TaskDialogOptions } from "@/lib/project-types";
import type { FieldErrors } from "./agents/approvals";
import type { DB } from "./db/client";
import { auditLog, githubRepos, milestones, projectDependencies, projectLinks, projects, taskDependencies, tasks } from "./db/schema";
import { emitActivity } from "./events";
import { log } from "./log";
import { withBlockTransition } from "./project-blockers";

export type ProjectResult = { ok: true; project: ProjectDTO } | { ok: false; errors: FieldErrors } | { ok: false; error: "not_found" };
type Simple = { ok: true } | { ok: false; errors: FieldErrors } | { ok: false; error: "not_found" };
type Created = { ok: true; id: string } | { ok: false; errors: FieldErrors } | { ok: false; error: "not_found" };

// Audit via the caller's handle; metadata is {id} only (no names or notes).
async function aud(h: DB, action: string, id: string) {
  try {
    await h.insert(auditLog).values({ actor: "owner", action, target: id, metadata: { id } });
  } catch (err) {
    log.error({ err, action }, "audit write failed");
  }
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const i of issues) errors[String(i.path[0] ?? "form")] ??= i.message;
  return errors;
}

export function toProjectDTO(r: typeof projects.$inferSelect): ProjectDTO {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category as ProjectCategory,
    status: r.status as ProjectStatus,
    priority: r.priority === 1 || r.priority === 3 ? r.priority : 2,
    targetDate: r.targetDate,
    workspacePath: r.workspacePath,
    workspaceMachine: r.workspaceMachine,
    blockerNote: r.blockerNote,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Projects that wait on this one; their blocked state can flip when it changes. */
async function dependentsOf(h: DB, projectId: string): Promise<string[]> {
  const rows = await h.select({ id: projectDependencies.projectId }).from(projectDependencies).where(eq(projectDependencies.blockedByProjectId, projectId));
  return rows.map((r) => r.id);
}

// ── projects ────────────────────────────────────────────────────────────────
export async function createProject(h: DB, raw: unknown, now: Date): Promise<ProjectResult> {
  const p = projectInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: fieldErrors(p.error.issues) };
  const [row] = await h.insert(projects).values({ ...p.data, createdAt: now, updatedAt: now }).returning();
  await aud(h, "project.create", row!.id);
  await emitActivity({ type: "project.created", source: "project", title: "Project created", detail: row!.name }, undefined, h);
  return { ok: true, project: toProjectDTO(row!) };
}

export async function updateProject(h: DB, id: string, raw: unknown, now: Date): Promise<ProjectResult> {
  const [cur] = await h.select().from(projects).where(eq(projects.id, id));
  if (!cur) return { ok: false, error: "not_found" };
  const p = projectInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: fieldErrors(p.error.issues) };
  const row = await withBlockTransition(h, await dependentsOf(h, id), now, async () => {
    const archivedFrom = cur.status !== "archived" && p.data.status === "archived" ? cur.status : cur.archivedFrom;
    const [r] = await h.update(projects).set({ ...p.data, archivedFrom, updatedAt: now }).where(eq(projects.id, id)).returning();
    return r!;
  });
  await aud(h, "project.update", id);
  if (cur.status !== "archived" && row.status === "archived") {
    await emitActivity({ type: "project.archived", source: "project", title: "Project archived", detail: row.name }, undefined, h);
  }
  return { ok: true, project: toProjectDTO(row) };
}

export async function setProjectArchived(h: DB, id: string, archived: boolean, now: Date): Promise<ProjectResult> {
  const [cur] = await h.select().from(projects).where(eq(projects.id, id));
  if (!cur) return { ok: false, error: "not_found" };
  const row = await withBlockTransition(h, await dependentsOf(h, id), now, async () => {
    // Archive remembers the prior status; unarchive restores it (WR-02) instead of forcing "active".
    const set = archived
      ? { status: "archived", archivedFrom: cur.status === "archived" ? cur.archivedFrom : cur.status }
      : { status: cur.status === "archived" ? (cur.archivedFrom ?? "active") : cur.status, archivedFrom: null };
    const [r] = await h.update(projects).set({ ...set, updatedAt: now }).where(eq(projects.id, id)).returning();
    return r!;
  });
  await aud(h, archived ? "project.archive" : "project.unarchive", id);
  if (archived && cur.status !== "archived") {
    await emitActivity({ type: "project.archived", source: "project", title: "Project archived", detail: row.name }, undefined, h);
  }
  return { ok: true, project: toProjectDTO(row) };
}

export type DeleteProjectResult =
  | { ok: true }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "has_linked_data"; counts: { tasks: number; milestones: number; links: number; dependencies: number } };

export async function deleteProject(h: DB, id: string, confirmUnlink: boolean): Promise<DeleteProjectResult> {
  const [cur] = await h.select({ id: projects.id }).from(projects).where(eq(projects.id, id));
  if (!cur) return { ok: false, error: "not_found" };
  const n = async (q: Promise<{ c: number }[]>) => (await q)[0]!.c;
  const counts = {
    tasks: await n(h.select({ c: count() }).from(tasks).where(eq(tasks.projectId, id))),
    milestones: await n(h.select({ c: count() }).from(milestones).where(eq(milestones.projectId, id))),
    links: await n(h.select({ c: count() }).from(projectLinks).where(eq(projectLinks.projectId, id))),
    dependencies: await n(
      h.select({ c: count() }).from(projectDependencies).where(or(eq(projectDependencies.projectId, id), eq(projectDependencies.blockedByProjectId, id))),
    ),
  };
  if ((counts.tasks || counts.milestones || counts.links || counts.dependencies) && !confirmUnlink) return { ok: false, error: "has_linked_data", counts };
  const dependents = await dependentsOf(h, id);
  await withBlockTransition(h, dependents, new Date(), () =>
    h.transaction(async (tx) => {
      await tx.update(tasks).set({ projectId: null, milestoneId: null }).where(eq(tasks.projectId, id));
      await tx.delete(projects).where(eq(projects.id, id)); // cascades milestones, links, dependency edges
    }),
  );
  await aud(h, "project.delete", id);
  return { ok: true };
}

// ── milestones ──────────────────────────────────────────────────────────────
export async function createMilestone(h: DB, projectId: string, raw: unknown, now: Date): Promise<Created> {
  const [proj] = await h.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!proj) return { ok: false, error: "not_found" };
  const p = milestoneInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: fieldErrors(p.error.issues) };
  const [mx] = await h.select({ m: sql<number>`coalesce(max(${milestones.sortOrder}), 0)::int` }).from(milestones).where(eq(milestones.projectId, projectId));
  const row = await withBlockTransition(h, [projectId], now, async () => {
    const [r] = await h.insert(milestones).values({ projectId, title: p.data.title, dueDate: p.data.dueDate, sortOrder: mx!.m + 1 }).returning();
    return r!;
  });
  await aud(h, "milestone.create", row.id);
  return { ok: true, id: row.id };
}

export async function updateMilestone(h: DB, id: string, raw: unknown, now: Date): Promise<Simple> {
  const [cur] = await h.select().from(milestones).where(eq(milestones.id, id));
  if (!cur) return { ok: false, error: "not_found" };
  const p = milestoneInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: fieldErrors(p.error.issues) };
  await withBlockTransition(h, [cur.projectId], now, () =>
    h.update(milestones).set({ title: p.data.title, dueDate: p.data.dueDate, updatedAt: now }).where(eq(milestones.id, id)),
  );
  await aud(h, "milestone.update", id);
  return { ok: true };
}

export async function setMilestoneDone(h: DB, id: string, done: boolean, now: Date): Promise<Simple> {
  const [cur] = await h
    .select({ m: milestones, name: projects.name })
    .from(milestones)
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .where(eq(milestones.id, id));
  if (!cur) return { ok: false, error: "not_found" };
  const was = cur.m.completedAt !== null;
  if (was === done) return { ok: true };
  await withBlockTransition(h, [cur.m.projectId], now, () =>
    h.update(milestones).set({ completedAt: done ? now : null, updatedAt: now }).where(eq(milestones.id, id)),
  );
  await aud(h, done ? "milestone.complete" : "milestone.reopen", id);
  if (done) {
    await emitActivity({ type: "project.milestone_done", source: "project", title: "Milestone done", detail: `${cur.name}: ${cur.m.title}`, tone: "green" }, undefined, h);
  }
  return { ok: true };
}

export async function deleteMilestone(h: DB, id: string): Promise<Simple> {
  const [cur] = await h.select({ projectId: milestones.projectId }).from(milestones).where(eq(milestones.id, id));
  if (!cur) return { ok: false, error: "not_found" };
  await withBlockTransition(h, [cur.projectId], new Date(), () => h.delete(milestones).where(eq(milestones.id, id))); // tasks.milestone_id set null by FK
  await aud(h, "milestone.delete", id);
  return { ok: true };
}

// ── links ───────────────────────────────────────────────────────────────────
const uniqueViolation = (err: unknown) => {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
};

export async function addLink(h: DB, projectId: string, raw: unknown, now: Date): Promise<Created> {
  const [proj] = await h.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!proj) return { ok: false, error: "not_found" };
  const p = linkInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: fieldErrors(p.error.issues) };
  const d = p.data;
  if (d.kind === "url") {
    const [r] = await h.insert(projectLinks).values({ projectId, kind: "url", url: d.url, label: d.label }).returning({ id: projectLinks.id });
    await aud(h, "project_link.add", r!.id);
    return { ok: true, id: r!.id };
  }
  const [repo] = await h.select({ id: githubRepos.id }).from(githubRepos).where(eq(githubRepos.id, d.repoId));
  if (!repo) return { ok: false, errors: { repoId: "Pick a synced repository." } };
  const [dup] = await h.select({ id: projectLinks.id }).from(projectLinks).where(and(eq(projectLinks.projectId, projectId), eq(projectLinks.repoId, d.repoId)));
  if (dup) return { ok: false, errors: { repoId: "Already linked." } };
  try {
    const r = await withBlockTransition(h, [projectId], now, async () => {
      const [x] = await h.insert(projectLinks).values({ projectId, kind: "repo", repoId: d.repoId }).returning({ id: projectLinks.id });
      return x!;
    });
    await aud(h, "project_link.add", r.id);
    return { ok: true, id: r.id };
  } catch (err) {
    if (uniqueViolation(err)) return { ok: false, errors: { repoId: "Already linked." } }; // lost a race with the pre-check
    throw err;
  }
}

export async function removeLink(h: DB, id: string): Promise<Simple> {
  const [cur] = await h.select().from(projectLinks).where(eq(projectLinks.id, id));
  if (!cur) return { ok: false, error: "not_found" };
  await withBlockTransition(h, cur.kind === "repo" ? [cur.projectId] : [], new Date(), () => h.delete(projectLinks).where(eq(projectLinks.id, id)));
  await aud(h, "project_link.remove", id);
  return { ok: true };
}

// ── dependency edges (D-08) ─────────────────────────────────────────────────
const taskCycle = () => ({ ok: false as const, errors: { blockedBy: "That would create a circular dependency. Pick a different task." } satisfies FieldErrors });
const projectCycle = () => ({ ok: false as const, errors: { blockedBy: "That would create a circular dependency. Pick a different project." } satisfies FieldErrors });

export async function addTaskDependency(h: DB, taskId: string, blockedById: string, now: Date): Promise<Simple> {
  const found = await h.select({ id: tasks.id, projectId: tasks.projectId }).from(tasks).where(inArray(tasks.id, [taskId, blockedById]));
  const dependent = found.find((t) => t.id === taskId);
  if (!dependent || !found.some((t) => t.id === blockedById)) return { ok: false, error: "not_found" };
  if (taskId === blockedById) return taskCycle();
  const run = () =>
    h.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('task_deps'))`);
      // Adding "taskId blocked by blockedById" cycles iff taskId is already reachable from blockedById.
      const r = await tx.execute(sql`
        WITH RECURSIVE reach(id) AS (
          SELECT blocked_by_task_id FROM task_dependencies WHERE task_id = ${blockedById}
          UNION
          SELECT d.blocked_by_task_id FROM task_dependencies d JOIN reach r ON d.task_id = r.id
        )
        SELECT 1 FROM reach WHERE id = ${taskId} LIMIT 1`);
      if (r.rows.length) return false;
      await tx.insert(taskDependencies).values({ taskId, blockedByTaskId: blockedById }).onConflictDoNothing();
      return true;
    });
  const added = await withBlockTransition(h, dependent.projectId ? [dependent.projectId] : [], now, run);
  if (!added) return taskCycle();
  await aud(h, "task_dependency.add", taskId);
  return { ok: true };
}

export async function removeTaskDependency(h: DB, taskId: string, blockedById: string, now: Date): Promise<Simple> {
  const [t] = await h.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, taskId));
  if (!t) return { ok: false, error: "not_found" };
  await withBlockTransition(h, t.projectId ? [t.projectId] : [], now, () =>
    h.delete(taskDependencies).where(and(eq(taskDependencies.taskId, taskId), eq(taskDependencies.blockedByTaskId, blockedById))),
  );
  await aud(h, "task_dependency.remove", taskId);
  return { ok: true };
}

export async function addProjectDependency(h: DB, projectId: string, blockedById: string, now: Date): Promise<Simple> {
  const found = await h.select({ id: projects.id }).from(projects).where(inArray(projects.id, [projectId, blockedById]));
  if (!found.some((p) => p.id === projectId) || !found.some((p) => p.id === blockedById)) return { ok: false, error: "not_found" };
  if (projectId === blockedById) return projectCycle();
  const added = await withBlockTransition(h, [projectId], now, () =>
    h.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('project_deps'))`);
      const r = await tx.execute(sql`
        WITH RECURSIVE reach(id) AS (
          SELECT blocked_by_project_id FROM project_dependencies WHERE project_id = ${blockedById}
          UNION
          SELECT d.blocked_by_project_id FROM project_dependencies d JOIN reach r ON d.project_id = r.id
        )
        SELECT 1 FROM reach WHERE id = ${projectId} LIMIT 1`);
      if (r.rows.length) return false;
      await tx.insert(projectDependencies).values({ projectId, blockedByProjectId: blockedById }).onConflictDoNothing();
      return true;
    }),
  );
  if (!added) return projectCycle();
  await aud(h, "project_dependency.add", projectId);
  return { ok: true };
}

export async function removeProjectDependency(h: DB, projectId: string, blockedById: string, now: Date): Promise<Simple> {
  const [p] = await h.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!p) return { ok: false, error: "not_found" };
  await withBlockTransition(h, [projectId], now, () =>
    h.delete(projectDependencies).where(and(eq(projectDependencies.projectId, projectId), eq(projectDependencies.blockedByProjectId, blockedById))),
  );
  await aud(h, "project_dependency.remove", projectId);
  return { ok: true };
}

// ── task dialog ─────────────────────────────────────────────────────────────
export async function taskDialogOptions(h: DB, taskId: string | null): Promise<TaskDialogOptions> {
  const ps = await h.select({ id: projects.id, name: projects.name }).from(projects).where(ne(projects.status, "archived")).orderBy(asc(projects.priority), asc(projects.name));
  const ms = ps.length
    ? await h
        .select({ id: milestones.id, projectId: milestones.projectId, title: milestones.title })
        .from(milestones)
        .where(inArray(milestones.projectId, ps.map((p) => p.id)))
        .orderBy(asc(milestones.sortOrder))
    : [];
  const open = await h
    .select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .where(and(sql`${tasks.completedAt} is null`, taskId ? ne(tasks.id, taskId) : undefined))
    .orderBy(sql`${tasks.dueAt} asc nulls last`)
    .limit(200);
  const blockedBy = taskId
    ? await h
        .select({ id: tasks.id, title: tasks.title })
        .from(taskDependencies)
        .innerJoin(tasks, eq(tasks.id, taskDependencies.blockedByTaskId))
        .where(eq(taskDependencies.taskId, taskId))
    : [];
  return {
    projects: ps.map((p) => ({ ...p, milestones: ms.filter((m) => m.projectId === p.id).map((m) => ({ id: m.id, title: m.title })) })),
    tasks: open,
    blockedBy,
  };
}
