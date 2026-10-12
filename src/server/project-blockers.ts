import { desc, eq, inArray } from "drizzle-orm";
import { blockers, ciHealth, sydneyYmd } from "@/lib/project-rules";
import type { ProjectStatus } from "@/lib/project-types";
import type { DB } from "./db/client";
import { githubRepos, githubWorkflowRuns, milestones, projectDependencies, projectLinks, projects, taskDependencies, tasks } from "./db/schema";
import { emitActivity } from "./events";

type BlockerInput = Parameters<typeof blockers>[0];

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Everything blockers() needs, for all given projects in a fixed number of queries (plus one per linked repo). */
export async function loadBlockerInputs(h: DB, projectIds: string[], now: Date): Promise<Map<string, BlockerInput>> {
  const out = new Map<string, BlockerInput>();
  if (!projectIds.length) return out;
  const today = sydneyYmd(now);
  for (const id of projectIds) {
    out.set(id, { tasks: [], taskDeps: [], projectDeps: [], milestones: [], failingRepos: [], today, projectId: id });
  }

  const taskRows = await h
    .select({ id: tasks.id, projectId: tasks.projectId, title: tasks.title, completedAt: tasks.completedAt })
    .from(tasks)
    .where(inArray(tasks.projectId, projectIds));
  const taskProject = new Map<string, string>();
  for (const t of taskRows) {
    taskProject.set(t.id, t.projectId!);
    out.get(t.projectId!)!.tasks.push({ id: t.id, title: t.title, completedAt: iso(t.completedAt) });
  }

  if (taskRows.length) {
    const deps = await h
      .select({ taskId: taskDependencies.taskId, blockedById: tasks.id, title: tasks.title, completedAt: tasks.completedAt })
      .from(taskDependencies)
      .innerJoin(tasks, eq(tasks.id, taskDependencies.blockedByTaskId))
      .where(inArray(taskDependencies.taskId, [...taskProject.keys()]));
    for (const d of deps) {
      out.get(taskProject.get(d.taskId)!)!.taskDeps.push({ taskId: d.taskId, blockedById: d.blockedById, blockedByTitle: d.title, blockedByDone: d.completedAt !== null });
    }
  }

  const pdeps = await h
    .select({ projectId: projectDependencies.projectId, id: projects.id, name: projects.name, status: projects.status })
    .from(projectDependencies)
    .innerJoin(projects, eq(projects.id, projectDependencies.blockedByProjectId))
    .where(inArray(projectDependencies.projectId, projectIds));
  for (const d of pdeps) out.get(d.projectId)!.projectDeps.push({ id: d.id, name: d.name, status: d.status as ProjectStatus });

  const ms = await h.select().from(milestones).where(inArray(milestones.projectId, projectIds));
  for (const m of ms) out.get(m.projectId)!.milestones.push({ id: m.id, title: m.title, dueDate: m.dueDate, completedAt: iso(m.completedAt) });

  const links = await h
    .select({ projectId: projectLinks.projectId, repoId: githubRepos.id, fullName: githubRepos.fullName, defaultBranch: githubRepos.defaultBranch })
    .from(projectLinks)
    .innerJoin(githubRepos, eq(githubRepos.id, projectLinks.repoId))
    .where(inArray(projectLinks.projectId, projectIds));
  const failing = new Map<number, boolean>();
  for (const l of links) {
    if (!failing.has(l.repoId)) {
      const runs = await h.select().from(githubWorkflowRuns).where(eq(githubWorkflowRuns.repoId, l.repoId)).orderBy(desc(githubWorkflowRuns.ghCreatedAt)).limit(5);
      const rows = runs.map((r) => ({ branch: r.branch, status: r.status, conclusion: r.conclusion, at: iso(r.ghCreatedAt) }));
      failing.set(l.repoId, ciHealth(rows, l.defaultBranch).state === "failing");
    }
    if (failing.get(l.repoId)) out.get(l.projectId)!.failingRepos.push(l.fullName);
  }
  return out;
}

export async function blockedProjectIds(h: DB, ids: string[], now: Date): Promise<Set<string>> {
  const inputs = await loadBlockerInputs(h, ids, now);
  return new Set([...inputs].filter(([, i]) => blockers(i).length > 0).map(([id]) => id));
}

/**
 * Run fn, then emit project.blocked / project.unblocked for each project whose blocked state flipped.
 * ponytail: time-based (milestone passes due date) and CI-driven transitions are not evented; add a daily job if wanted.
 */
export async function withBlockTransition<T>(h: DB, ids: string[], now: Date, fn: () => Promise<T>): Promise<T> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return fn();
  const before = await blockedProjectIds(h, uniq, now);
  const result = await fn();
  const after = await blockedProjectIds(h, uniq, now);
  const changed = uniq.filter((id) => before.has(id) !== after.has(id));
  if (changed.length) {
    const names = new Map((await h.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, changed))).map((p) => [p.id, p.name]));
    for (const id of changed) {
      const name = names.get(id);
      if (name === undefined) continue; // project deleted by fn
      const blocked = after.has(id);
      await emitActivity({
        type: blocked ? "project.blocked" : "project.unblocked",
        source: "project",
        title: blocked ? "Project blocked" : "Project unblocked",
        detail: name,
        tone: blocked ? "amber" : "green",
      }, undefined, h);
    }
  }
  return result;
}
