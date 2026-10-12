// Registry is mocked (vi.mock) so a test agent can own the fake tools.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentRuns, approvals, notifications, permissions, threads, toolCalls } from "@/server/db/schema";
import { callTool } from "@/server/agents/gateway";
import { fakeTools } from "../helpers/fake-tools";
import { setupTestDb } from "./helpers";

const agent = vi.hoisted(() => ({
  live: true,
  tools: ["test.read", "test.approve", "test.high", "test.exec", "test.lookup", "test.badout"],
}));
vi.mock("@/server/agents/registry", () => ({ getAgent: () => ({ id: "projects", name: "Projects", ...agent }) }));

const t = setupTestDb();
const NOW = new Date("2026-03-04T00:00:00Z");
let runId = "";
let ft = fakeTools();
const call = (name: string, input: unknown, id = `tu_${Math.random()}`) =>
  callTool({ handle: t.handle(), runId, agentId: "projects", tools: ft.tools, now: () => NOW }, name, input, id);
const rows = () => t.handle().select().from(toolCalls).where(eq(toolCalls.runId, runId));

beforeEach(async () => {
  ft = fakeTools();
  agent.live = true;
  await t.handle().delete(permissions);
  const [r] = await t.handle().insert(agentRuns).values({ agentId: "projects", prompt: "p", model: "m" }).returning();
  runId = r!.id;
});

