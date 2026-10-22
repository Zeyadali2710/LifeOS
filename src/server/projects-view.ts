// Projects screen read model (server only): list cards plus timeline, next-up tasks and objectives.
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { ProjectCardDTO } from "@/lib/project-types";
import type { DB } from "./db/client";
import { goals, milestones, objectiveProjects, objectives, taskDependencies, tasks } from "./db/schema";
import { listProjects } from "./project-queries";

export type TimelineMilestone = { projectId: string; title: string; dueDate: string | null; done: boolean };
export type NextTask = { id: string; title: string; projectId: string; priority: 1 | 2 | 3 | null; dueDate: string | null; done: boolean };
export type ObjectiveOption = { id: string; title: string; goal: string };

export type ProjectsPageData = {
  cards: ProjectCardDTO[];
  milestones: TimelineMilestone[];
  nextUp: NextTask[];
  objectives: ObjectiveOption[];
  objectiveOf: Record<string, string>;
};

export async function loadProjectsPage(h: DB, now: Date): Promise<ProjectsPageData> {
  const cards = await listProjects(h, now);
  const live = cards.filter((c) => c.project.status === "active" || c.project.status === "paused").map((c) => c.project.id);
  const blocked = sql`exists (select 1 from ${taskDependencies} d join ${tasks} b on b.id = d.blocked_by_task_id where d.task_id = ${tasks.id} and b.completed_at is null)`;
  const [ms, next, objs, links] = await Promise.all([
    live.length ? h.select({ projectId: milestones.projectId, title: milestones.title, dueDate: milestones.dueDate, completedAt: milestones.completedAt }).from(milestones).where(inArray(milestones.projectId, live)).orderBy(asc(milestones.sortOrder)) : [],
    live.length
      ? h
          .select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId, priority: tasks.priority, dueDate: tasks.dueDate })
          .from(tasks)
          .where(and(inArray(tasks.projectId, live), isNull(tasks.completedAt), sql`not ${blocked}`))
          .orderBy(sql`${tasks.dueDate} asc nulls last`, sql`${tasks.priority} asc nulls last`)
          .limit(8)
      : [],
    h.select({ id: objectives.id, title: objectives.title, goal: goals.title }).from(objectives).innerJoin(goals, eq(goals.id, objectives.goalId)).where(and(eq(objectives.status, "active"), eq(goals.status, "active"))),
    h.select({ projectId: objectiveProjects.projectId, title: objectives.title }).from(objectiveProjects).innerJoin(objectives, eq(objectives.id, objectiveProjects.objectiveId)),
  ]);
  return {
    cards,
    milestones: ms.map((m) => ({ projectId: m.projectId, title: m.title, dueDate: m.dueDate, done: m.completedAt !== null })),
    nextUp: next.map((t) => ({ id: t.id, title: t.title, projectId: t.projectId!, priority: t.priority as 1 | 2 | 3 | null, dueDate: t.dueDate, done: false })),
    objectives: objs,
    objectiveOf: Object.fromEntries(links.map((l) => [l.projectId, l.title])),
  };
}

/** The objective a project counts toward (one per project), for the detail header. */
export async function projectObjective(h: DB, projectId: string): Promise<{ id: string; title: string } | null> {
  const [r] = await h.select({ id: objectives.id, title: objectives.title }).from(objectiveProjects).innerJoin(objectives, eq(objectives.id, objectiveProjects.objectiveId)).where(eq(objectiveProjects.projectId, projectId));
  return r ?? null;
}
