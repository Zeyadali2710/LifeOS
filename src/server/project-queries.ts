// Project read model: index cards, workspace, Home and palette search. Rules live in lib/project-rules (no SQL aggregates for health).
import { and, desc, eq, inArray, max, ne, ilike } from "drizzle-orm";
import { toTaskDTO } from "@/lib/calendar-types";
import {
  blockers,
  buildBrief,
  health as healthRule,
  isMilestoneOverdue,
  isTaskOverdue,
  launchCommand,
  progress as progressRule,
  sydneyYmd,
  timelineBar,
} from "@/lib/project-rules";
import type {
  ActivityItemDTO,
  Health,
  MilestoneDTO,
  ProjectCardDTO,
  ProjectLinkDTO,
  ProjectWorkspaceDTO,
  RepoCardDTO,
} from "@/lib/project-types";
import type { DB } from "./db/client";
import { connections, githubCommits, milestones, projectLinks, projects, tasks } from "./db/schema";
import { repoActivity, repoCards } from "./career";
import { loadBlockerInputs } from "./project-blockers";
import { toProjectDTO } from "./projects";

const iso = (d: Date | null) => (d ? d.toISOString() : null);
type TaskRow = typeof tasks.$inferSelect;
type MilestoneRow = typeof milestones.$inferSelect;

interface Gathered {
  rows: (typeof projects.$inferSelect)[];
  tasks: Map<string, TaskRow[]>;
  milestones: Map<string, MilestoneRow[]>;
  links: Map<string, (typeof projectLinks.$inferSelect)[]>;
  cards: Map<number, RepoCardDTO>;
  lastCommit: Map<number, Date>;
  inputs: Awaited<ReturnType<typeof loadBlockerInputs>>;
}

const group = <T>(items: T[], key: (t: T) => string) => {
  const m = new Map<string, T[]>();
  for (const i of items) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
  return m;
};

// Fixed number of queries for any number of projects.
async function gather(h: DB, now: Date, onlyIds?: string[]): Promise<Gathered> {
  const rows = await h.select().from(projects).where(onlyIds ? inArray(projects.id, onlyIds) : undefined);
  const ids = rows.map((r) => r.id);
  if (!ids.length) return { rows, tasks: new Map(), milestones: new Map(), links: new Map(), cards: new Map(), lastCommit: new Map(), inputs: new Map() };
  const [taskRows, msRows, linkRows, inputs] = await Promise.all([
    h.select().from(tasks).where(inArray(tasks.projectId, ids)),
    h.select().from(milestones).where(inArray(milestones.projectId, ids)).orderBy(milestones.sortOrder, milestones.createdAt),
    h.select().from(projectLinks).where(inArray(projectLinks.projectId, ids)).orderBy(projectLinks.createdAt),
    loadBlockerInputs(h, ids, now),
  ]);
  const repoIds = [...new Set(linkRows.flatMap((l) => (l.repoId === null ? [] : [l.repoId])))];
  const cards = new Map((await repoCards(h, now, repoIds)).map((c) => [c.id, c]));
  const lastCommit = new Map<number, Date>();
  if (repoIds.length) {
    const lc = await h
      .select({ repoId: githubCommits.repoId, at: max(githubCommits.committedAt) })
      .from(githubCommits)
      .where(inArray(githubCommits.repoId, repoIds))
      .groupBy(githubCommits.repoId);
    for (const r of lc) if (r.repoId !== null && r.at) lastCommit.set(r.repoId, r.at);
  }
  return {
    rows,
    tasks: group(taskRows, (t) => t.projectId!),
    milestones: group(msRows, (m) => m.projectId),
    links: group(linkRows, (l) => l.projectId),
    cards,
    lastCommit,
    inputs,
  };
}

const byDue = (a: TaskRow, b: TaskRow) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity);

function summarize(g: Gathered, r: Gathered["rows"][number], now: Date) {
  const today = sydneyYmd(now);
  const pt = g.tasks.get(r.id) ?? [];
  const pm = g.milestones.get(r.id) ?? [];
  const input = g.inputs.get(r.id)!;
  const dtoP = toProjectDTO(r);
  const prog = progressRule({ tasks: pt.map((t) => ({ completedAt: iso(t.completedAt) })), milestones: pm.map((m) => ({ completedAt: iso(m.completedAt) })) });
  const overdue =
    pt.filter((t) => isTaskOverdue({ completedAt: iso(t.completedAt), dueAt: iso(t.dueAt) }, now)).length +
    pm.filter((m) => isMilestoneOverdue({ completedAt: iso(m.completedAt), dueDate: m.dueDate }, today)).length;
  const hr = healthRule({ status: dtoP.status, targetDate: r.targetDate, today, progressPct: prog.pct, overdue, failingRepos: input.failingRepos });
  const bl = blockers(input);
  const open = pt.filter((t) => t.completedAt === null).sort(byDue);
  return { today, pt, pm, input, dtoP, prog, hr, bl, open };
}

