import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isPaused } from "@/server/agents/runs";
import { agentRuns, approvals, auditLog, toolCalls } from "@/server/db/schema";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
vi.mock("@/server/db/client", async (orig) => ({ ...(await orig<object>()), db: () => t.handle() }));
vi.mock("@/server/queue", async (orig) => ({ ...(await orig<object>()), enqueue: vi.fn(async () => undefined) }));
let denied = false;
vi.mock("@/server/session", () => ({
  requireOwner: async () => {
    if (denied) throw new Error("redirect");
  },
}));

import {
  cancelRunAction,
  pauseAgentAction,
  pauseAllAction,
  resumeAgentAction,
  resumeAllAction,
  retryRunAction,
  setAgentModelAction,
} from "@/server/agent-actions";
import { setCap } from "@/server/agents/spend";

const h = () => t.handle();
const mk = async (v: Partial<typeof agentRuns.$inferInsert> = {}) =>
  (await h().insert(agentRuns).values({ agentId: "projects", prompt: "p", model: "m", ...v }).returning())[0]!;

beforeEach(() => {
  denied = false;
});

describe("agent actions", () => {
  it("reject without owner and change nothing", async () => {
    denied = true;
    const calls = [
      () => pauseAllAction(),
      () => resumeAllAction(),
      () => pauseAgentAction("projects"),
      () => resumeAgentAction("projects"),
      () => cancelRunAction("x"),
      () => retryRunAction("x"),
      () => setAgentModelAction("projects", "claude-sonnet-5-5"),
    ];
    for (const f of calls) expect(await f().then(() => "ok", (e: Error) => e.message)).toBe("redirect");
    expect(await isPaused(h(), "projects")).toBe(false);
    expect(await h().select().from(auditLog)).toHaveLength(0);
  });

  it("pauses and resumes globally and per agent, with audit", async () => {
    expect(await pauseAllAction()).toEqual({ ok: true });
    expect(await isPaused(h(), "projects")).toBe(true);
    await resumeAllAction();
    expect(await isPaused(h(), "projects")).toBe(false);
    expect(await pauseAgentAction("home")).toEqual({ ok: false });
    expect(await pauseAgentAction("bogus")).toEqual({ ok: false });
    expect(await pauseAgentAction("projects")).toEqual({ ok: true });
    expect(await isPaused(h(), "projects")).toBe(true);
    await resumeAgentAction("projects");
    expect(await isPaused(h(), "projects")).toBe(false);
    const actions = (await h().select().from(auditLog)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["agents.pause_all", "agents.resume_all", "agents.pause", "agents.resume"]));
  });

  it("cancels a waiting run and its approval", async () => {
    expect(await cancelRunAction("nope")).toEqual({ ok: false });
    const r = await mk({ status: "waiting_approval" });
    const [tc] = await h()
      .insert(toolCalls)
      .values({ runId: r.id, toolUseId: "u", seq: 1, tool: "github.create_issue", tier: "APPROVE", status: "waiting_approval" })
      .returning();
    const [ap] = await h()
      .insert(approvals)
      .values({
        runId: r.id,
        toolCallId: tc!.id,
        agentId: "projects",
        tool: "github.create_issue",
        originalPayload: {},
        payloadHash: "x",
        expiresAt: new Date(Date.now() + 1e6),
      })
      .returning();
    expect(await cancelRunAction(r.id)).toEqual({ ok: true });
    expect((await h().select().from(approvals).where(eq(approvals.id, ap!.id)))[0]!.status).toBe("cancelled");
    expect((await h().select().from(agentRuns).where(eq(agentRuns.id, r.id)))[0]!.status).toBe("cancelled");
  });

  it("retries a failed run, blocked at cap", async () => {
    const r = await mk({ status: "failed" });
    const ok = await retryRunAction(r.id);
    expect(ok.ok).toBe(true);
    expect(ok.runId).toBeTruthy();
    expect((await retryRunAction((await mk({ status: "running" })).id)).ok).toBe(false);
    await setCap(h(), 1);
    await mk({ costUsd: "5", startedAt: new Date() });
    expect(await retryRunAction(r.id)).toEqual({ ok: false, code: "cap" });
  });

  it("sets the model for a live agent only with a known model", async () => {
    expect(await setAgentModelAction("projects", "claude-sonnet-5-5")).toEqual({ ok: true });
    expect(await setAgentModelAction("projects", "gpt-9")).toEqual({ ok: false });
    expect(await setAgentModelAction("home", "claude-sonnet-5-5")).toEqual({ ok: false });
    expect(await setAgentModelAction("projects", "auto")).toEqual({ ok: true });
    expect(await setAgentModelAction("projects", "free")).toEqual({ ok: true });
    expect(await setAgentModelAction("orchestrator", "free")).toEqual({ ok: false });
    expect(await setAgentModelAction("orchestrator", "auto")).toEqual({ ok: false });
  });
});
