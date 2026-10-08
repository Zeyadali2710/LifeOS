import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { issuePayloadSchema } from "@/lib/issue-payload";
import { approvals, githubCommits, githubIssues, githubPullRequests, githubRepos, githubWorkflowRuns } from "../../db/schema";
import { createGithub } from "../../github/client";
import { getConnections, readToken, writeToken } from "../../github/connections";
import { ToolError, type Tool, type ToolContext } from "../types";

const NOT_CONNECTED = "GitHub isn't connected yet. Add a read token in Settings → Connections.";
const MAX_STR = 2000;
const cut = (s: string | null | undefined) => (s ?? "").slice(0, MAX_STR);

const repoArg = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const limit = z.number().int().min(1).max(50).default(20);
const state = z.enum(["open", "closed", "all"]).default("open");

// One output envelope for every read: items are bounded public metadata only.
const listOut = z.object({ connected: z.boolean(), message: z.string().optional(), items: z.array(z.record(z.string(), z.unknown())) });
type ListOut = z.infer<typeof listOut>;

const connection = async (ctx: ToolContext, id: "github_read" | "github_write") =>
  (await getConnections(ctx.handle)).find((c) => c.id === id)!;

async function repoRow(ctx: ToolContext, repo: string) {
  const [r] = await ctx.handle.select().from(githubRepos).where(eq(githubRepos.fullName, repo));
  if (!r) throw new ToolError("not_found", `Unknown repository ${repo}`);
  return r;
}

const resolveRepo = async <I extends { repo?: string }>(input: I, ctx: ToolContext): Promise<I> => {
  if (input.repo) await repoRow(ctx, input.repo);
  return input;
};

// Wraps a DB read: not-connected short-circuit + optional repo filter id.
function dbRead<I extends { repo?: string; limit: number }>(
  name: string,
  label: string,
  description: string,
  input: z.ZodType<I>,
  run: (i: I, ctx: ToolContext, repoId: number | null, login: string) => Promise<Record<string, unknown>[]>,
): Tool<I, ListOut> {
  return {
    name: `github.${name}`,
    label,
    description,
    input,
    output: listOut,
    tier: "READ",
    sideEffect: false,
    resolve: resolveRepo,
    async handler(i, ctx) {
      const c = await connection(ctx, "github_read");
      if (c.status === "none") return { connected: false, message: NOT_CONNECTED, items: [] };
      const repoId = i.repo ? (await repoRow(ctx, i.repo)).id : null;
      return { connected: true, items: (await run(i, ctx, repoId, c.login ?? "")).slice(0, i.limit) };
    },
  };
}

const repoNames = async (ctx: ToolContext, ids: number[]) =>
  new Map((ids.length ? await ctx.handle.select().from(githubRepos).where(inArray(githubRepos.id, ids)) : []).map((r) => [r.id, r.fullName]));

const listRepos = dbRead("list_repos", "Searching your repositories", "List synced GitHub repositories, most recently pushed first.", z.object({ limit }), async (i, ctx) =>
  (await ctx.handle.select().from(githubRepos).orderBy(desc(githubRepos.pushedAt)).limit(i.limit)).map((r) => ({
    repo: r.fullName,
    private: r.private,
    defaultBranch: r.defaultBranch,
    url: r.htmlUrl,
  })),
);

const listPrs = dbRead(
  "list_pull_requests",
  "Reading pull requests",
  "List synced pull requests, optionally filtered by repo, state, or review requested from the owner.",
  z.object({ repo: repoArg.optional(), state, reviewRequested: z.boolean().optional(), limit }),
  async (i, ctx, repoId, login) => {
    const rows = await ctx.handle
      .select()
      .from(githubPullRequests)
      .where(and(repoId ? eq(githubPullRequests.repoId, repoId) : undefined, i.state === "all" ? undefined : eq(githubPullRequests.state, i.state)))
      .orderBy(desc(githubPullRequests.ghUpdatedAt));
    const names = await repoNames(ctx, [...new Set(rows.map((r) => r.repoId!))]);
    return rows
      .filter((r) => !i.reviewRequested || (r.requestedReviewers ?? []).includes(login))
      .map((r) => ({
        ref: `${names.get(r.repoId!)}#${r.number}`,
        title: cut(r.title),
        state: r.state,
        draft: r.draft,
        merged: r.merged,
        author: r.authorLogin,
        url: r.htmlUrl,
        reviews: (r.reviews ?? []).slice(0, 20).map((v) => ({ login: v.login, state: v.state })),
      }));
  },
);

