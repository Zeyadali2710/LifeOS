import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatEvent } from "@/lib/agent-types";
import { advance, createRun } from "@/server/agents/loop";
import { costUsd } from "@/server/agents/pricing";
import { FreeModelError } from "@/server/agents/openrouter";
import { freeModel, mentionsSensitive, resetFreeCooldown } from "@/server/agents/routing";
import { githubTools } from "@/server/agents/tools/github";
import { TOOLS } from "@/server/agents/tools";
import {
  activityEvents, agents, agentRuns, connections, githubCommits, githubIssues, githubPullRequests, githubRepos, githubWorkflowRuns, runTurns, settings, toolCalls,
} from "@/server/db/schema";
import { saveToken } from "@/server/github/connections";
import user from "../fixtures/github/user.json";
import { fakeGithub } from "../helpers/fake-github";
import { scriptedLlm } from "../helpers/fake-llm";
import { setupTestDb } from "./helpers";

const key = vi.hoisted(() => Buffer.alloc(32, 7).toString("base64"));
vi.mock("@/server/env", () => ({ env: () => ({ LIFEOS_MASTER_KEY: key }) }));

const t = setupTestDb();
const h = () => t.handle();
const SONNET = "claude-sonnet-5-5";
const json = (b: unknown) => new Response(JSON.stringify(b));
const run = async (id: string) => (await h().select().from(agentRuns).where(eq(agentRuns.id, id)))[0]!;
const gh = () => fakeGithub({ "GET /user": () => json({ ...user, login: "me" }), "GET /user/repos": () => json([{ full_name: "me/a" }]) });
const connect = async () => {
  for (const [id, tok] of [["github_read", "read_token_0001"], ["github_write", "write_token_0002"]] as const) {
    await saveToken(h(), id, tok, { key: Buffer.from(key, "base64"), fetch: gh() });
  }
  await h().insert(githubRepos).values({ id: 1, fullName: "me/a", private: false, defaultBranch: "main", htmlUrl: "u", pushedAt: new Date() }).onConflictDoNothing();
};
const addSecret = (priv: boolean | null = true) =>
  h().insert(githubRepos).values({ id: 2, fullName: "me/secret", private: priv, defaultBranch: "main", htmlUrl: "u", pushedAt: new Date() }).onConflictDoNothing();
const withKey = () => h().insert(connections).values({ id: "openrouter", ciphertext: "x", last4: "abcd" } as never).onConflictDoNothing();
const mk = async (agentId: string, prompt = "hi", extra = {}) => {
  const r = await createRun(h(), { agentId, prompt, ...extra });
  if (!r.ok) throw new Error(r.code);
  return r.runId;
};
/** A free (tier simple) projects child under an orchestrator parent. */
const freeChild = async (prompt = "x") => mk("projects", prompt, { parentRunId: await mk("orchestrator"), tier: "simple" });
const fe = (status: number, transient = true) => new FreeModelError("http", transient, { status });
const list = { name: "github.list_repos", input: {} };
const models = (llm: { calls: { model: string }[] }) => llm.calls.map((c) => c.model);
const toolNames = (c: { tools: { name: string }[] }) => c.tools.map((x) => x.name);

beforeEach(async () => {
  resetFreeCooldown();
  await h().delete(agentRuns);
  await h().delete(settings);
  await h().delete(activityEvents);
  await h().delete(connections);
  await h().delete(agents);
  await h().delete(githubRepos); // child tables cascade; a leftover private me/secret trips the D-09 gate
});

