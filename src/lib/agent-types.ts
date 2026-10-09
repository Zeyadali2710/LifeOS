// Client-safe agent contracts (no server imports). ISO strings, null not undefined.
import type { ApprovalKind } from "./approval-kinds";

export const TOOL_TIERS = ["READ", "PREPARE", "APPROVE", "EXECUTE", "HIGH_RISK"] as const;
export type ToolTier = (typeof TOOL_TIERS)[number];

export const RUN_STATUSES = ["queued", "running", "waiting_approval", "completed", "failed", "cancelled", "expired"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "executing", "executed", "failed", "rejected", "expired", "cancelled"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export type StepState = "queued" | "running" | "done" | "waiting" | "failed" | "cancelled";

export type RouteEventKind = "routed" | "fallback" | "escalated" | "private" | "blocked";
// seq orders the event among tool steps; fractional allowed.
export type RouteEvent = { at: string; kind: RouteEventKind; from: string | null; to: string | null; reason: string; seq: number };

export type StepDTO = {
  id: string;
  runId: string;
  seq: number;
  kind: "tool" | "delegate" | "route";
  actor: string;
  action: string;
  tool: string | null;
  state: StepState;
  startedAt: string | null;
  durationMs: number | null;
  inputSummary: string | null;
  outputSummary: string | null;
  error: string | null;
};

export type RunDTO = {
  id: string;
  agentId: string;
  threadId: string | null;
  parentRunId: string | null;
  retryOf: string | null;
  prompt: string;
  model: string;
  tier: "simple" | "reasoning" | null;
  status: RunStatus;
  answer: string | null;
  error: string | null;
  errorKind: string | null;
  tokensIn: number;
  tokensOut: number;
  tokensCache: number;
  costUsd: number;
  toolCalls: number;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  firstToolMs: number | null;
};

export type ApprovalDTO = {
  id: string;
  runId: string;
  agentId: string;
  tool: string;
  status: ApprovalStatus;
  kind: ApprovalKind;
  original: unknown;
  edited: unknown | null;
  reason: string | null;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  result: unknown;
  error: string | null;
  repoPrivate: boolean | null;
};

export type ThreadDTO = { id: string; title: string; updatedAt: string; messageCount: number };

export type TurnDTO = { id: string; prompt: string; at: string; run: RunDTO | null; steps: StepDTO[]; approvals: ApprovalDTO[] };

export type ThreadDetailDTO = { thread: ThreadDTO; turns: TurnDTO[] };

export type ChatEvent =
  | { k: "run"; run: RunDTO; threadId: string }
  | { k: "step"; step: StepDTO }
  | { k: "delta"; runId: string; text: string }
  | { k: "approval"; approval: ApprovalDTO }
  | { k: "done"; run: RunDTO };

export type ChatBlockCode = "no_key" | "cap" | "paused" | "rate_limited" | "invalid";

export type AssistantState = "ready" | "working" | "paused" | "cap" | "no_key";

export type AgentStatusDTO = {
  assistant: AssistantState;
  running: number;
  queued: number;
  approvalsWaiting: number;
  mtdUsd: number;
  capUsd: number;
  firstRepo: string | null;
};

export type ConnectionId = "github_read" | "github_write" | "openrouter";

export type ConnectionDTO = {
  id: ConnectionId;
  status: "connected" | "error" | "none";
  login: string | null;
  last4: string | null;
  expiresAt: string | null;
  repos: string[];
  lastSyncAt: string | null;
  lastSyncError: string | null;
};
