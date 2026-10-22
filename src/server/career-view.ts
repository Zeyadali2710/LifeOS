import { createHash } from "node:crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "./db/client";
import { githubCommits, githubIssues, githubPullRequests, githubWorkflowRuns, projects } from "./db/schema";
import { createGithub } from "./github/client";
import { readToken } from "./github/connections";
import { ciChip } from "@/lib/project-rules";

// Private response cache is token-scoped and bounded; never reuse the sync's ETags without its response body.
const cache = new Map<string, { data: unknown; etag?: string; until: number }>();
async function reader(h: DB) {
  const token = await readToken(h).catch(() => null);
  if (!token) return null;
  const scope = createHash("sha256").update(token).digest("hex");
  const gh = createGithub({ token, timeoutMs: 4000 });
  return async <T>(path: string, schema: z.ZodType<T>): Promise<T | null> => {
    const key = `${scope}:${path}`;
    const old = cache.get(key);
    if (old && old.until > Date.now()) return schema.parse(old.data);
    try {
      const result = await gh.get(path, schema, { etag: old?.etag });
      const data = result.status === 304 ? schema.parse(old?.data) : result.data;
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(key, { data, etag: result.status === 200 ? result.etag ?? undefined : old?.etag, until: Date.now() + 60_000 });
      return data;
    } catch {
      return null;
    }
  };
}

const repoMeta = z.object({ full_name: z.string(), stargazers_count: z.number(), topics: z.array(z.string()).default([]) });
const branch = z.object({ name: z.string() });
const file = z.object({ name: z.string(), path: z.string(), type: z.string(), html_url: z.string().nullable() });
const week = z.object({ week: z.number(), total: z.number(), days: z.array(z.number()) });
const contributor = z.object({ login: z.string(), contributions: z.number(), html_url: z.string() });
const pull = z.object({ number: z.number(), head: z.object({ ref: z.string(), sha: z.string() }), base: z.object({ ref: z.string() }) });
const check = z.object({ name: z.string(), status: z.string(), conclusion: z.string().nullable() });
const run = z.object({ id: z.number(), run_number: z.number(), display_title: z.string(), run_started_at: z.string().nullable(), updated_at: z.string(), status: z.string() });

export async function loadCareerView(h: DB, now: Date) {
  const start = new Date(now.getTime() - 372 * 86_400_000);
  const [commits, merged, runs, get] = await Promise.all([
    h.select({ repoId: githubCommits.repoId, at: githubCommits.committedAt }).from(githubCommits).where(gte(githubCommits.committedAt, start)),
    h.select({ at: githubPullRequests.mergedAt }).from(githubPullRequests).where(and(eq(githubPullRequests.merged, true), gte(githubPullRequests.mergedAt, new Date(now.getTime() - 30 * 86_400_000)))),
    h.select({ conclusion: githubWorkflowRuns.conclusion }).from(githubWorkflowRuns).where(and(eq(githubWorkflowRuns.status, "completed"), gte(githubWorkflowRuns.ghCreatedAt, new Date(now.getTime() - 30 * 86_400_000)))),
    reader(h),
  ]);
  // shortcut: first 100 accessible repositories supply optional stars; paginate if the owner exceeds that size.
  const metadata = get ? await get("/user/repos?per_page=100&sort=pushed", z.array(repoMeta)) : null;
  return {
    contributions: commits.flatMap((c) => c.repoId && c.at ? [{ repoId: c.repoId, at: c.at.toISOString() }] : []),
    merged30: merged.length,
    passRate: runs.length ? Math.round(runs.filter((r) => r.conclusion === "success").length / runs.length * 100) : null,
    stars: Object.fromEntries((metadata ?? []).map((r) => [r.full_name, r.stargazers_count])),
  };
}