describe("free errors: retry then Sonnet (D-06, D-08)", () => {
  it("one transient error retries on the free model", async () => {
    await withKey();
    const id = await freeChild();
    const llm = scriptedLlm([{ throw: fe(429) }, { toolUses: [list] }, { text: "done" }]);
    await connect();
    expect(await advance(id, { handle: h(), llm })).toBe("completed");
    expect(new Set(models(llm))).toEqual(new Set([freeModel()]));
    expect((await run(id)).routeEvents).toHaveLength(1);
  });

  it("two transient errors fall back to Sonnet, persist, emit a route step and start the cooldown", async () => {
    await withKey();
    const id = await freeChild();
    const llm = scriptedLlm([{ throw: fe(429) }, { throw: fe(429) }, { text: "answer" }]);
    const ev: ChatEvent[] = [];
    expect(await advance(id, { handle: h(), llm, onEvent: (e) => ev.push(e) })).toBe("completed");
    expect(models(llm)).toEqual([freeModel(), freeModel(), SONNET]);
    const r = await run(id);
    expect(r.model).toBe(SONNET);
    expect(r.routeEvents.at(-1)).toMatchObject({ kind: "fallback", from: freeModel(), to: SONNET, reason: "http 429" });
    expect(ev.some((e) => e.k === "step" && e.step.kind === "route")).toBe(true);
    expect((await run(await mk("projects", "x", { parentRunId: await mk("orchestrator"), tier: "simple" }))).model).toBe(SONNET);
  });

  it("a permanent error skips the retry", async () => {
    await withKey();
    const id = await freeChild();
    const llm = scriptedLlm([{ throw: fe(401, false) }, { text: "ok" }]);
    await advance(id, { handle: h(), llm });
    expect(models(llm)).toEqual([freeModel(), SONNET]);
  });

  it("a caller abort does not fall back", async () => {
    await withKey();
    const id = await freeChild();
    const ac = new AbortController();
    ac.abort();
    const llm = scriptedLlm([{ throw: Object.assign(new Error("aborted"), { name: "AbortError" }) }]);
    expect(await advance(id, { handle: h(), llm, signal: ac.signal })).toBe("failed");
    expect(llm.calls).toHaveLength(1);
    expect((await run(id)).model).toBe(freeModel());
  });

  it("run cost is the sum of Sonnet turns; free turns cost 0", async () => {
    await withKey();
    const id = await freeChild();
    await connect();
    const llm = scriptedLlm([{ toolUses: [list] }, { throw: fe(500) }, { throw: fe(500) }, { text: "answer" }]);
    await advance(id, { handle: h(), llm });
    const turns = await h().select().from(runTurns).where(eq(runTurns.runId, id));
    expect(turns.map((x) => x.model)).toEqual([freeModel(), SONNET]);
    expect(Number((await run(id)).costUsd)).toBeCloseTo(costUsd(SONNET, { input: 100, output: 20, cacheWrite: 0, cacheRead: 0 }), 6);
  });
});

describe("private-data gate (D-09)", () => {
  it.each([true, null])("private=%s: next turn goes to Sonnet and the free model never sees the repo", async (priv) => {
    await withKey();
    await connect();
    await addSecret(priv);
    const id = await freeChild();
    const llm = scriptedLlm([{ toolUses: [list] }, { text: "done" }]);
    expect(await advance(id, { handle: h(), llm })).toBe("completed");
    expect(models(llm)).toEqual([freeModel(), SONNET]);
    expect(JSON.stringify(llm.calls.filter((c) => c.model === freeModel()))).not.toContain("me/secret");
    expect((await run(id)).routeEvents.at(-1)).toMatchObject({ kind: "private", to: SONNET });
  });

  it("opt-in on keeps the run free; public-only repos stay free", async () => {
    await withKey();
    await connect();
    await addSecret();
    await h().insert(settings).values({ key: "ai.free_private_ok", value: true });
    const llm = scriptedLlm([{ toolUses: [list] }, { text: "done" }]);
    await advance(await freeChild(), { handle: h(), llm });
    expect(models(llm)).toEqual([freeModel(), freeModel()]);
    await h().delete(settings);
    await h().delete(githubRepos).where(eq(githubRepos.id, 2));
    const llm2 = scriptedLlm([{ toolUses: [list] }, { text: "done" }]);
    await advance(await freeChild(), { handle: h(), llm: llm2 });
    expect(models(llm2)).toEqual([freeModel(), freeModel()]);
  });

  it("Free-only pin: transient errors fail free_unavailable, private fails private_blocked, no escalate tool", async () => {
    await withKey();
    await connect();
    await h().insert(agents).values({ id: "projects", model: "free" });
    const a = await freeChild();
    const llmA = scriptedLlm([{ throw: fe(503) }, { throw: fe(503) }]);
    expect(await advance(a, { handle: h(), llm: llmA })).toBe("failed");
    expect(await run(a)).toMatchObject({ errorKind: "free_unavailable", model: freeModel() });
    expect((await run(a)).routeEvents.at(-1)).toMatchObject({ kind: "blocked", to: null });
    expect(llmA.calls).toHaveLength(2);
    expect(toolNames(llmA.calls[0]!)).not.toContain("escalate");

    resetFreeCooldown();
    await addSecret();
    const b = await freeChild();
    const llmB = scriptedLlm([{ toolUses: [list] }, { text: "never" }]);
    expect(await advance(b, { handle: h(), llm: llmB })).toBe("failed");
    expect((await run(b)).errorKind).toBe("private_blocked");
    expect(llmB.calls).toHaveLength(1);
  });

  it("Auto free turns carry FREE_SUFFIX and escalate; Sonnet turns neither", async () => {
    await withKey();
    const id = await freeChild();
    const llm = scriptedLlm([{ throw: fe(500, false) }, { text: "ok" }]);
    await advance(id, { handle: h(), llm });
    expect(toolNames(llm.calls[0]!)).toContain("escalate");
    expect(llm.calls[0]!.system).toContain("call escalate");
    expect(toolNames(llm.calls[1]!)).not.toContain("escalate");
    expect(llm.calls[1]!.system).not.toContain("call escalate");
  });
});

