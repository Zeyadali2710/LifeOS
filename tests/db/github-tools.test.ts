import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { callTool } from "@/server/agents/gateway";
import { githubTools } from "@/server/agents/tools/github";
import { GithubError } from "@/server/github/client";
import { saveToken } from "@/server/github/connections";
import { agentRuns, approvals, githubCommits, githubIssues, githubPullRequests, githubRepos, githubWorkflowRuns, toolCalls } from "@/server/db/schema";
import user from "../fixtures/github/user.json";
import { fakeGithub } from "../helpers/fake-github";
import { setupTestDb } from "./helpers";

const key = vi.hoisted(() => Buffer.alloc(32, 7).toString("base64"));
vi.mock("@/server/env", () => ({ env: () => ({ LIFEOS_MASTER_KEY: key }) }));
vi.mock("@/server/agents/registry", () => ({
  getAgent: () => ({ id: "projects", name: "Projects", live: true, tools: Object.keys(githubTools) }),
}));

const t = setupTestDb();
const json = (b: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(b), init);
const READ = "read_token_0001";
const WRITE = "write_token_0002";
const NOW = new Date("2026-03-04T00:00:00Z");
let runId = "";
const call = (name: string, input: unknown, fetch?: typeof globalThis.fetch) =>
  callTool({ handle: t.handle(), runId, agentId: "projects", tools: githubTools, now: () => NOW, fetch }, name, input, `tu_${Math.random()}`);
const out = (r: Awaited<ReturnType<typeof call>>) => (r as { output: { connected: boolean; message?: string; items: Record<string, unknown>[] } }).output;
const ctx = (extra = {}) => ({ handle: t.handle(), runId, agentId: "projects", toolUseId: "x", now: () => NOW, ...extra });

const connect = (id: "github_read" | "github_write", token: string, repo: string[]) =>
  saveToken(t.handle(), id, token, {
    key: Buffer.from(key, "base64"),
    fetch: fakeGithub({ "GET /user": () => json({ ...user, login: "me" }), "GET /user/repos": () => json(repo.map((full_name) => ({ full_name }))) }),
  });

beforeAll(async () => {
  const [r] = await t.handle().insert(agentRuns).values({ agentId: "projects", prompt: "p", model: "m" }).returning();
  runId = r!.id;
});