export async function loadRepoView(h: DB, repoId: number, fullName: string, selectedBranch?: string, tab = "code") {
  const [merged, labels, runs, projectOptions, get] = await Promise.all([
    h.select().from(githubPullRequests).where(and(eq(githubPullRequests.repoId, repoId), eq(githubPullRequests.merged, true))).orderBy(desc(githubPullRequests.mergedAt)).limit(30),
    h.select({ number: githubIssues.number, labels: githubIssues.labels, at: githubIssues.ghUpdatedAt }).from(githubIssues).where(eq(githubIssues.repoId, repoId)),
    h.select().from(githubWorkflowRuns).where(eq(githubWorkflowRuns.repoId, repoId)).orderBy(desc(githubWorkflowRuns.ghCreatedAt)).limit(12),
    h.select({ id: projects.id, name: projects.name }).from(projects).orderBy(projects.name),
    reader(h),
  ]);
  const path = `/repos/${fullName.split("/").map(encodeURIComponent).join("/")}`;
  const ref = selectedBranch ? `?ref=${encodeURIComponent(selectedBranch)}` : "";
  const [meta, branches, files, readme, weeks, frequency, contributors, pulls, liveRuns] = get ? await Promise.all([
    get(path, repoMeta),
    tab === "code" ? get(`${path}/branches?per_page=100`, z.array(branch)) : null,
    tab === "code" ? get(`${path}/contents${ref}`, z.array(file)) : null,
    tab === "code" ? get(`${path}/readme${ref}`, z.object({ content: z.string().max(1_500_000), encoding: z.literal("base64") })) : null,
    tab === "code" || tab === "insights" ? get(`${path}/stats/commit_activity`, z.array(week)) : null,
    tab === "insights" ? get(`${path}/stats/code_frequency`, z.array(z.tuple([z.number(), z.number(), z.number()]))) : null,
    tab === "insights" ? get(`${path}/contributors?per_page=30`, z.array(contributor)) : null,
    tab === "prs" ? get(`${path}/pulls?state=open&per_page=100`, z.array(pull)) : null,
    tab === "code" || tab === "actions" ? get(`${path}/actions/runs?per_page=12`, z.object({ workflow_runs: z.array(run) })) : null,
  ]) : [null, null, null, null, null, null, null, null, null];
  // shortcut: checks are fetched for the first 10 open PRs; expand when a repository needs a larger review queue.
  const checks = get ? await Promise.all((pulls ?? []).slice(0, 10).map(async (p) => {
    const result = await get(`${path}/commits/${encodeURIComponent(p.head.sha)}/check-runs?per_page=100`, z.object({ check_runs: z.array(check) }));
    return { number: p.number, checks: result?.check_runs ?? null };
  })) : [];
  // shortcut: fetch commit metadata for the first 30 root entries; extend only if larger roots need it.
  const entries = get ? await Promise.all((files ?? []).map(async (f, i) => {
    const last = i < 30 ? await get(`${path}/commits?per_page=1&path=${encodeURIComponent(f.path)}${selectedBranch ? `&sha=${encodeURIComponent(selectedBranch)}` : ""}`, z.array(z.object({ commit: z.object({ message: z.string(), committer: z.object({ date: z.string().nullable() }).nullable() }) }))) : null;
    return { ...f, message: last?.[0]?.commit.message.split("\n")[0] ?? null, at: last?.[0]?.commit.committer?.date ?? null };
  })) : [];
  return {
    topics: meta?.topics ?? [], stars: meta?.stargazers_count ?? null,
    branches: branches?.map((b) => b.name) ?? [], branchesLimited: branches?.length === 100,
    files: entries, filesUnavailable: files === null, filesLimited: (files?.length ?? 0) > 30,
    readme: readme ? Buffer.from(readme.content, "base64").toString("utf8") : null,
    weeks: weeks?.slice(-12) ?? [],
    commits30: weeks ? weeks.reduce((total, w) => total + w.days.reduce((n, commits, i) => n + ((w.week + i * 86_400) * 1000 >= Date.now() - 30 * 86_400_000 ? commits : 0), 0), 0) : null,
    frequency: frequency?.filter(([at]) => at * 1000 >= Date.now() - 30 * 86_400_000) ?? [],
    contributors: contributors ?? [],
    merged: merged.map((p) => ({ number: p.number, title: p.title ?? "", author: p.authorLogin, url: p.htmlUrl, at: p.mergedAt?.toISOString() ?? null })),
    labels: labels.map((i) => ({ number: i.number, labels: i.labels ?? [], at: i.at?.toISOString() ?? null })),
    pulls: (pulls ?? []).map((p) => ({ number: p.number, branch: `${p.head.ref} → ${p.base.ref}`, checks: checks.find((c) => c.number === p.number)?.checks ?? null })),
    runs: runs.map((r) => {
      const live = liveRuns?.workflow_runs.find((w) => w.id === r.id);
      const seconds = live?.status === "completed" && live.run_started_at ? Math.max(0, Math.round((Date.parse(live.updated_at) - Date.parse(live.run_started_at)) / 1000)) : null;
      return { id: r.id, name: live?.display_title ?? r.name ?? "Workflow run", branch: r.branch, ci: ciChip([{ branch: r.branch, status: r.status, conclusion: r.conclusion, at: r.ghCreatedAt?.toISOString() ?? null }], null), at: r.ghCreatedAt?.toISOString() ?? null, url: r.htmlUrl, number: live?.run_number ?? null, seconds };
    }),
    projectOptions,
  };
}

export type CareerViewData = Awaited<ReturnType<typeof loadCareerView>>;
export type RepoViewData = Awaited<ReturnType<typeof loadRepoView>>;
