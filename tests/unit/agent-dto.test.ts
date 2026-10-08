import { describe, expect, it } from "vitest";
import { routeSteps, toApprovalDTO, toRunDTO, toStepDTO } from "@/server/agents/dto";
import { modelLabel, modelShort } from "@/server/agents/registry";

const t0 = new Date("2026-01-01T00:00:00Z");
const run = {
  id: "r", agentId: "chief", threadId: null, parentRunId: null, retryOf: null, prompt: "p", model: "m", status: "completed",
  messages: [{ secret: 1 }], answer: "a", error: null, errorKind: null, inputTokens: 10, outputTokens: 5, cacheWriteTokens: 2,
  cacheReadTokens: 3, costUsd: "0.043100", toolCallCount: 1, activeMs: 0, startedAt: t0, firstToolAt: new Date(t0.getTime() + 500),
  endedAt: new Date(t0.getTime() + 2000), tier: null,
} as never;

describe("dto", () => {
  it("maps run", () => {
    const d = toRunDTO(run);
    expect(d).toMatchObject({ costUsd: 0.0431, tokensCache: 5, durationMs: 2000, firstToolMs: 500, startedAt: t0.toISOString() });
    expect(JSON.stringify(d)).not.toContain("secret");
    expect(toRunDTO({ ...(run as object), endedAt: null } as never).durationMs).toBeNull();
  });
  it("maps step", () => {
    const row = { id: "s", runId: "r", seq: 1, kind: "tool", tool: "github.list", status: "waiting_approval", startedAt: null, durationMs: null, inputSummary: null, outputSummary: null, error: null } as never;
    expect(toStepDTO(row, { agentId: "chief" })).toMatchObject({ state: "waiting", actor: "chief", action: "github.list" });
    expect(toStepDTO({ ...(row as object), kind: "delegate", tool: "dev" } as never, { agentId: "chief" }, () => "Dev").action).toBe("Delegating to Dev");
  });
  it("maps approval and throws on bad payload", () => {
    const row = {
      id: "a", runId: "r", agentId: "dev", tool: "github.create_issue", status: "pending", originalPayload: { repo: "o/r", title: "T" },
      editedPayload: null, reason: null, createdAt: t0, expiresAt: t0, decidedAt: null, result: null, error: null,
    } as never;
    expect(toApprovalDTO(row).original).toEqual({ repo: "o/r", title: "T", body: "", labels: [] });
    expect(() => toApprovalDTO({ ...(row as object), originalPayload: {} } as never)).toThrow();
  });
  it("maps tier", () => {
    expect(toRunDTO(run).tier).toBeNull();
    expect(toRunDTO({ ...(run as object), tier: "simple" } as never).tier).toBe("simple");
  });
  it("maps route events to steps", () => {
    const ev = (kind: string, to: string | null, reason: string, from: string | null = null) => ({ at: t0.toISOString(), kind, from, to, reason, seq: 0 });
    const steps = (e: unknown[]) => routeSteps({ id: "r", agentId: "projects", routeEvents: e } as never);
    const one = steps([ev("routed", "x/y:free", "tag simple")])[0]!;
    expect(one).toMatchObject({ id: "route:r:0", kind: "route", state: "done", action: "Routed: free (tag simple)", tool: "x/y:free", actor: "projects" });
    expect(steps([ev("fallback", "claude-sonnet-5-5", "timeout", "x:free")])[0]!.action).toBe("Fell back → Sonnet: timeout");
    expect(steps([ev("escalated", "claude-sonnet-5-5", "needs analysis")])[0]!.action).toBe("Escalated → Sonnet: needs analysis");
    expect(steps([ev("private", "claude-sonnet-5-5", "private repo data")])[0]!.action).toBe("Switched → Sonnet: private repo data");
    expect(steps([ev("routed", "claude-sonnet-5-5", "tag reasoning")])[0]!.action).toBe("Routed: Claude Sonnet 5.5 (tag reasoning)");
    expect(steps([ev("blocked", null, "rate limited")])[0]).toMatchObject({ state: "failed", error: "rate limited", action: "Free model unavailable: rate limited" });
    expect(steps([ev("routed", "x:free", "a".repeat(500))])[0]!.action.length).toBeLessThan(260);
  });
  it("labels models", () => {
    expect(modelLabel("vendor/some-model:free")).toBe("Free · some-model");
    expect(modelShort("vendor/some-model:free")).toBe("FREE");
    expect(modelShort("claude-sonnet-5-5")).toBe("SONNET");
    expect(modelShort("a/b-c")).toBe("b-c");
  });
});
