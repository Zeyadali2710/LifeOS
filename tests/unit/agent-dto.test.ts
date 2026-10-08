import { describe, expect, it } from "vitest";
import { toApprovalDTO, toRunDTO, toStepDTO } from "@/server/agents/dto";

const t0 = new Date("2026-01-01T00:00:00Z");
const run = {
  id: "r", agentId: "chief", threadId: null, parentRunId: null, retryOf: null, prompt: "p", model: "m", status: "completed",
  messages: [{ secret: 1 }], answer: "a", error: null, errorKind: null, inputTokens: 10, outputTokens: 5, cacheWriteTokens: 2,
  cacheReadTokens: 3, costUsd: "0.043100", toolCallCount: 1, activeMs: 0, startedAt: t0, firstToolAt: new Date(t0.getTime() + 500),
  endedAt: new Date(t0.getTime() + 2000),
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
});
