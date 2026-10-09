import type { ApprovalDTO, RouteEvent, RunDTO, StepDTO, StepState } from "@/lib/agent-types";
import { issuePayloadSchema } from "@/lib/issue-payload";
import { modelLabel } from "./registry";
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
    tier: r.tier === "simple" || r.tier === "reasoning" ? r.tier : null,
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

const isFree = (m: string | null) => !!m && m.endsWith(":free");
const target = (m: string | null) => (isFree(m) ? "free" : m ? modelLabel(m) : "");
const sonnet = "Sonnet";

/** Route events as trace steps (D-13). Reason is untrusted model text: capped, rendered as plain text only. */
export function routeSteps(r: Pick<typeof agentRuns.$inferSelect, "id" | "agentId" | "routeEvents">): StepDTO[] {
  return r.routeEvents.map((ev: RouteEvent, i) => {
    const reason = ev.reason.slice(0, 200);
    const blocked = ev.kind === "blocked";
    const action =
      ev.kind === "routed" ? `Routed: ${target(ev.to)} (${reason})`
      : ev.kind === "fallback" ? `Fell back → ${sonnet}: ${reason}`
      : ev.kind === "escalated" ? `Escalated → ${sonnet}: ${reason}`
      : ev.kind === "private" ? `Switched → ${sonnet}: ${reason}`
      : `Free model unavailable: ${reason}`;
    return {
      id: `route:${r.id}:${i}`,
      runId: r.id,
      seq: ev.seq,
      kind: "route",
      actor: r.agentId,
      action,
      tool: ev.to,
      state: blocked ? "failed" : "done",
      startedAt: ev.at,
      durationMs: null,
      inputSummary: null,
      outputSummary: null,
      error: blocked ? reason : null,
    };
  });
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
    result: (r.result ?? null) as ApprovalDTO["result"],
    error: r.error,
    repoPrivate,
  };
}
