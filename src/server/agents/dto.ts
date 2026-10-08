import type { ApprovalDTO, RunDTO, StepDTO, StepState } from "@/lib/agent-types";
import { issuePayloadSchema } from "@/lib/issue-payload";
import type { agentRuns, approvals, toolCalls } from "../db/schema";

// Pure row -> DTO mappers (no DB, JSON-safe). Never expose messages/ciphertext (T-03-27).
const iso = (d: Date | null) => d?.toISOString() ?? null;
const diff = (a: Date | null, b: Date | null) => (a && b ? a.getTime() - b.getTime() : null);

export function toRunDTO(r: typeof agentRuns.$inferSelect): RunDTO {
  return {
    id: r.id,
    agentId: r.agentId,
    threadId: r.threadId,
    parentRunId: r.parentRunId,
    retryOf: r.retryOf,
    prompt: r.prompt,
    model: r.model,
    status: r.status,
    answer: r.answer,
    error: r.error,
    errorKind: r.errorKind,
    tokensIn: r.inputTokens,
    tokensOut: r.outputTokens,
    tokensCache: r.cacheReadTokens + r.cacheWriteTokens,
    costUsd: Number(r.costUsd),
    toolCalls: r.toolCallCount,
    startedAt: iso(r.startedAt),
    endedAt: iso(r.endedAt),
    durationMs: diff(r.endedAt, r.startedAt),
    firstToolMs: diff(r.firstToolAt, r.startedAt),
  };
}

const STATE: Record<string, StepState> = {
  running: "running",
  done: "done",
  failed: "failed",
  waiting_approval: "waiting",
  cancelled: "cancelled",
};

export function toStepDTO(
  r: typeof toolCalls.$inferSelect,
  run: { agentId: string },
  labels: (tool: string) => string = (t) => t,
): StepDTO {
  const label = labels(r.tool);
  return {
    id: r.id,
    runId: r.runId,
    seq: r.seq,
    kind: r.kind === "delegate" ? "delegate" : "tool",
    actor: run.agentId,
    action: r.kind === "delegate" ? `Delegating to ${label}` : label,
    tool: r.tool,
    state: STATE[r.status] ?? "queued",
    startedAt: iso(r.startedAt),
    durationMs: r.durationMs,
    inputSummary: r.inputSummary,
    outputSummary: r.outputSummary,
    error: r.error,
  };
}

/** Throws on an invalid stored payload; caller logs. */
export function toApprovalDTO(r: typeof approvals.$inferSelect, repoPrivate: boolean | null = null): ApprovalDTO {
  return {
    id: r.id,
    runId: r.runId,
    agentId: r.agentId,
    tool: r.tool,
    status: r.status,
    original: issuePayloadSchema.parse(r.originalPayload),
    edited: r.editedPayload == null ? null : issuePayloadSchema.parse(r.editedPayload),
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    decidedAt: iso(r.decidedAt),
    result: r.result ?? null,
    error: r.error,
    repoPrivate,
  };
}