describe("github tools", () => {
  it("every READ tool reports not connected before a token exists; tiers are right", async () => {
    for (const n of ["list_repos", "list_pull_requests", "list_issues", "recent_commits", "ci_status"]) {
      const r = await call(`github.${n}`, {});
      expect(out(r)).toMatchObject({ connected: false, message: "GitHub isn't connected yet. Add a read token in Settings → Connections." });
    }
    expect(Object.values(githubTools).filter((x) => x.tier === "READ")).toHaveLength(6);
    expect(await call("github.create_issue", { repo: "me/a", title: "x" })).toMatchObject({ error: "Creating issues needs the issues-write token." });
  });

  it("DB-backed reads", async () => {
    const h = t.handle();
    await connect("github_read", READ, ["me/a", "me/b"]);
    await h.insert(githubRepos).values([
      { id: 1, fullName: "me/a", private: true, defaultBranch: "main", htmlUrl: "u/a", pushedAt: new Date("2026-03-01") },
      { id: 2, fullName: "me/b", private: false, defaultBranch: "main", htmlUrl: "u/b", pushedAt: new Date("2026-03-02") },
    ]);
    await h.insert(githubPullRequests).values([
      { id: 10, repoId: 1, number: 1, title: "mine", state: "open", requestedReviewers: ["me"], htmlUrl: "pr1", ghUpdatedAt: NOW },
      { id: 11, repoId: 1, number: 2, title: "other", state: "open", requestedReviewers: ["bob"], htmlUrl: "pr2", ghUpdatedAt: NOW },
    ]);
    await h.insert(githubIssues).values([
      { id: 20, repoId: 2, number: 5, title: "i1", state: "open", assignees: ["me"], htmlUrl: "i1", ghUpdatedAt: NOW },
      { id: 21, repoId: 2, number: 6, title: "i2", state: "open", assignees: [], htmlUrl: "i2", ghUpdatedAt: NOW },
    ]);
    await h.insert(githubCommits).values([
      { sha: "a".repeat(40), repoId: 1, message: "old", committedAt: new Date("2026-01-01"), htmlUrl: "c1" },
      { sha: "b".repeat(40), repoId: 1, message: "new", committedAt: new Date("2026-02-01"), htmlUrl: "c2" },
    ]);
    await h.insert(githubWorkflowRuns).values([
      { id: 30, repoId: 1, name: "CI", branch: "main", conclusion: "failure", ghCreatedAt: new Date("2026-01-01") },
      { id: 31, repoId: 1, name: "CI", branch: "main", conclusion: "success", ghCreatedAt: new Date("2026-02-01") },
      { id: 32, repoId: 1, name: "CI", branch: "dev", conclusion: "failure", ghCreatedAt: new Date("2026-03-01") },
    ]);

    expect(out(await call("github.list_repos", {})).items.map((i) => i.repo)).toEqual(["me/b", "me/a"]);
    const prs = out(await call("github.list_pull_requests", { state: "open", reviewRequested: true })).items;
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({ ref: "me/a#1", title: "mine", url: "pr1" });
    expect(out(await call("github.list_issues", { assignedToMe: true })).items.map((i) => i.ref)).toEqual(["me/b#5"]);
    expect(out(await call("github.recent_commits", { repo: "me/a", limit: 5 })).items.map((i) => i.message)).toEqual(["new", "old"]);
    expect(out(await call("github.ci_status", {})).items).toMatchObject([{ repo: "me/a", conclusion: "success" }]);
    expect(await call("github.list_issues", { repo: "me/zzz" })).toMatchObject({ status: "error", error: "Unknown repository me/zzz" });
    expect((await call("github.list_repos", { limit: 99 })).status).toBe("error");
  });

  it("get_pull_request fetches live with the read token", async () => {
    const f = fakeGithub({
      "GET /repos/me/a/pulls/1": () => json({ title: "T", state: "open", user: { login: "me" }, html_url: "h", body: "x".repeat(5000) }),
      "GET /repos/me/a/pulls/1/reviews": () => json([{ user: { login: "bob" }, state: "APPROVED" }]),
    });
    const o = out(await call("github.get_pull_request", { repo: "me/a", number: 1 }, f)).items[0]!;
    expect(o).toMatchObject({ ref: "me/a#1", reviews: [{ login: "bob", state: "APPROVED" }] });
    expect((o.body as string).length).toBe(2000);
    expect(f.calls.every((c) => c.auth === `Bearer ${READ}`)).toBe(true);
  });

  it("create_issue: approval, resolve, write token, marker, adoption, errors", async () => {
    const h = t.handle();
    await connect("github_write", WRITE, ["me/a"]);
    const tool = githubTools["github.create_issue"]!;
    expect(await tool.available!(ctx())).toBeNull();

    const r = await call("github.create_issue", { repo: "me/a", title: "Bug", body: "b", reason: "why" });
    expect(r.status).toBe("waiting_approval");
    const [ap] = await h.select().from(approvals).where(eq(approvals.id, (r as { approvalId: string }).approvalId));
    expect(ap).toMatchObject({ status: "pending", reason: "why", originalPayload: { repo: "me/a", title: "Bug", body: "b", labels: [] } });
    expect(ap!.originalPayload).not.toHaveProperty("reason");
    expect((await h.select().from(toolCalls).where(eq(toolCalls.runId, runId))).filter((x) => x.tool === "github.create_issue" && x.status === "waiting_approval")).toHaveLength(1);

    // me/b is synced but not on the write token's list.
    expect(await call("github.create_issue", { repo: "me/b", title: "x" })).toMatchObject({ error: "The issues-write token can't access me/b." });
    expect(await call("github.create_issue", { repo: "me/q", title: "x" })).toMatchObject({ error: "Unknown repository me/q" });

    const input = { repo: "me/a", title: "Bug", body: "b", labels: ["x"] };
    await expect(tool.handler(input, ctx())).rejects.toThrow("requires an approval");

    const created = fakeGithub({ "POST /repos/me/a/issues": () => json({ number: 7, html_url: "https://github.com/me/a/issues/7" }, { status: 201 }) });
    expect(await tool.handler(input, ctx({ approvalId: ap!.id, fetch: created }))).toEqual({ number: 7, url: "https://github.com/me/a/issues/7" });
    expect(created.calls[0]).toMatchObject({ auth: `Bearer ${WRITE}`, body: { title: "Bug", labels: ["x"] } });
    expect((created.calls[0]!.body as { body: string }).body.endsWith(`\n\n<!-- lifeos-approval:${ap!.id} -->`)).toBe(true);

    const adopt = fakeGithub({
      "GET /repos/me/a/issues": () => json([{ number: 9, html_url: "https://github.com/me/a/issues/9", body: `b\n\n<!-- lifeos-approval:${ap!.id} -->` }]),
    });
    expect(await tool.handler(input, ctx({ approvalId: ap!.id, adopt: true, fetch: adopt }))).toEqual({ number: 9, url: "https://github.com/me/a/issues/9" });
    expect(adopt.calls.map((c) => c.method)).toEqual(["GET"]);
    const q = new URL(adopt.calls[0]!.url).searchParams;
    expect(q.get("creator")).toBe("me");
    expect(q.get("since")).toBe(ap!.createdAt.toISOString());

    // adopt with no match falls through to POST
    const miss = fakeGithub({ "GET /repos/me/a/issues": () => json([]), "POST /repos/me/a/issues": () => json({ number: 8, html_url: "u8" }, { status: 201 }) });
    expect(await tool.handler(input, ctx({ approvalId: ap!.id, adopt: true, fetch: miss }))).toMatchObject({ number: 8 });

    const bad = fakeGithub({ "POST /repos/me/a/issues": () => json({ message: "Validation Failed" }, { status: 422 }) });
    await expect(tool.handler(input, ctx({ approvalId: ap!.id, fetch: bad }))).rejects.toMatchObject({ kind: "client" });
    const down = (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    await expect(tool.handler(input, ctx({ approvalId: ap!.id, fetch: down }))).rejects.toBeInstanceOf(GithubError);
    await expect(tool.handler(input, ctx({ approvalId: ap!.id, fetch: down }))).rejects.toMatchObject({ kind: "network" });
  });
});
