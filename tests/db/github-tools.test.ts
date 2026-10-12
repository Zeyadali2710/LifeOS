import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { callTool } from "@/server/agents/gateway";
import { githubTools } from "@/server/agents/tools/github";
import { GithubError } from "@/server/github/client";
import { saveToken } from "@/server/github/connections";
import { agentRuns, approvals, githubCommits, githubIssues, githubPullRequests, githubRepos, githubWorkflowRuns, toolCalls } from "@/server/db/schema";
import contentsReadme from "../fixtures/github/contents-readme.json";
import contentsRoadmap from "../fixtures/github/contents-roadmap.json";
import tree from "../fixtures/github/tree.json";
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

describe("repo contents tools, not connected", () => {
  it("report NOT_CONNECTED with the repo name", async () => {
    const h = t.handle();
    await h.insert(githubRepos).values({ id: 99, fullName: "me/studio", private: false, defaultBranch: "main", htmlUrl: "u/s" });
    const msg = "GitHub isn't connected yet. Add a read token in Settings → Connections.";
    expect(((await call("github.list_tree", { repo: "me/studio" })) as { output: unknown }).output).toMatchObject({ connected: false, message: msg, repo: "me/studio", entries: [] });
    expect(((await call("github.get_file", { repo: "me/studio", path: "README.md" })) as { output: unknown }).output).toMatchObject({ connected: false, message: msg, repo: "me/studio" });
    await h.delete(githubRepos).where(eq(githubRepos.id, 99));
  });
});

