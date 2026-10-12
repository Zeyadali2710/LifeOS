import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { loadCareer, loadRepoDetail, repoActivity, repoCards } from "@/server/career";
import { connections, githubCommits, githubIssues, githubPullRequests, githubRepos, githubWorkflowRuns, projectLinks, projects } from "@/server/db/schema";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const NOW = new Date("2026-05-10T12:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const GH = "https://github.com/o";

async function seed() {
  const h = t.handle();
  await h.insert(githubRepos).values([
    { id: 1, fullName: "o/r", owner: "o", name: "r", private: false, defaultBranch: "main", htmlUrl: `${GH}/r`, language: "TypeScript", languages: { TypeScript: 900, CSS: 100 }, pushedAt: ago(1) },
    { id: 2, fullName: "o/old", owner: "o", name: "old", defaultBranch: "main", htmlUrl: `${GH}/old`, archived: true, pushedAt: ago(5) },
    { id: 3, fullName: "o/stale", owner: "o", name: "stale", defaultBranch: "main", htmlUrl: `${GH}/stale`, language: "Go", pushedAt: ago(120) },
  ]);
  await h.insert(githubPullRequests).values([
    { id: 10, repoId: 1, number: 1, title: "open a", state: "open", draft: false, reviews: [{ login: "a", state: "APPROVED", submittedAt: "2026-05-01T00:00:00Z" }], htmlUrl: `${GH}/r/pull/1`, ghUpdatedAt: ago(1) },
    { id: 11, repoId: 1, number: 2, title: "open b", state: "open", draft: false, reviews: [{ login: "a", state: "APPROVED", submittedAt: "2026-05-01T00:00:00Z" }, { login: "b", state: "CHANGES_REQUESTED", submittedAt: "2026-05-02T00:00:00Z" }], htmlUrl: "https://evil.example/2", ghUpdatedAt: ago(2) },
    { id: 12, repoId: 1, number: 3, title: "merged", state: "closed", merged: true, htmlUrl: `${GH}/r/pull/3`, ghUpdatedAt: ago(3) },
    { id: 13, repoId: 1, number: 4, title: "draft", state: "open", draft: true, htmlUrl: `${GH}/r/pull/4`, ghUpdatedAt: ago(4) },
    { id: 14, repoId: 1, number: 5, title: "plain", state: "open", draft: false, reviews: [{ login: "a", state: "APPROVED", submittedAt: "2026-05-01T00:00:00Z" }, { login: "a", state: "DISMISSED", submittedAt: "2026-05-02T00:00:00Z" }], htmlUrl: `${GH}/r/pull/5`, ghUpdatedAt: ago(5) },
  ]);
  await h.insert(githubIssues).values([
    { id: 20, repoId: 1, number: 7, title: "i1", state: "open", htmlUrl: `${GH}/r/issues/7`, ghUpdatedAt: ago(1) },
    { id: 21, repoId: 1, number: 8, title: "i2", state: "closed", htmlUrl: `${GH}/r/issues/8`, ghUpdatedAt: ago(1) },
  ]);
  await h.insert(githubCommits).values([
    { sha: "a1", repoId: 1, message: "today", committedAt: ago(0), htmlUrl: `${GH}/r/commit/a1` },
    { sha: "a2", repoId: 1, message: "today too", committedAt: new Date(NOW.getTime() - 60_000), htmlUrl: `${GH}/r/commit/a2` },
    { sha: "a3", repoId: 1, message: "long ago", committedAt: ago(30), htmlUrl: `${GH}/r/commit/a3` },
  ]);
  await h.insert(githubWorkflowRuns).values([
    { id: 30, repoId: 1, name: "ci", branch: "main", status: "completed", conclusion: "failure", htmlUrl: `${GH}/r/actions/runs/30`, ghCreatedAt: ago(2) },
    { id: 31, repoId: 1, name: "ci", branch: "main", status: "in_progress", conclusion: null, htmlUrl: `${GH}/r/actions/runs/31`, ghCreatedAt: ago(0) },
  ]);
}

describe("career queries", () => {
  it("no github_read connection -> none, empty", async () => {
    const c = await loadCareer(t.handle(), NOW);
    expect(c.connection.status).toBe("none");
    expect(c.repos).toEqual([]);
    expect(c.activity).toEqual([]);
  });

  it("connected / error connection states", async () => {
    const h = t.handle();
    await h.insert(connections).values({ id: "github_read", ciphertext: "x", last4: "1234", lastSyncAt: NOW });
    expect((await loadCareer(h, NOW)).connection).toMatchObject({ status: "connected", lastSyncError: null });
    await h.update(connections).set({ lastSyncError: "rate_limit" }).where(eq(connections.id, "github_read"));
    expect((await loadCareer(h, NOW)).connection).toMatchObject({ status: "error", lastSyncError: "rate_limit" });
    await h.delete(connections);
    await h.insert(connections).values({ id: "github_read", ciphertext: "x", last4: "1234", status: "error" });
    expect((await loadCareer(h, NOW)).connection.status).toBe("error");
  });

  it("repo cards: open counts by state, archived flag, synced window, ci, sparkline, languages", async () => {
    await seed();
    const c = await loadCareer(t.handle(), NOW);
    const by = Object.fromEntries(c.repos.map((r) => [r.fullName, r]));
    expect(by["o/r"]).toMatchObject({ openPrs: 4, openIssues: 1, synced: true, archived: false, ci: "running", commits14: 2 });
    expect(by["o/r"]!.sparkline).toHaveLength(14);
    expect(by["o/r"]!.sparkline.at(-1)).toBe(2);
    expect(by["o/r"]!.languages.map((l) => l.name)).toEqual(["TypeScript", "CSS"]);
    expect(by["o/old"]).toMatchObject({ archived: true, synced: false });
    expect(by["o/stale"]).toMatchObject({ synced: false, openPrs: 0 });
    expect(by["o/stale"]!.languages).toEqual([expect.objectContaining({ name: "Go", pct: 100 })]);
  });

  it("tiles count non-archived repos and failing CI even while a run is in progress", async () => {
    const c = await loadCareer(t.handle(), NOW);
    expect(c.tiles).toEqual({ repos: 2, openPrs: 4, openIssues: 1, ciFailing: 1 });
  });

  it("repoCards scopes by id; empty list -> empty", async () => {
    const h = t.handle();
    expect((await repoCards(h, NOW, [3])).map((r) => r.fullName)).toEqual(["o/stale"]);
    expect(await repoCards(h, NOW, [])).toEqual([]);
  });

  it("activity: merged newest first, capped, unsafe hrefs null", async () => {
    const h = t.handle();
    const a = await repoActivity(h, null, 20);
    expect(a.map((x) => x.at)).toEqual(a.map((x) => x.at).sort().reverse());
    expect(new Set(a.map((x) => x.kind))).toEqual(new Set(["commit", "pr", "issue", "ci"]));
    expect(a.every((x) => x.external)).toBe(true);
    expect(a.find((x) => x.id === "pr:11")!.href).toBeNull();
    expect(a.find((x) => x.id === "pr:10")!.href).toBe(`${GH}/r/pull/1`);
    expect(a.find((x) => x.id === "ci:31")!.ci).toBe("running");
  });

  it("activity: limit and repo scoping", async () => {
    const h = t.handle();
    expect(await repoActivity(h, null, 3)).toHaveLength(3);
    expect(await repoActivity(h, [3], 20)).toEqual([]);
  });

  it("repo detail: review states, open lists, runs, commits, linked projects; unknown -> null", async () => {
    const h = t.handle();
    const [p] = await h.insert(projects).values({ name: "Proj" }).returning();
    await h.insert(projectLinks).values({ projectId: p!.id, kind: "repo", repoId: 1 });
    const d = (await loadRepoDetail(h, "o/r", NOW))!;
    expect(Object.fromEntries(d.pulls.map((x) => [x.number, x.review]))).toEqual({ 1: "approved", 2: "changes_requested", 4: "draft", 5: "review_required" });
    expect(d.pulls).toHaveLength(4);
    expect(d.issues).toEqual([{ number: 7, title: "i1", author: null, url: `${GH}/r/issues/7` }]);
    expect(d.runs.map((x) => x.id)).toEqual([31, 30]);
    expect(d.runs.map((x) => x.ci)).toEqual(["running", "failing"]);
    expect(d.commits.map((x) => x.sha)).toEqual(["a1", "a2", "a3"]);
    expect(d.projects).toEqual([{ id: p!.id, name: "Proj" }]);
    expect(d.repo.fullName).toBe("o/r");
    expect(await loadRepoDetail(h, "o/missing", NOW)).toBeNull();
  });
});
