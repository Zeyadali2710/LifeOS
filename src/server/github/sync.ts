import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { isSafeGithubUrl } from "../../lib/safe-url";
import { db, type DB } from "../db/client";
import { connections, githubCommits, githubEtags, githubIssues, githubPullRequests, githubRepos, githubWorkflowRuns } from "../db/schema";
import { emitActivity } from "../events";
import { log } from "../log";
import { formatHM } from "../time";
import { createGithub, GithubError } from "./client";
import { markConnectionError, readToken, recordSync } from "./connections";

const User = z.object({ login: z.string() });
const Repo = z.object({
  id: z.number(),
  full_name: z.string(),
  name: z.string(),
  owner: z.object({ login: z.string() }),
  private: z.boolean(),
  default_branch: z.string().nullish(),
  html_url: z.string(),
  description: z.string().nullish(),
  language: z.string().nullish(),
  archived: z.boolean(),
  pushed_at: z.string().nullish(),
});
const Login = z.object({ login: z.string() }).nullish();
const Pull = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  state: z.string(),
  draft: z.boolean().optional(),
  merged_at: z.string().nullish(),
  user: Login,
  html_url: z.string(),
  requested_reviewers: z.array(z.object({ login: z.string() })).default([]),
  updated_at: z.string(),
});
const Review = z.object({ user: Login, state: z.string(), submitted_at: z.string().nullish() });
const Issue = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  state: z.string(),
  user: Login,
  assignees: z.array(z.object({ login: z.string() })).default([]),
  labels: z.array(z.union([z.string(), z.object({ name: z.string() })])).default([]),
  html_url: z.string(),
  updated_at: z.string(),
  pull_request: z.unknown().optional(),
});
const Commit = z.object({
  sha: z.string(),
  html_url: z.string(),
  author: Login,
  commit: z.object({ message: z.string(), author: z.object({ date: z.string().nullish() }).nullish() }),
});
const Runs = z.object({
  workflow_runs: z.array(
    z.object({
      id: z.number(),
      name: z.string().nullish(),
      head_branch: z.string().nullish(),
      status: z.string().nullish(),
      conclusion: z.string().nullish(),
      html_url: z.string(),
      head_sha: z.string().nullish(),
      created_at: z.string(),
    }),
  ),
});

export type SyncResult = { skipped: "not_connected" } | { error: "auth" | "rate_limit" | "other" } | { ok: true; repos: number; events: number };

const t = (s: string | null | undefined) => s?.slice(0, 2000) ?? null;
const d = (s: string | null | undefined) => (s ? new Date(s) : null);
const DAY = 86_400_000;

type Opts = { handle?: DB; fetch?: typeof globalThis.fetch; emit?: typeof emitActivity; now?: () => Date };