describe("saw_private taint", () => {
  it("a Sonnet run that fetched private data sets it; public-only does not; the prompt counts too", async () => {
    await connect();
    await addSecret();
    const a = await mk("projects");
    await advance(a, { handle: h(), llm: scriptedLlm([{ toolUses: [list] }, { text: "x" }]) });
    expect((await run(a)).sawPrivate).toBe(true);
    await h().delete(githubRepos).where(eq(githubRepos.id, 2));
    const b = await mk("projects");
    await advance(b, { handle: h(), llm: scriptedLlm([{ toolUses: [list] }, { text: "x" }]) });
    expect((await run(b)).sawPrivate).toBe(false);
    await addSecret();
    const c = await mk("projects", "look at me/secret");
    await advance(c, { handle: h(), llm: scriptedLlm([{ text: "x" }]) });
    expect((await run(c)).sawPrivate).toBe(true);
  });

  it("paraphrase: a later simple delegation in the tree starts on Sonnet and never touches the free model", async () => {
    await withKey();
    await connect();
    await addSecret();
    const parent = await mk("orchestrator");
    const first = await mk("projects", "list", { parentRunId: parent, tier: "reasoning" });
    await advance(first, { handle: h(), llm: scriptedLlm([{ toolUses: [list] }, { text: "x" }]) });
    const second = await run(await mk("projects", "the quarterly planning PR", { parentRunId: parent, tier: "simple" }));
    expect(second.model).toBe(SONNET);
    expect(second.routeEvents).toMatchObject([{ reason: "private data in thread" }]);
  });
});

