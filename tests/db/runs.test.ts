import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { agentRuns, approvals, toolCalls } from "@/server/db/schema";
import { MODELS } from "@/server/agents/registry";
import { agentConfig, cancelRun, counts, isPaused, setAgentModel, setAgentPaused, setGlobalPause, sweepOrphans } from "@/server/agents/runs";
import { appendMessage, createThread, listThreads, threadHistory } from "@/server/agents/threads";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const run = async (v: Partial<typeof agentRuns.$inferInsert> = {}) =>
  (await t.handle().insert(agentRuns).values({ agentId: "projects", prompt: "p", model: "m", ...v }).returning())[0]!;
const status = async (id: string) => (await t.handle().select().from(agentRuns).where(eq(agentRuns.id, id)))[0]!;

describe("pause + model", () => {
  it("pause and model rules", async () => {
    const h = t.handle();
    expect(await isPaused(h, "orchestrator")).toBe(false);
    await setGlobalPause(h, true);
    expect(await isPaused(h, "orchestrator")).toBe(true);
    await setGlobalPause(h, false);
    expect(await isPaused(h, "orchestrator")).toBe(false);
    expect(await setAgentPaused(h, "projects", true)).toBe(true);
    expect(await isPaused(h, "projects")).toBe(true);
    expect(await isPaused(h, "orchestrator")).toBe(false);
    expect(await setAgentPaused(h, "agentops", true)).toBe(false);
    expect(await setAgentModel(h, "agentops", MODELS.opus)).toBe(false);
    expect(await setAgentModel(h, "projects", "gpt-4")).toBe(false);
    expect(await setAgentModel(h, "projects", MODELS.opus)).toBe(true);
    expect((await agentConfig(h, "projects")).model).toBe(MODELS.opus);
    expect((await agentConfig(h, "orchestrator")).model).toBe(MODELS.opus);
  });
});

describe("cancel, sweep, counts", () => {
  it("cancels by state", async () => {
    const h = t.handle();
    const q = await run();
    expect(await cancelRun(h, q.id)).toBe(true);
    expect(await status(q.id)).toMatchObject({ status: "cancelled" });
    expect((await status(q.id)).endedAt).not.toBeNull();

    const r = await run({ status: "running" });
    expect(await cancelRun(h, r.id)).toBe(true);
    const r2 = await status(r.id);
    expect(r2.status).toBe("running");
    expect(r2.cancelRequestedAt).not.toBeNull();

    const parent = await run({ status: "waiting_approval" });
    const child = await run({ status: "waiting_approval", parentRunId: parent.id });
    const [tc] = await h
      .insert(toolCalls)
      .values({ runId: child.id, toolUseId: "x", seq: 1, tool: "github.create_issue", tier: "APPROVE", status: "waiting_approval" })
      .returning();
    const [ap] = await h
      .insert(approvals)
      .values({ runId: child.id, toolCallId: tc!.id, agentId: "projects", tool: "github.create_issue", originalPayload: {}, payloadHash: "h", expiresAt: new Date(Date.now() + 1e6) })
      .returning();
    expect(await cancelRun(h, child.id)).toBe(true);
    expect((await status(child.id)).status).toBe("cancelled");
    expect((await status(parent.id)).status).toBe("cancelled");
    expect((await h.select().from(approvals).where(eq(approvals.id, ap!.id)))[0]!.status).toBe("cancelled");
    expect((await h.select().from(toolCalls).where(eq(toolCalls.id, tc!.id)))[0]!.status).toBe("cancelled");

    const done = await run({ status: "completed" });
    expect(await cancelRun(h, done.id)).toBe(false);
  });

  it("sweeps stale running only; counts", async () => {
    const h = t.handle();
    const now = new Date();
    const old = new Date(now.getTime() - 10 * 60_000);
    const stale = await run({ status: "running", heartbeatAt: old });
    const staleNoBeat = await run({ status: "running", startedAt: old });
    const fresh = await run({ status: "running", heartbeatAt: now });
    const waiting = await run({ status: "waiting_approval", heartbeatAt: old });
    // the earlier test's still-running run has no timestamps and is not stale
    expect(await sweepOrphans(h, now)).toBe(2);
    expect(await status(stale.id)).toMatchObject({ status: "failed", errorKind: "interrupted" });
    expect((await status(staleNoBeat.id)).status).toBe("failed");
    expect((await status(fresh.id)).status).toBe("running");
    expect((await status(waiting.id)).status).toBe("waiting_approval");
    const c = await counts(h);
    expect(c.running).toBeGreaterThanOrEqual(2);
    expect(c).toHaveProperty("approvalsWaiting");
  });
});

describe("threads", () => {
  it("stores and lists", async () => {
    const h = t.handle();
    const id = await createThread(h, "x".repeat(100));
    expect((await listThreads(h))[0]!.title).toHaveLength(48);
    for (let i = 0; i < 25; i++) await appendMessage(h, id, i % 2 ? "assistant" : "user", `m${i}`);
    const hist = await threadHistory(h, id, 20);
    expect(hist).toHaveLength(20);
    expect(hist[0]).toEqual({ role: "assistant", content: "m5" });
    expect(hist[19]!.content).toBe("m24");
    const id2 = await createThread(h, "newer");
    const list = await listThreads(h, 20);
    expect(list[0]!.id).toBe(id2);
    expect(list.find((x) => x.id === id)!.messageCount).toBe(25);
  });
});