export function createSync(opts: Opts = {}) {
  async function run(): Promise<SyncResult> {
    const h = opts.handle ?? db();
    const emit = opts.emit ?? emitActivity;
    const now = (opts.now ?? (() => new Date()))();
    try {
      const token = await readToken(h);
      if (!token) return { skipped: "not_connected" };
      const [conn] = await h.select().from(connections).where(eq(connections.id, "github_read"));
      const firstSync = !conn?.lastSyncAt;
      const gh = createGithub({ token, fetch: opts.fetch });
      let events = 0;
      const out = async (a: Parameters<typeof emit>[0], n?: Parameters<typeof emit>[1]) => {
        events++;
        await emit(a, n, h);
      };

      // ETag-conditional GET (If-None-Match via client): null when unchanged (304).
      async function cond<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
        const [prev] = await h.select().from(githubEtags).where(eq(githubEtags.url, path));
        const r = await gh.get(path, schema, { etag: prev?.etag });
        if (r.status === 304) return null;
        if (r.etag) await h.insert(githubEtags).values({ url: path, etag: r.etag }).onConflictDoUpdate({ target: githubEtags.url, set: { etag: r.etag } });
        return r.data;
      }

      let owner: string;
      try {
        const me = await gh.get("/user", User);
        if (me.status !== 200) return { error: "other" };
        owner = me.data.login;
      } catch (e) {
        if (e instanceof GithubError && e.kind === "auth") {
          const wasOk = conn?.status !== "error";
          await markConnectionError(h, "github_read", "GitHub token rejected");
          if (wasOk) {
            await emit(
              { type: "github.connection_error", source: "github", title: "GitHub connection needs attention", tone: "red" },
              { category: "IMPORTANT", title: "GitHub connection needs attention", body: "GitHub rejected the read token. Sync is paused until you update it in Settings." },
              h,
            );
          }
          return { error: "auth" };
        }
        throw e;
      }

      const repoData = await cond("/user/repos?per_page=100&sort=pushed", z.array(Repo)); // ponytail: first page only (ETag); >100 repos need paging
      const known = new Set((await h.select({ id: githubRepos.id }).from(githubRepos)).map((r) => r.id));

      if (repoData) {
        for (const r of repoData) {
          const row = {
            fullName: r.full_name, owner: r.owner.login, name: r.name, private: r.private, defaultBranch: r.default_branch ?? null,
            htmlUrl: r.html_url, description: t(r.description), language: r.language ?? null, archived: r.archived, pushedAt: d(r.pushed_at), syncedAt: now,
          };
          await h.insert(githubRepos).values({ id: r.id, ...row }).onConflictDoUpdate({ target: githubRepos.id, set: row });
        }
      }
      const repoRows = repoData
        ? repoData.map((r) => ({ id: r.id, full_name: r.full_name, default_branch: r.default_branch, archived: r.archived, pushed_at: r.pushed_at }))
        : (await h.select().from(githubRepos)).map((r) => ({ id: r.id, full_name: r.fullName, default_branch: r.defaultBranch, archived: !!r.archived, pushed_at: r.pushedAt?.toISOString() ?? null }));

      const cutoff = now.getTime() - 90 * DAY;
      const active = repoRows.filter((r) => !r.archived && r.pushed_at && Date.parse(r.pushed_at) >= cutoff).slice(0, 30);

      for (const r of active) {
        const first = !known.has(r.id);
        const base = `/repos/${r.full_name}`;
        const branch = r.default_branch ?? "main";

        const pulls = await cond(`${base}/pulls?state=all&sort=updated&per_page=50`, z.array(Pull));
        if (pulls?.length) {
          const prev = new Map((await h.select().from(githubPullRequests).where(inArray(githubPullRequests.id, pulls.map((p) => p.id)))).map((p) => [p.id, p]));
          for (const p of pulls) {
            const old = prev.get(p.id);
            const merged = !!p.merged_at;
            const reviewers = p.requested_reviewers.map((x) => x.login);
            let reviews = old?.reviews ?? [];
            if (p.state === "open") {
              const rv = await gh.paginate(`${base}/pulls/${p.number}/reviews?per_page=30`, Review, 1);
              reviews = rv.map((x) => ({ login: x.user?.login ?? "ghost", state: x.state, submittedAt: x.submitted_at ?? null }));
            }
            const row = {
              repoId: r.id, number: p.number, title: t(p.title), state: p.state, draft: p.draft ?? false, merged, mergedAt: d(p.merged_at),
              authorLogin: p.user?.login ?? null, htmlUrl: p.html_url, requestedReviewers: reviewers, reviews, ghUpdatedAt: d(p.updated_at),
            };
            await h.insert(githubPullRequests).values({ id: p.id, ...row }).onConflictDoUpdate({ target: githubPullRequests.id, set: row });
            if (first) continue;
            const label = `${r.full_name}#${p.number} ${t(p.title)}`;
            if (old && !old.merged && merged) {
              await out({ type: "github.pr.merged", source: "github", title: "Pull request merged", detail: label, tone: "green" });
            }
            if (reviewers.includes(owner) && !old?.requestedReviewers?.includes(owner)) {
              await out({ type: "github.pr.review_requested", source: "github", title: "Review requested", detail: label, tone: "amber" });
            }
          }
        }

        const issues = await cond(`${base}/issues?state=all&per_page=50`, z.array(Issue));
        for (const i of issues ?? []) {
          const mine = i.user?.login === owner || i.assignees.some((a) => a.login === owner);
          if (i.pull_request || !mine) continue;
          const row = {
            repoId: r.id, number: i.number, title: t(i.title), state: i.state, authorLogin: i.user?.login ?? null,
            assignees: i.assignees.map((a) => a.login), labels: i.labels.map((l) => (typeof l === "string" ? l : l.name)),
            htmlUrl: i.html_url, ghUpdatedAt: d(i.updated_at),
          };
          await h.insert(githubIssues).values({ id: i.id, ...row }).onConflictDoUpdate({ target: githubIssues.id, set: row });
        }

        const commits = await cond(`${base}/commits?sha=${encodeURIComponent(branch)}&per_page=20`, z.array(Commit));
        if (commits?.length) {
          await h
            .insert(githubCommits)
            .values(commits.map((c) => ({ sha: c.sha, repoId: r.id, message: t(c.commit.message.split("\n")[0]), authorLogin: c.author?.login ?? null, committedAt: d(c.commit.author?.date), htmlUrl: c.html_url })))
            .onConflictDoNothing();
        }

        const runs = await cond(`${base}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=5`, Runs);
        if (runs?.workflow_runs.length) {
          const ids = runs.workflow_runs.map((w) => w.id);
          const seen = new Set((await h.select({ id: githubWorkflowRuns.id }).from(githubWorkflowRuns).where(inArray(githubWorkflowRuns.id, ids))).map((x) => x.id));
          for (const w of runs.workflow_runs) {
            const row = { repoId: r.id, name: t(w.name), branch: w.head_branch ?? null, status: w.status ?? null, conclusion: w.conclusion ?? null, htmlUrl: w.html_url, headSha: w.head_sha ?? null, ghCreatedAt: d(w.created_at) };
            await h.insert(githubWorkflowRuns).values({ id: w.id, ...row }).onConflictDoUpdate({ target: githubWorkflowRuns.id, set: row });
            if (first || seen.has(w.id) || w.conclusion !== "failure" || w.head_branch !== branch) continue;
            await out(
              { type: "github.ci.failed", source: "github", title: "CI failed", detail: `${r.full_name} ${w.name ?? ""}`.trim(), tone: "red" },
              {
                category: "IMPORTANT",
                title: `CI failed on ${r.full_name}`,
                body: `${w.name ?? "Workflow"} failed on ${branch} at ${formatHM(d(w.created_at) ?? now)}.`,
                ...(isSafeGithubUrl(w.html_url) ? { actionUrl: w.html_url } : {}),
              },
            );
          }
        }
      }

      if (conn?.status === "error") await h.update(connections).set({ status: "connected", lastError: null }).where(eq(connections.id, "github_read"));
      await recordSync(h, { at: now, error: null, repos: repoData?.map((r) => r.full_name) });
      if (events > 0 && !firstSync) {
        await emit({ type: "github.synced", source: "github", title: "GitHub synced", detail: `${events} updates` }, undefined, h);
      }
      return { ok: true, repos: repoRows.length, events };
    } catch (e) {
      const rate = e instanceof GithubError && e.kind === "rate_limit";
      if (!(e instanceof GithubError)) log.error({ err: e }, "github sync failed");
      const msg = rate ? "GitHub rate limit reached. LifeOS retries automatically." : "GitHub sync failed. LifeOS retries automatically.";
      await recordSync(h, { at: now, error: msg }).catch(() => {});
      return { error: rate ? "rate_limit" : "other" };
    }
  }
  return { run };
}