function toCard(g: Gathered, r: Gathered["rows"][number], now: Date): ProjectCardDTO {
  const s = summarize(g, r, now);
  const repoLink = (g.links.get(r.id) ?? []).find((l) => l.kind === "repo" && l.repoId !== null);
  const candidates: { at: Date; label: string }[] = [{ at: r.updatedAt, label: "Project updated" }];
  for (const l of g.links.get(r.id) ?? []) {
    const c = l.repoId === null ? undefined : g.lastCommit.get(l.repoId);
    if (c) candidates.push({ at: c, label: "Commit pushed" });
  }
  for (const t of s.pt) if (t.completedAt) candidates.push({ at: t.completedAt, label: "Task completed" });
  const last = candidates.reduce((a, b) => (b.at.getTime() > a.at.getTime() ? b : a));
  return {
    project: s.dtoP,
    progress: s.prog,
    health: s.hr.health,
    nextTask: s.open[0] ? { id: s.open[0].id, title: s.open[0].title, dueDate: s.open[0].dueDate } : null,
    openTasks: s.open.length,
    lastActivity: { at: last.at.toISOString(), label: last.label },
    repoSparkline: repoLink?.repoId != null ? (g.cards.get(repoLink.repoId)?.sparkline ?? null) : null,
    timeline: timelineBar({ startYmd: sydneyYmd(r.createdAt), targetDate: r.targetDate, today: s.today }),
    blocked: s.bl.length > 0,
  };
}

export async function listProjects(h: DB, now: Date): Promise<ProjectCardDTO[]> {
  const g = await gather(h, now);
  return g.rows.map((r) => toCard(g, r, now));
}

export async function loadActiveProjects(h: DB, now: Date): Promise<ProjectCardDTO[]> {
  return (await listProjects(h, now))
    .filter((c) => c.project.status === "active")
    .sort((a, b) => a.project.priority - b.project.priority || (b.lastActivity?.at ?? "").localeCompare(a.lastActivity?.at ?? ""))
    .slice(0, 4);
}

export async function loadProject(h: DB, id: string, now: Date): Promise<ProjectWorkspaceDTO | null> {
  const g = await gather(h, now, [id]);
  const r = g.rows[0];
  if (!r) return null;
  const s = summarize(g, r, now);

  const done = s.pt.filter((t) => t.completedAt !== null).sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime());
  const taskDtos = [...s.open, ...done].map(toTaskDTO);

  const msDtos: MilestoneDTO[] = s.pm.map((m) => {
    const own = s.pt.filter((t) => t.milestoneId === m.id);
    return { id: m.id, projectId: m.projectId, title: m.title, dueDate: m.dueDate, completedAt: iso(m.completedAt), sortOrder: m.sortOrder, taskCount: own.length, doneCount: own.filter((t) => t.completedAt !== null).length };
  });

  const blockedBy: Record<string, string[]> = {};
  for (const d of s.input.taskDeps) {
    if (d.blockedByDone) continue;
    (blockedBy[d.taskId] ??= []).push(d.blockedByTitle);
  }
  for (const k of Object.keys(blockedBy)) if (!s.open.some((t) => t.id === k)) delete blockedBy[k];

  const links: ProjectLinkDTO[] = [];
  for (const l of g.links.get(id) ?? []) {
    if (l.kind === "repo" && l.repoId !== null) {
      const repo = g.cards.get(l.repoId);
      if (repo) links.push({ id: l.id, kind: "repo", repo });
    } else if (l.url) links.push({ id: l.id, kind: "url", label: l.label ?? l.url, url: l.url });
  }
  const repos = links.flatMap((l) => (l.kind === "repo" ? [l.repo] : []));

  const taskActivity: ActivityItemDTO[] = done.slice(0, 15).map((t) => ({
    id: `task:${t.id}`, kind: "task", title: t.title, repo: null, actor: null, at: t.completedAt!.toISOString(), href: `/projects/${id}?task=${t.id}`, external: false, ci: null,
  }));
  const activity = [...(await repoActivity(h, repos.map((x) => x.id), 15)), ...taskActivity].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15);

  const [conn] = await h.select({ id: connections.id }).from(connections).where(eq(connections.id, "github_read"));
  return {
    project: s.dtoP,
    progress: s.prog,
    health: s.hr.health,
    healthReason: s.hr.reason,
    tasks: taskDtos,
    blockedBy,
    milestones: msDtos,
    blockers: s.bl,
    links,
    dependsOn: s.input.projectDeps,
    activity,
    brief: buildBrief({
      project: s.dtoP,
      health: s.hr.health,
      progress: s.prog,
      openTasks: s.open.map((t) => ({ title: t.title, dueDate: t.dueDate })),
      blockers: s.bl,
      milestones: s.pm.map((m) => ({ title: m.title, dueDate: m.dueDate, completedAt: iso(m.completedAt) })),
      repos: repos.map((x) => ({ fullName: x.fullName, ci: x.ci })),
    }),
    launchCommand: launchCommand(s.dtoP.workspacePath),
    primaryRepoUrl: repos[0]?.htmlUrl ?? null,
    githubConnected: !!conn,
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function searchProjects(h: DB, term: string, limit = 4, now = new Date()): Promise<{ id: string; name: string; category: string; health: Health | null }[]> {
  const rows = await h
    .select({ id: projects.id })
    .from(projects)
    .where(and(ilike(projects.name, `%${escapeLike(term)}%`), ne(projects.status, "archived")))
    .orderBy(desc(projects.updatedAt))
    .limit(limit);
  if (!rows.length) return [];
  const g = await gather(h, now, rows.map((r) => r.id));
  const order = new Map(rows.map((r, i) => [r.id, i]));
  return g.rows
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
    .map((r) => ({ id: r.id, name: r.name, category: r.category, health: summarize(g, r, now).hr.health }));
}