describe("callTool", () => {
  it("rejects disallowed tools, non-live agents, cancelled runs, unavailable tools, bad input, unknown ids", async () => {
    const r1 = await call("test.nope", {});
    expect(r1).toMatchObject({ status: "error" });
    expect((r1 as { error: string }).error).toContain("not allowed");
    agent.live = false;
    expect((await call("test.read", { text: "a" })).status).toBe("error");
    agent.live = true;
    ft.tools["test.read"]!.available = async () => "Creating issues needs the issues-write token.";
    expect(await call("test.read", { text: "a" })).toMatchObject({ error: "Creating issues needs the issues-write token." });
    delete ft.tools["test.read"]!.available;
    const bad = await call("test.read", { text: 1 });
    expect((bad as { error: string }).error).toMatch(/^invalid input: /);
    expect(await call("test.lookup", { text: "missing" })).toMatchObject({ error: "Entity not found" });
    expect(ft.calls.read).toBe(0);
    await t.handle().update(agentRuns).set({ cancelRequestedAt: NOW }).where(eq(agentRuns.id, runId));
    expect(await call("test.read", { text: "a" })).toMatchObject({ error: "cancelled" });
    expect((await rows()).every((x) => x.status === "failed")).toBe(true);
    expect(await rows()).toHaveLength(6);
  });

  it("READ call runs and records the row", async () => {
    const a = await call("test.read", { text: "hi", token: "x" });
    expect(a).toMatchObject({ status: "ok", output: { echoed: "hi" } });
    await call("test.read", { text: "again" });
    const rs = (await rows()).sort((x, y) => x.seq - y.seq);
    expect(rs.map((x) => x.seq)).toEqual([1, 2]);
    expect(rs[0]).toMatchObject({ status: "done" });
    expect(rs[0]!.durationMs).not.toBeNull();
    expect(rs[0]!.outputSummary!.length).toBeLessThanOrEqual(600);
    const [run] = await t.handle().select().from(agentRuns).where(eq(agentRuns.id, runId));
    expect(run!.toolCallCount).toBe(2);
    expect(run!.firstToolAt).not.toBeNull();
  });

  it("output failing its schema is an error", async () => {
    expect(await call("test.badout", { text: "a" })).toMatchObject({ status: "error" });
    expect((await rows())[0]!.status).toBe("failed");
  });

  it("APPROVE and HIGH_RISK create approvals; overrides raise but never lower HIGH_RISK", async () => {
    const r = await call("test.approve", { repo: "o/r", title: "Bug" });
    expect(r.status).toBe("waiting_approval");
    const id = (r as { approvalId: string }).approvalId;
    const [ap] = await t.handle().select().from(approvals).where(eq(approvals.id, id));
    expect(ap).toMatchObject({ status: "pending", originalPayload: { repo: "o/r", title: "Bug" }, reason: "because" });
    expect(ap!.expiresAt.getTime()).toBe(NOW.getTime() + 7 * 86_400_000);
    expect(ap!.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect((await rows())[0]!.status).toBe("waiting_approval");
    const [n] = await t.handle().select().from(notifications).where(eq(notifications.actionUrl, `/approvals?id=${id}`));
    expect(n).toMatchObject({ category: "APPROVAL", title: "Approval waiting: create GitHub issue" });
    expect(n!.body).toContain('o/r: "Bug". Expires');

    await t.handle().insert(permissions).values([
      { agentId: "projects", tool: "test.high", tier: "READ" },
      { agentId: "projects", tool: "test.read", tier: "APPROVE" },
    ]);
    expect((await call("test.high", { text: "a" })).status).toBe("waiting_approval");
    expect((await call("test.read", { text: "a" })).status).toBe("waiting_approval");
    expect(ft.calls).toMatchObject({ approve: 0, high: 0, read: 0 });
  });

  describe("content floor (D-06)", () => {
    const content = (rid: string, tool = "github.get_file") =>
      t.handle().insert(toolCalls).values({ runId: rid, toolUseId: `c_${Math.random()}`, kind: "tool", tool, tier: "READ", status: "done", seq: 1 });
    const override = () => t.handle().insert(permissions).values({ agentId: "projects", tool: "test.exec", tier: "EXECUTE" });
    const exec = () => call("test.exec", { text: "go" });

    it("executes directly without a content call", async () => {
      await override();
      expect((await exec()).status).toBe("ok");
    });
    it("requires approval after a content call in the same run", async () => {
      await override();
      await content(runId);
      const r = await exec();
      expect(r.status).toBe("waiting_approval");
      const [ap] = await t.handle().select().from(approvals).where(eq(approvals.id, (r as { approvalId: string }).approvalId));
      expect(ap).toBeTruthy();
      expect(ft.calls.exec).toBe(0);
    });
    it("a sibling run's content call floors it too; a different tree is unaffected", async () => {
      const [parent] = await t.handle().insert(agentRuns).values({ agentId: "projects", prompt: "p", model: "m" }).returning();
      const mk = async (parentRunId: string | null) =>
        (await t.handle().insert(agentRuns).values({ agentId: "projects", prompt: "p", model: "m", parentRunId }).returning())[0]!.id;
      const me = await mk(parent!.id);
      const sib = await mk(parent!.id);
      runId = me;
      await content(sib);
      expect((await exec()).status).toBe("waiting_approval");
      runId = await mk(null);
      expect((await exec()).status).toBe("ok");
    });
    it("WR-01/WR-02: an earlier thread run's child, a retried run's tree and issue titles floor it too", async () => {
      await override();
      const mk = async (v: { parentRunId?: string; threadId?: string; retryOf?: string }) =>
        (await t.handle().insert(agentRuns).values({ agentId: "projects", prompt: "p", model: "m", ...v }).returning())[0]!.id;
      const [th] = await t.handle().insert(threads).values({ title: "t" }).returning();
      const earlier = await mk({ threadId: th!.id });
      await content(await mk({ parentRunId: earlier }));
      runId = await mk({ threadId: th!.id });
      expect((await exec()).status).toBe("waiting_approval");

      const orch = await mk({});
      const failed = await mk({ parentRunId: orch });
      await content(failed);
      runId = await mk({ retryOf: failed });
      expect((await exec()).status).toBe("waiting_approval");
    });
    it("READ tools are unaffected", async () => {
      await content(runId);
      expect((await call("test.read", { text: "a" })).status).toBe("ok");
    });
  });
});