describe("validating free turns (D-07, D-08)", () => {
  it("escalate with a sibling tool runs nothing, moves to Sonnet and keeps the turn out of history", async () => {
    await withKey();
    await connect();
    const id = await freeChild();
    const llm = scriptedLlm([{ toolUses: [list, { name: "escalate", input: { reason: "needs multi-step analysis" } }] }, { text: "answer" }]);
    expect(await advance(id, { handle: h(), llm })).toBe("completed");
    expect(await h().select().from(toolCalls).where(eq(toolCalls.runId, id))).toHaveLength(0);
    expect(models(llm)).toEqual([freeModel(), SONNET]);
    expect((await run(id)).routeEvents.at(-1)).toMatchObject({ kind: "escalated", reason: "needs multi-step analysis" });
    expect(JSON.stringify(llm.calls[1]!.messages)).not.toContain("escalate");
  });

  it("invalid_tool_call: dropped, Sonnet next, usage still recorded", async () => {
    await withKey();
    const id = await freeChild();
    const llm = scriptedLlm([{ toolUses: [{ name: "github.nope", input: {} }] }, { text: "answer" }]);
    await advance(id, { handle: h(), llm });
    expect((await run(id)).routeEvents.at(-1)).toMatchObject({ kind: "fallback", reason: "invalid_tool_call" });
    expect(JSON.stringify(llm.calls[1]!.messages)).not.toContain("github_nope");
    const turns = await h().select().from(runTurns).where(eq(runTurns.runId, id));
    expect(turns.map((x) => x.model)).toEqual([freeModel(), SONNET]);
    expect(Number(turns[0]!.costUsd)).toBe(0);
  });

  it.each([
    ["empty", [{ text: "" }]],
    ["no_tool_use", [{ text: "everything is fine" }]],
    ["unsupported_ref", [{ toolUses: [list] }, { text: "see me/a#99" }]],
  ])("sanity %s moves to Sonnet", async (code, script) => {
    await withKey();
    await connect();
    const id = await freeChild();
    await advance(id, { handle: h(), llm: scriptedLlm([...script, { text: "fixed" }]) });
    expect((await run(id)).routeEvents.at(-1)).toMatchObject({ kind: "fallback", reason: code });
    expect((await run(id)).answer).toBe("fixed");
  });

  it("approval suspends a free run; a run that switched to Sonnet resumes on Sonnet", async () => {
    await withKey();
    await connect();
    const issue = { name: "github.create_issue", input: { repo: "me/a", title: "Bug" } };
    const a = await freeChild();
    expect(await advance(a, { handle: h(), llm: scriptedLlm([{ toolUses: [list] }, { toolUses: [issue] }]) })).toBe("waiting_approval");
    expect((await run(a)).model).toBe(freeModel());

    const b = await freeChild();
    const llm = scriptedLlm([{ toolUses: [{ name: "escalate", input: { reason: "hard" } }] }, { toolUses: [issue] }, { text: "Done" }]);
    expect(await advance(b, { handle: h(), llm })).toBe("waiting_approval");
    expect((await run(b)).model).toBe(SONNET);
    await h().update(toolCalls).set({ status: "done", output: { number: 1, url: "u" } }).where(eq(toolCalls.runId, b));
    expect(await advance(b, { handle: h(), llm })).toBe("completed");
    expect(models(llm)).toEqual([freeModel(), SONNET, SONNET]);
  });

  it("redacted: secrets in tool output reach the free model as [redacted]", async () => {
    await withKey();
    await connect();
    const tools = { ...TOOLS, "github.list_repos": { ...TOOLS["github.list_repos"]!, handler: async () => ({ connected: true, items: [{ repo: "me/a", token: "sk-live-secret" }] }) } };
    const llm = scriptedLlm([{ toolUses: [list] }, { text: "done" }]);
    await advance(await freeChild(), { handle: h(), llm, tools: tools as never });
    const sent = JSON.stringify(llm.calls[1]!.messages);
    expect(sent).toContain("[redacted]");
    expect(sent).not.toContain("sk-live-secret");
  });
});

describe("guard: every GitHub READ tool output carries the repo full name", () => {
  it("is visible to mentionsSensitive for a private repo", async () => {
    await connect();
    await addSecret();
    const d = new Date();
    await h().insert(githubPullRequests).values({ id: 1, repoId: 2, number: 1, title: "t", state: "open", ghUpdatedAt: d } as never);
    await h().insert(githubIssues).values({ id: 1, repoId: 2, number: 2, title: "t", state: "open", ghUpdatedAt: d } as never);
    await h().insert(githubCommits).values({ sha: "abcdef0123", repoId: 2, message: "m", committedAt: d } as never);
    await h().insert(githubWorkflowRuns).values({ id: 1, repoId: 2, name: "ci", branch: "main", status: "completed", ghCreatedAt: d } as never);
    const fetch = fakeGithub({
      "GET /repos/me/secret/pulls/1": () => json({ title: "t", state: "open", user: null, html_url: "u" }),
      "GET /repos/me/secret/pulls/1/reviews": () => json([]),
    });
    const reads = Object.values(githubTools).filter((x) => x.tier === "READ");
    expect(reads.map((x) => x.name).sort()).toEqual(
      ["github.ci_status", "github.get_pull_request", "github.list_issues", "github.list_pull_requests", "github.list_repos", "github.recent_commits"],
    );
    for (const tool of reads) {
      const input = tool.input.parse({ repo: "me/secret", number: 1 });
      const out = await tool.handler(input, { handle: h(), fetch, runId: "r", agentId: "projects", now: () => new Date() } as never);
      expect(mentionsSensitive(out, ["me/secret"]), tool.name).toBe(true);
    }
  });
});