describe("github tools", () => {
  it("every READ tool reports not connected before a token exists; tiers are right", async () => {
    for (const n of ["list_repos", "list_pull_requests", "list_issues", "recent_commits", "ci_status"]) {
      const r = await call(`github.${n}`, {});
      expect(out(r)).toMatchObject({ connected: false, message: "GitHub isn't connected yet. Add a read token in Settings → Connections." });
    }
    expect(Object.values(githubTools).filter((x) => x.tier === "READ")).toHaveLength(8);
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

describe("repo contents", () => {
  const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64");
  const file = (b: Buffer | string, extra = {}) => json({ type: "file", size: Buffer.byteLength(b), encoding: "base64", content: b64(b), ...extra });
  const o = (r: unknown) => (r as { output: Record<string, unknown> }).output;
  const err = (r: unknown) => (r as { status: string; error: string });
  const setBranch = (b: string) => t.handle().update(githubRepos).set({ defaultBranch: b }).where(eq(githubRepos.fullName, "me/studio"));
  const treeF = (b = "main", body: unknown = tree) => fakeGithub({ [`GET /repos/me/studio/git/trees/${b}`]: () => json(body) });
  const fileF = (path: string, res: () => Response, b = "main") => fakeGithub({ [`GET /repos/me/studio/contents/${path}`]: res });

  it("setup", async () => {
    await t.handle().insert(githubRepos).values({ id: 100, fullName: "me/studio", private: false, defaultBranch: "main", htmlUrl: "u/s" });
  });

  it("unknown repo is rejected without a GitHub call", async () => {
    const f = fakeGithub({});
    expect(err(await call("github.list_tree", { repo: "me/nope" }, f))).toMatchObject({ status: "error", error: "Unknown repository me/nope" });
    expect(err(await call("github.get_file", { repo: "me/nope", path: "a.md" }, f)).error).toBe("Unknown repository me/nope");
    expect(f.calls).toHaveLength(0);
  });

  it("list_tree: default branch, read token, noise dropped, dirs, prefix, cap", async () => {
    const f = treeF();
    const out1 = o(await call("github.list_tree", { repo: "me/studio" }, f)) as { entries: { path: string; type: string }[]; branch: string; truncated: boolean };
    expect(new URL(f.calls[0]!.url).pathname).toBe("/repos/me/studio/git/trees/main");
    expect(new URL(f.calls[0]!.url).searchParams.get("recursive")).toBe("1");
    expect(f.calls[0]!.auth).toBe(`Bearer ${READ}`);
    expect(f.calls[0]!.auth).not.toContain(WRITE);
    const paths = out1.entries.map((e) => e.path);
    expect(paths).toContain("docs/ROADMAP.md");
    expect(paths.some((p) => /node_modules|dist|\.next|vendor/.test(p))).toBe(false);
    expect(out1.entries.find((e) => e.path === "docs")!.type).toBe("dir");
    expect(out1.entries.find((e) => e.path === "README.md")!.type).toBe("file");
    const pre = o(await call("github.list_tree", { repo: "me/studio", prefix: "docs" }, treeF())) as { entries: { path: string }[] };
    expect(pre.entries.map((e) => e.path).sort()).toEqual(["docs", "docs/ROADMAP.md", "docs/index.md"]);
    const big = { truncated: false, tree: Array.from({ length: 450 }, (_, i) => ({ path: `f${i}.md`, type: "blob", size: 1 })) };
    const capped = o(await call("github.list_tree", { repo: "me/studio" }, treeF("main", big))) as { entries: unknown[]; truncated: boolean };
    expect(capped.entries).toHaveLength(400);
    expect(capped.truncated).toBe(true);
  });

  it("get_file: decoded text, ref, envelope, caps", async () => {
    const f = fileF("README.md", () => json(contentsReadme));
    const r = o(await call("github.get_file", { repo: "me/studio", path: "README.md" }, f)) as { content: string; untrusted: boolean; repo: string; truncated: boolean };
    expect(r.content.startsWith("# Studio")).toBe(true);
    expect(r).toMatchObject({ untrusted: true, repo: "me/studio", truncated: false });
    expect(new URL(f.calls[0]!.url).searchParams.get("ref")).toBe("main");
    expect(f.calls[0]!.auth).toBe(`Bearer ${READ}`);
    const rm = o(await call("github.get_file", { repo: "me/studio", path: "docs/ROADMAP.md" }, fileF("docs/ROADMAP.md", () => json(contentsRoadmap)))) as { content: string };
    expect(rm.content).toContain("## Milestone 1: MVP");
    const long = o(await call("github.get_file", { repo: "me/studio", path: "big.md" }, fileF("big.md", () => file("x".repeat(20000))))) as { content: string; truncated: boolean };
    expect(long.content).toHaveLength(16384);
    expect(long.truncated).toBe(true);
  });

  it("get_file: honest refusals and errors", async () => {
    const get = (path: string, res: () => Response) => call("github.get_file", { repo: "me/studio", path }, fileF(path, res));
    expect(err(await get("a.bin", () => file(Buffer.from([65, 0, 66])))).error).toBe("That file is binary, not text.");
    expect(err(await get("b.bin", () => file(Buffer.from([0xff, 0xfe, 0xfd])))).error).toBe("That file is binary, not text.");
    expect(err(await get("huge.txt", () => json({ type: "file", size: 2_000_000, encoding: "none", content: "" }))).error).toBe("That file is larger than 1 MB.");
    expect(err(await get("docs", () => json([{ type: "file" }]))).error).toBe("That path is a folder; use github.list_tree.");
    expect(err(await get("link", () => json({ type: "symlink", size: 1 }))).error).toContain("isn't a regular file");
    expect(err(await get("docs/missing.md", () => json({ message: "Not Found" }, { status: 404 }))).error).toBe("Not found on the default branch: docs/missing.md");
    expect(err(await get("secret.md", () => json({ message: "Resource not accessible" }, { status: 403 }))).error).toContain("Contents: Read-only");
    const f = fakeGithub({});
    expect(err(await call("github.get_file", { repo: "me/studio", path: "../secret" }, f)).status).toBe("error");
    expect(f.calls).toHaveLength(0);
  });

  it("uses the repo's default branch when it is not main", async () => {
    await setBranch("develop");
    const f = treeF("develop");
    expect(o(await call("github.list_tree", { repo: "me/studio" }, f)).connected).toBe(true);
    expect(new URL(f.calls[0]!.url).pathname).toBe("/repos/me/studio/git/trees/develop");
    const g = fileF("README.md", () => json(contentsReadme));
    await call("github.get_file", { repo: "me/studio", path: "README.md" }, g);
    expect(new URL(g.calls[0]!.url).searchParams.get("ref")).toBe("develop");
  });
});
