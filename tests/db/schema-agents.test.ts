import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { agentRuns, approvals, threadMessages, threads, toolCalls } from "@/server/db/schema";
import { setupTestDb } from "./helpers";

const t = setupTestDb();

async function newRun(threadId?: string) {
  const run = await t.handle().insert(agentRuns).values({ agentId: "a", prompt: "p", model: "m", threadId }).returning().then((r) => r[0]!);
  return run;
}
const call = (runId: string, toolUseId: string, idempotencyKey?: string) => ({
  runId, toolUseId, seq: 1, tool: "github.create_issue", tier: "APPROVE" as const, status: "running" as const, idempotencyKey,
});

describe("Phase 3 schema constraints", () => {
  it("rejects duplicate idempotency_key via onConflictDoNothing", async () => {
    const run = await newRun();
    const db = t.handle();
    await db.insert(toolCalls).values(call(run.id, "u1", "k1"));
    const second = await db.insert(toolCalls).values(call(run.id, "u2", "k1")).onConflictDoNothing().returning();
    expect(second).toHaveLength(0);
  });

  it("rejects duplicate (run_id, tool_use_id)", async () => {
    const run = await newRun();
    const db = t.handle();
    await db.insert(toolCalls).values(call(run.id, "dup"));
    await expect(db.insert(toolCalls).values(call(run.id, "dup"))).rejects.toThrow();
  });

  it("round-trips approvals with null editedPayload", async () => {
    const run = await newRun();
    const db = t.handle();
    const tc = await db.insert(toolCalls).values(call(run.id, "ap")).returning().then((r) => r[0]!);
    const a = await db
      .insert(approvals)
      .values({
        runId: run.id, toolCallId: tc.id, agentId: "a", tool: "github.create_issue",
        originalPayload: { title: "x" }, payloadHash: "h", expiresAt: new Date(),
      })
      .returning().then((r) => r[0]!);
    expect(a.originalPayload).toEqual({ title: "x" });
    expect(a.editedPayload).toBeNull();
    expect(a.status).toBe("pending");
  });

  it("defaults costUsd to 0.000000", async () => {
    expect((await newRun()).costUsd).toBe("0.000000");
  });

  it("thread delete nulls runs.threadId and cascades messages", async () => {
    const db = t.handle();
    const th = await db.insert(threads).values({ title: "t" }).returning().then((r) => r[0]!);
    const run = await newRun(th.id);
    await db.insert(threadMessages).values({ threadId: th.id, role: "user", content: "hi" });
    await db.delete(threads).where(eq(threads.id, th.id));
    const after = (await db.select().from(agentRuns).where(eq(agentRuns.id, run.id)))[0]!;
    expect(after.threadId).toBeNull();
    expect(await db.select().from(threadMessages).where(eq(threadMessages.threadId, th.id))).toHaveLength(0);
  });
});
