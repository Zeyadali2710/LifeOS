import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { connections, githubIssues, githubPullRequests, githubRepos, githubWorkflowRuns } from "@/server/db/schema";
import { saveToken } from "@/server/github/connections";
import { createSync } from "@/server/github/sync";
import commits from "../fixtures/github/commits.json";
import issues from "../fixtures/github/issues.json";
import pulls from "../fixtures/github/pulls.json";
import repos from "../fixtures/github/repos.json";
import runs from "../fixtures/github/runs.json";
import user from "../fixtures/github/user.json";
import { fakeGithub } from "../helpers/fake-github";
import { setupTestDb } from "./helpers";

// readToken/saveToken decrypt with the env master key.
process.env.LIFEOS_MASTER_KEY ??= randomBytes(32).toString("base64");
process.env.DATABASE_URL ??= "postgres://unused/unused";
process.env.BETTER_AUTH_SECRET ??= "x".repeat(32);
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const t = setupTestDb();
const NOW = new Date("2026-05-10T12:00:00Z");

type Emitted = { a: { type: string; title: string; detail?: string; tone?: string }; n?: { category: string; title: string; body?: string; actionUrl?: string } };

// Mutable world; every resource carries an ETag derived from its JSON so 304s are exercised.
function world() {
  const w = { user: 200, rate: false, data: { pulls: structuredClone(pulls), runs: structuredClone(runs) } as Record<string, unknown> };
  const res = (req: Request, body: unknown) => {
    if (w.rate) return new Response(JSON.stringify({ message: "limit" }), { status: 403, headers: { "x-ratelimit-remaining": "0" } });
    const etag = `"${Buffer.from(JSON.stringify(body)).toString("base64").slice(-24)}${JSON.stringify(body).length}"`;
    if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304 });
    return new Response(JSON.stringify(body), { headers: { etag } });
  };
  const routes: Record<string, (r: Request) => Response> = {
    "GET /user": () => (w.user === 401 ? new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 }) : new Response(JSON.stringify(user))),
    "GET /user/repos": (r) => res(r, repos),
    "GET /repos/owner-test/private-app/pulls": (r) => res(r, w.data.pulls),
    "GET /repos/owner-test/private-app/pulls/1/reviews": () => new Response("[]"),
    "GET /repos/owner-test/private-app/pulls/9/reviews": () => new Response("[]"),
    "GET /repos/owner-test/private-app/issues": (r) => res(r, issues),
    "GET /repos/owner-test/private-app/commits": (r) => res(r, commits),
    "GET /repos/owner-test/private-app/actions/runs": (r) => res(r, w.data.runs),
  };
  for (const p of ["pulls", "issues", "commits", "actions/runs"]) routes[`GET /repos/owner-test/public-lib/${p}`] = (r) => res(r, p === "actions/runs" ? { workflow_runs: [] } : []);
  return { w, fetch: fakeGithub(routes) };
}

describe("github sync", () => {
  let ev: Emitted[] = [];
  const emit = (async (a: Emitted["a"], n?: Emitted["n"]) => {
    ev.push({ a, n });
    return null;
  }) as never;

  beforeAll(async () => {
    await saveToken(t.handle(), "github_read", "tok_abcd1234", { fetch: world().fetch });
  });

  it("no connection -> skipped, no fetch", async () => {
    const f = fakeGithub({});
    const h = t.handle();
    await h.delete(connections);
    expect(await createSync({ handle: h, fetch: f, emit, now: () => NOW }).run()).toEqual({ skipped: "not_connected" });
    expect(f.calls).toHaveLength(0);
    await saveToken(h, "github_read", "tok_abcd1234", { fetch: world().fetch });
  });

  it("first sync is silent; transitions emit once; 304s skip", async () => {
    const h = t.handle();
    const { w, fetch } = world();
    const s = createSync({ handle: h, fetch, emit, now: () => NOW });

    expect(await s.run()).toMatchObject({ ok: true, repos: 3, events: 0 });
    expect(ev).toEqual([]);
    expect(await h.select().from(githubRepos)).toHaveLength(3);
    expect(await h.select().from(githubPullRequests)).toHaveLength(2);
    const iss = await h.select().from(githubIssues);
    expect(iss).toHaveLength(1);
    expect(iss[0]!.labels).toEqual(["bug"]);
    expect(await h.select().from(githubWorkflowRuns)).toHaveLength(2);
    const [c] = await h.select().from(connections).where(eq(connections.id, "github_read"));
    expect(c!.lastSyncAt).toEqual(NOW);
    expect(c!.repos).toHaveLength(3);

    // repos unchanged -> 304, rewrite skipped
    const before = (await h.select().from(githubRepos).where(eq(githubRepos.id, 101)))[0]!.updatedAt;
    expect(await s.run()).toMatchObject({ ok: true, events: 0 });
    expect((await h.select().from(githubRepos).where(eq(githubRepos.id, 101)))[0]!.updatedAt).toEqual(before);
    expect(ev).toEqual([]);

    // PR merged + new failed CI run (open PR #1 also requests owner review but was already known)
    const p = w.data.pulls as typeof pulls;
    p[0]!.merged_at = "2026-05-02T10:00:00Z";
    p[0]!.state = "closed";
    (w.data.runs as typeof runs).workflow_runs.push({ ...runs.workflow_runs[1]!, id: 9003, html_url: "https://evil.example/x" });
    await s.run();
    expect(ev.map((e) => e.a.title)).toEqual(["Pull request merged", "CI failed", "GitHub synced"]);
    expect(ev[0]!.a.detail).toBe("owner-test/private-app#1 Add sync");
    expect(ev[1]!.a.tone).toBe("red");
    expect(ev[1]!.n).toMatchObject({ category: "IMPORTANT", title: "CI failed on owner-test/private-app", body: expect.stringMatching(/^CI failed on main at \d\d:\d\d\.$/) });
    expect(ev[1]!.n!.actionUrl).toBeUndefined(); // unsafe url dropped

    ev = [];
    await s.run();
    expect(ev).toEqual([]); // no duplicates
  });

  it("review requested emits; 401 errors once; rate limit records error", async () => {
    const h = t.handle();
    const { w, fetch } = world();
    const s = createSync({ handle: h, fetch, emit, now: () => NOW });
    ev = [];
    await s.run();
    (w.data.pulls as typeof pulls).push({ ...pulls[0]!, id: 5003, number: 9, title: "New" });
    await s.run();
    expect(ev.map((e) => e.a.title)).toContain("Review requested");

    ev = [];
    w.rate = true;
    w.data.pulls = [];
    expect(await s.run()).toEqual({ error: "rate_limit" });
    const [c] = await h.select().from(connections).where(eq(connections.id, "github_read"));
    expect(c!.lastSyncError).toBe("GitHub rate limit reached. LifeOS retries automatically.");
    expect(c!.status).toBe("connected");
  });

  it("401 sends one IMPORTANT notification and marks the connection error", async () => {
    const h = t.handle();
    const { w, fetch } = world();
    w.user = 401;
    const sent: unknown[] = [];
    const s = createSync({ handle: h, fetch, now: () => NOW, emit: (async (_a: unknown, n: unknown) => void sent.push(n)) as never });
    await s.run();
    await s.run();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ category: "IMPORTANT", title: "GitHub connection needs attention" });
    const [c] = await h.select().from(connections).where(eq(connections.id, "github_read"));
    expect(c!.status).toBe("error");
  });
});
