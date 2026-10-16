import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { goalProgress, goalsHeadline, horizonOf, isNeglected, momentum, MOMENTUM_DAYS, objectiveProgress, type Horizon, type Momentum } from "@/lib/goals";
import { sydneyYmd } from "@/lib/project-rules";
import type { DB } from "./db/client";
import { goals, objectiveProjects, objectives, projects, settings, taskDependencies, tasks } from "./db/schema";

export const VISION_KEY = "goals.vision";
const DAY = 86_400_000;

export async function getVision(h: DB): Promise<string> {
  const [r] = await h.select({ v: settings.value }).from(settings).where(eq(settings.key, VISION_KEY));
  return typeof r?.v === "string" ? r.v : "";
}

export type GoalTask = { id: string; title: string; done: boolean; blocked: boolean };
export type GoalProject = { id: string; name: string; status: string; progress: number | null; done: number; total: number; tasks: GoalTask[] };
export type GoalObjective = {
  id: string; goalId: string; title: string; targetDate: string | null; status: "active" | "done"; manualProgress: number | null;
  progress: number | null; momentum: Momentum; recent: number; prior: number; neglected: boolean; lastActivity: string; horizon: Horizon; projects: GoalProject[];
};
export type GoalNode = {
  id: string; title: string; color: string; targetDate: string | null; status: "active" | "done" | "archived";
  progress: number | null; momentum: Momentum; neglected: number; objectives: GoalObjective[];
};

/** Vision → goals → objectives → linked projects → tasks, with derived progress, momentum, neglect and horizon. */
export async function loadGoals(h: DB, now: Date, opts: { includeArchived?: boolean } = {}) {
  const today = sydneyYmd(now);
  const [vision, goalRows] = await Promise.all([
    getVision(h),
    h.select().from(goals).where(opts.includeArchived ? undefined : ne(goals.status, "archived")).orderBy(asc(goals.sortOrder), asc(goals.createdAt)),
  ]);
  const goalIds = goalRows.map((g) => g.id);
  const objRows = goalIds.length ? await h.select().from(objectives).where(inArray(objectives.goalId, goalIds)).orderBy(asc(objectives.sortOrder), asc(objectives.createdAt)) : [];
  const objIds = objRows.map((o) => o.id);
  const links = objIds.length
    ? await h.select({ objectiveId: objectiveProjects.objectiveId, linkedAt: objectiveProjects.createdAt, id: projects.id, name: projects.name, status: projects.status })
        .from(objectiveProjects).innerJoin(projects, eq(projects.id, objectiveProjects.projectId))
        .where(and(inArray(objectiveProjects.objectiveId, objIds), ne(projects.status, "archived"))).orderBy(asc(projects.name))
    : [];
  const projectIds = links.map((l) => l.id);
  const [taskRows, blockedRows, allProjects] = await Promise.all([
    projectIds.length
      ? h.select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId, completedAt: tasks.completedAt, createdAt: tasks.createdAt }).from(tasks)
          .where(inArray(tasks.projectId, projectIds)).orderBy(sql`${tasks.completedAt} is not null`, asc(tasks.dueAt), asc(tasks.createdAt))
      : Promise.resolve([]),
    projectIds.length
      ? h.selectDistinct({ id: taskDependencies.taskId }).from(taskDependencies).innerJoin(tasks, eq(tasks.id, taskDependencies.blockedByTaskId)).where(isNull(tasks.completedAt))
      : Promise.resolve([]),
    h.select({ id: projects.id, name: projects.name, objectiveId: objectiveProjects.objectiveId }).from(projects)
      .leftJoin(objectiveProjects, eq(objectiveProjects.projectId, projects.id)).where(ne(projects.status, "archived")).orderBy(asc(projects.name)),
  ]);
  const blocked = new Set(blockedRows.map((b) => b.id));
  const recentFrom = now.getTime() - MOMENTUM_DAYS * DAY, priorFrom = now.getTime() - 2 * MOMENTUM_DAYS * DAY;

  const goalNodes: GoalNode[] = goalRows.map((g) => {
    const objs: GoalObjective[] = objRows.filter((o) => o.goalId === g.id).map((o) => {
      let done = 0, total = 0, recent = 0, prior = 0, last = Math.max(o.createdAt.getTime(), o.updatedAt.getTime());
      const ps: GoalProject[] = links.filter((l) => l.objectiveId === o.id).map((l) => {
        last = Math.max(last, l.linkedAt.getTime());
        const ts = taskRows.filter((t) => t.projectId === l.id);
        let pDone = 0;
        for (const t of ts) {
          last = Math.max(last, t.createdAt.getTime(), t.completedAt?.getTime() ?? 0);
          if (!t.completedAt) continue;
          pDone++;
          const at = t.completedAt.getTime();
          if (at >= recentFrom) recent++; else if (at >= priorFrom) prior++;
        }
        done += pDone; total += ts.length;
        return { id: l.id, name: l.name, status: l.status, done: pDone, total: ts.length, progress: ts.length ? Math.round((pDone / ts.length) * 100) : null,
          tasks: ts.map((t) => ({ id: t.id, title: t.title, done: !!t.completedAt, blocked: !t.completedAt && blocked.has(t.id) })) };
      });
      const status = o.status as "active" | "done";
      return {
        id: o.id, goalId: g.id, title: o.title, targetDate: o.targetDate, status, manualProgress: o.progress,
        progress: objectiveProgress(o.progress, done, total, status), momentum: momentum(recent, prior), recent, prior,
        neglected: isNeglected(new Date(last), now, status === "active" && g.status === "active"),
        lastActivity: new Date(last).toISOString(), horizon: horizonOf(o.targetDate ?? g.targetDate, today), projects: ps,
      };
    });
    const sum = (k: "recent" | "prior") => objs.reduce((n, o) => n + o[k], 0);
    return { id: g.id, title: g.title, color: g.color, targetDate: g.targetDate, status: g.status as GoalNode["status"],
      progress: g.status === "done" ? 100 : goalProgress(objs.map((o) => o.progress)), momentum: momentum(sum("recent"), sum("prior")),
      neglected: objs.filter((o) => o.neglected).length, objectives: objs };
  });

  const active = goalNodes.filter((g) => g.status === "active");
  return {
    today, vision, goals: goalNodes, headline: goalsHeadline(active),
    projects: allProjects.map((p) => ({ id: p.id, name: p.name, objectiveId: p.objectiveId })),
  };
}
export type GoalsData = Awaited<ReturnType<typeof loadGoals>>;