const listIssues = dbRead(
  "list_issues",
  "Reading issues",
  "List synced issues, optionally filtered by repo, state, or assigned to the owner.",
  z.object({ repo: repoArg.optional(), state, assignedToMe: z.boolean().optional(), limit }),
  async (i, ctx, repoId, login) => {
    const rows = await ctx.handle
      .select()
      .from(githubIssues)
      .where(and(repoId ? eq(githubIssues.repoId, repoId) : undefined, i.state === "all" ? undefined : eq(githubIssues.state, i.state)))
      .orderBy(desc(githubIssues.ghUpdatedAt));
    const names = await repoNames(ctx, [...new Set(rows.map((r) => r.repoId!))]);
    return rows
      .filter((r) => !i.assignedToMe || (r.assignees ?? []).includes(login))
      .map((r) => ({
        ref: `${names.get(r.repoId!)}#${r.number}`,
        title: cut(r.title),
        state: r.state,
        author: r.authorLogin,
        assignees: r.assignees,
        labels: r.labels,
        url: r.htmlUrl,
      }));
  },
);

const recentCommits = dbRead(
  "recent_commits",
  "Reading recent commits",
  "List recent synced commits, newest first, optionally for one repo.",
  z.object({ repo: repoArg.optional(), limit }),
  async (i, ctx, repoId) => {
    const rows = await ctx.handle
      .select()
      .from(githubCommits)
      .where(repoId ? eq(githubCommits.repoId, repoId) : undefined)
      .orderBy(desc(githubCommits.committedAt))
      .limit(i.limit);
    const names = await repoNames(ctx, [...new Set(rows.map((r) => r.repoId!))]);
    return rows.map((r) => ({
      repo: names.get(r.repoId!),
      sha: r.sha.slice(0, 7),
      message: cut(r.message),
      author: r.authorLogin,
      committedAt: r.committedAt?.toISOString() ?? null,
      url: r.htmlUrl,
    }));
  },
);

const ciStatus = dbRead(
  "ci_status",
  "Checking CI status",
  "Latest CI workflow run on each repo's default branch.",
  z.object({ repo: repoArg.optional(), limit }),
  async (i, ctx, repoId) => {
    const repos = await ctx.handle.select().from(githubRepos).where(repoId ? eq(githubRepos.id, repoId) : undefined);
    const runs = await ctx.handle
      .selectDistinctOn([githubWorkflowRuns.repoId], {
        repoId: githubWorkflowRuns.repoId,
        branch: githubWorkflowRuns.branch,
        name: githubWorkflowRuns.name,
        status: githubWorkflowRuns.status,
        conclusion: githubWorkflowRuns.conclusion,
        url: githubWorkflowRuns.htmlUrl,
      })
      .from(githubWorkflowRuns)
      .innerJoin(githubRepos, and(eq(githubRepos.id, githubWorkflowRuns.repoId), eq(githubRepos.defaultBranch, githubWorkflowRuns.branch)))
      .orderBy(githubWorkflowRuns.repoId, desc(githubWorkflowRuns.ghCreatedAt));
    return repos.flatMap((r) => {
      const w = runs.find((x) => x.repoId === r.id);
      return w ? [{ repo: r.fullName, branch: w.branch, workflow: cut(w.name), status: w.status, conclusion: w.conclusion, url: w.url }] : [];
    });
  },
);

const prDetail = z.object({
  title: z.string(),
  state: z.string(),
  draft: z.boolean().optional(),
  merged: z.boolean().optional(),
  user: z.object({ login: z.string() }).nullable(),
  html_url: z.string(),
  body: z.string().nullable().optional(),
  changed_files: z.number().optional(),
  additions: z.number().optional(),
  deletions: z.number().optional(),
});
const reviewList = z.array(z.object({ user: z.object({ login: z.string() }).nullable(), state: z.string() }));

