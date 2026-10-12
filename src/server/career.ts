// Read-only career queries over the synced github_* tables. Pure computation lives in lib/project-rules.
import { and, count, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { isSafeGithubUrl } from "../lib/safe-url";
import type { ActivityItemDTO, CareerDTO, RepoCardDTO, RepoDetailDTO } from "../lib/project-types";
import { ciChip, ciHealth, languageBar, sparkline, type RunRow } from "../lib/project-rules";
import type { DB } from "./db/client";
import {
  connections,
  githubCommits,
  githubIssues,
  githubPullRequests,
  githubRepos,
  githubWorkflowRuns,
  projectLinks,
  projects,
} from "./db/schema";

const DAY = 86_400_000;
const iso = (d: Date | null) => d?.toISOString() ?? null;
const href = (u: string | null) => (isSafeGithubUrl(u) ? u : null);
const oneRun = (w: { status: string | null; conclusion: string | null }) => ciChip([{ branch: null, status: w.status, conclusion: w.conclusion, at: null }], null);

async function cardsWithHealth(h: DB, now: Date, repoIds?: number[]): Promise<{ card: RepoCardDTO; failing: boolean }[]> {
  if (repoIds && repoIds.length === 0) return [];
  const scope = (col: AnyPgColumn) => (repoIds ? inArray(col, repoIds) : undefined);
  const repos = await h.select().from(githubRepos).where(scope(githubRepos.id)).orderBy(desc(githubRepos.pushedAt));

  // P2: state filtered at query time, never trusted from a stored counter.
  const counts = async (t: typeof githubPullRequests | typeof githubIssues) => {
    const rows = await h
      .select({ repoId: t.repoId, n: count() })
      .from(t)
      .where(and(eq(t.state, "open"), scope(t.repoId)))
      .groupBy(t.repoId);
    return new Map(rows.map((r) => [r.repoId, r.n]));
  };
  const [prs, issues] = await Promise.all([counts(githubPullRequests), counts(githubIssues)]);

  const runRows = await h
    .select({ repoId: githubWorkflowRuns.repoId, branch: githubWorkflowRuns.branch, status: githubWorkflowRuns.status, conclusion: githubWorkflowRuns.conclusion, at: githubWorkflowRuns.ghCreatedAt })
    .from(githubWorkflowRuns)
    .where(scope(githubWorkflowRuns.repoId))
    .orderBy(githubWorkflowRuns.repoId, desc(githubWorkflowRuns.ghCreatedAt));
  const runs = new Map<number, RunRow[]>();
  for (const r of runRows) {
    const list = runs.get(r.repoId!) ?? [];
    if (list.length < 5) list.push({ branch: r.branch, status: r.status, conclusion: r.conclusion, at: iso(r.at) });
    runs.set(r.repoId!, list);
  }

  // 16 days back covers 14 Sydney days whatever the UTC offset; sparkline() does the exact bucketing.
  const commitRows = await h
    .select({ repoId: githubCommits.repoId, at: githubCommits.committedAt })
    .from(githubCommits)
    .where(and(gte(githubCommits.committedAt, new Date(now.getTime() - 16 * DAY)), scope(githubCommits.repoId)));
  const dates = new Map<number, Date[]>();
  for (const c of commitRows) if (c.at) dates.set(c.repoId!, [...(dates.get(c.repoId!) ?? []), c.at]);

  return repos.map((r) => {
    const rr = runs.get(r.id) ?? [];
    const spark = sparkline(dates.get(r.id) ?? [], now, 14);
    return {
      failing: ciHealth(rr, r.defaultBranch).state === "failing",
      card: {
        id: r.id,
        fullName: r.fullName,
        owner: r.owner,
        name: r.name ?? r.fullName.split("/")[1] ?? r.fullName,
        description: r.description,
        htmlUrl: href(r.htmlUrl),
        defaultBranch: r.defaultBranch,
        private: !!r.private,
        archived: !!r.archived,
        primaryLanguage: r.language,
        languages: languageBar(r.languages ?? null, r.language),
        ci: ciChip(rr, r.defaultBranch),
        pushedAt: iso(r.pushedAt),
        openPrs: prs.get(r.id) ?? 0,
        openIssues: issues.get(r.id) ?? 0,
        sparkline: spark,
        commits14: spark.reduce((a, b) => a + b, 0),
        // mirrors the sync's active window (non-archived, pushed within 90 days)
        synced: !r.archived && !!r.pushedAt && r.pushedAt.getTime() >= now.getTime() - 90 * DAY,
      },
    };
  });
}

export async function repoCards(h: DB, now: Date, repoIds?: number[]): Promise<RepoCardDTO[]> {
  return (await cardsWithHealth(h, now, repoIds)).map((x) => x.card);
}

// null repoIds = all repos. Newest first across commits, PRs, issues and CI runs.
export async function repoActivity(h: DB, repoIds: number[] | null, limit: number): Promise<ActivityItemDTO[]> {
  if (repoIds && repoIds.length === 0) return [];
  const scope = (col: AnyPgColumn) => (repoIds ? inArray(col, repoIds) : undefined);

  const [commits, prs, issues, runs] = await Promise.all([
    h
      .select({ c: githubCommits, repo: githubRepos.fullName })
      .from(githubCommits)
      .innerJoin(githubRepos, eq(githubCommits.repoId, githubRepos.id))
      .where(and(isNotNull(githubCommits.committedAt), scope(githubCommits.repoId)))
      .orderBy(desc(githubCommits.committedAt))
      .limit(limit),
    h
      .select({ p: githubPullRequests, repo: githubRepos.fullName })
      .from(githubPullRequests)
      .innerJoin(githubRepos, eq(githubPullRequests.repoId, githubRepos.id))
      .where(and(isNotNull(githubPullRequests.ghUpdatedAt), scope(githubPullRequests.repoId)))
      .orderBy(desc(githubPullRequests.ghUpdatedAt))
      .limit(limit),
    h
      .select({ i: githubIssues, repo: githubRepos.fullName })
      .from(githubIssues)
      .innerJoin(githubRepos, eq(githubIssues.repoId, githubRepos.id))
      .where(and(isNotNull(githubIssues.ghUpdatedAt), scope(githubIssues.repoId)))
      .orderBy(desc(githubIssues.ghUpdatedAt))
      .limit(limit),
    h
      .select({ w: githubWorkflowRuns, repo: githubRepos.fullName })
      .from(githubWorkflowRuns)
      .innerJoin(githubRepos, eq(githubWorkflowRuns.repoId, githubRepos.id))
      .where(and(isNotNull(githubWorkflowRuns.ghCreatedAt), scope(githubWorkflowRuns.repoId)))
      .orderBy(desc(githubWorkflowRuns.ghCreatedAt))
      .limit(limit),
  ]);

  const items: ActivityItemDTO[] = [
    ...commits.map(({ c, repo }) => ({ id: `commit:${c.sha}`, kind: "commit" as const, title: c.message ?? "(no message)", repo, actor: c.authorLogin, at: c.committedAt!.toISOString(), href: href(c.htmlUrl), external: true, ci: null })),
    ...prs.map(({ p, repo }) => ({ id: `pr:${p.id}`, kind: "pr" as const, title: `#${p.number} ${p.title ?? ""}`.trim(), repo, actor: p.authorLogin, at: p.ghUpdatedAt!.toISOString(), href: href(p.htmlUrl), external: true, ci: null })),
    ...issues.map(({ i, repo }) => ({ id: `issue:${i.id}`, kind: "issue" as const, title: `#${i.number} ${i.title ?? ""}`.trim(), repo, actor: i.authorLogin, at: i.ghUpdatedAt!.toISOString(), href: href(i.htmlUrl), external: true, ci: null })),
    ...runs.map(({ w, repo }) => ({ id: `ci:${w.id}`, kind: "ci" as const, title: w.name ?? "Workflow run", repo, actor: null, at: w.ghCreatedAt!.toISOString(), href: href(w.htmlUrl), external: true, ci: oneRun(w) })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export async function loadCareer(h: DB, now: Date): Promise<CareerDTO> {
  const [conn] = await h.select().from(connections).where(eq(connections.id, "github_read"));
  if (!conn) return { connection: { status: "none", lastSyncAt: null, lastSyncError: null }, repos: [], activity: [], tiles: { repos: 0, openPrs: 0, openIssues: 0, ciFailing: 0 } };
  const connection: CareerDTO["connection"] = {
    status: conn.status === "error" || conn.lastSyncError ? "error" : "connected",
    lastSyncAt: iso(conn.lastSyncAt),
    lastSyncError: conn.lastSyncError,
  };

  const all = await cardsWithHealth(h, now);
  const live = all.filter((x) => !x.card.archived);
  return {
    connection,
    repos: all.map((x) => x.card),
    activity: await repoActivity(h, null, 20),
    tiles: {
      repos: live.length,
      openPrs: live.reduce((n, x) => n + x.card.openPrs, 0),
      openIssues: live.reduce((n, x) => n + x.card.openIssues, 0),
      ciFailing: live.filter((x) => x.failing).length,
    },
  };
}

type Review = { login: string; state: string; submittedAt: string | null };
function reviewState(draft: boolean, reviews: Review[]): RepoDetailDTO["pulls"][number]["review"] {
  if (draft) return "draft";
  const latest = new Map<string, string>();
  for (const r of [...reviews].sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""))) {
    if (["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(r.state)) latest.set(r.login, r.state);
  }
  const states = [...latest.values()];
  if (states.includes("CHANGES_REQUESTED")) return "changes_requested";
  return states.includes("APPROVED") ? "approved" : "review_required";
}

export async function loadRepoDetail(h: DB, fullName: string, now: Date): Promise<RepoDetailDTO | null> {
  const [r] = await h.select({ id: githubRepos.id }).from(githubRepos).where(eq(githubRepos.fullName, fullName));
  if (!r) return null;
  const [cards, pulls, issues, runs, commits, links] = await Promise.all([
    repoCards(h, now, [r.id]),
    h.select().from(githubPullRequests).where(and(eq(githubPullRequests.repoId, r.id), eq(githubPullRequests.state, "open"))).orderBy(desc(githubPullRequests.ghUpdatedAt)),
    h.select().from(githubIssues).where(and(eq(githubIssues.repoId, r.id), eq(githubIssues.state, "open"))).orderBy(desc(githubIssues.ghUpdatedAt)),
    h.select().from(githubWorkflowRuns).where(eq(githubWorkflowRuns.repoId, r.id)).orderBy(desc(githubWorkflowRuns.ghCreatedAt)).limit(10),
    h.select().from(githubCommits).where(eq(githubCommits.repoId, r.id)).orderBy(desc(githubCommits.committedAt)).limit(20),
    h.select({ id: projects.id, name: projects.name }).from(projectLinks).innerJoin(projects, eq(projectLinks.projectId, projects.id)).where(eq(projectLinks.repoId, r.id)),
  ]);
  return {
    repo: cards[0]!,
    pulls: pulls.map((p) => ({ number: p.number ?? 0, title: p.title ?? "", author: p.authorLogin, url: href(p.htmlUrl), review: reviewState(!!p.draft, p.reviews ?? []) })),
    issues: issues.map((i) => ({ number: i.number ?? 0, title: i.title ?? "", author: i.authorLogin, url: href(i.htmlUrl) })),
    runs: runs.map((w) => ({ id: w.id, name: w.name, branch: w.branch, ci: oneRun(w), url: href(w.htmlUrl), at: iso(w.ghCreatedAt) })),
    commits: commits.map((c) => ({ sha: c.sha, message: c.message ?? "", author: c.authorLogin, url: href(c.htmlUrl), at: iso(c.committedAt) })),
    projects: links,
  };
}