const getPullRequest: Tool<{ repo: string; number: number }, ListOut> = {
  name: "github.get_pull_request",
  label: "Reading pull request details",
  description: "Fetch fresh detail and reviews for one pull request live from GitHub.",
  input: z.object({ repo: repoArg, number: z.number().int().positive() }),
  output: listOut,
  tier: "READ",
  sideEffect: false,
  resolve: resolveRepo,
  async handler(i, ctx) {
    const token = await readToken(ctx.handle);
    if (!token) return { connected: false, message: NOT_CONNECTED, items: [] };
    const gh = createGithub({ token, fetch: ctx.fetch });
    const base = `/repos/${i.repo}/pulls/${i.number}`;
    const pr = await gh.get(base, prDetail);
    const reviews = await gh.get(`${base}/reviews`, reviewList);
    if (pr.status !== 200 || reviews.status !== 200) throw new ToolError("unavailable", "GitHub returned no data");
    const d = pr.data;
    return {
      connected: true,
      items: [
        {
          ref: `${i.repo}#${i.number}`,
          title: cut(d.title),
          state: d.state,
          draft: d.draft ?? false,
          merged: d.merged ?? false,
          author: d.user?.login ?? null,
          url: d.html_url,
          body: cut(d.body),
          changedFiles: d.changed_files,
          additions: d.additions,
          deletions: d.deletions,
          reviews: reviews.data.slice(0, 50).map((r) => ({ login: r.user?.login ?? null, state: r.state })),
        },
      ],
    };
  },
};

const createdIssue = z.object({ number: z.number(), html_url: z.string(), body: z.string().nullable().optional() });
const createInput = issuePayloadSchema.extend({ reason: z.string().max(500).optional() });
type CreateInput = z.infer<typeof createInput>;

const createIssue: Tool<CreateInput, { number: number; url: string }> = {
  name: "github.create_issue",
  label: "Preparing a GitHub issue",
  description: "Propose a new GitHub issue. Requires owner approval before anything is created.",
  input: createInput,
  output: z.object({ number: z.number(), url: z.string() }),
  tier: "APPROVE",
  sideEffect: true,
  async available(ctx) {
    return (await connection(ctx, "github_write")).status === "none" ? "Creating issues needs the issues-write token." : null;
  },
  async resolve(i, ctx) {
    await repoRow(ctx, i.repo);
    if (!(await connection(ctx, "github_write")).repos.includes(i.repo)) throw new ToolError("not_found", `The issues-write token can't access ${i.repo}.`);
    return i;
  },
  toApproval({ reason, ...payload }) {
    return { payload, reason: reason ?? null };
  },
  async handler({ repo, title, body, labels }, ctx) {
    if (!ctx.approvalId) throw new ToolError("not_allowed", "Issue creation requires an approval.");
    const token = await writeToken(ctx.handle);
    if (!token) throw new ToolError("unavailable", "Creating issues needs the issues-write token.");
    const gh = createGithub({ token, fetch: ctx.fetch });
    const marker = `<!-- lifeos-approval:${ctx.approvalId} -->`;
    if (ctx.adopt) {
      // Ambiguous retry: an earlier POST may have landed; adopt it rather than duplicate (AGT-03).
      const [ap] = await ctx.handle.select({ at: approvals.createdAt }).from(approvals).where(eq(approvals.id, ctx.approvalId));
      const login = (await connection(ctx, "github_write")).login;
      if (ap && login) {
        const q = `creator=${encodeURIComponent(login)}&state=all&since=${encodeURIComponent(ap.at.toISOString())}`;
        const found = (await gh.paginate(`/repos/${repo}/issues?${q}`, createdIssue, 1)).find((x) => x.body?.includes(marker));
        if (found) return { number: found.number, url: found.html_url };
      }
    }
    const made = await gh.post(`/repos/${repo}/issues`, { title, body: `${body}\n\n${marker}`, labels }, createdIssue);
    return { number: made.number, url: made.html_url };
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous tool map; each tool validates its own I/O via zod
export const githubTools: Record<string, Tool<any, any>> = Object.fromEntries(
  [listRepos, listPrs, listIssues, recentCommits, ciStatus, getPullRequest, createIssue].map((t) => [t.name, t]),
);
