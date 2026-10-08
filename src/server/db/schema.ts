import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { RouteEvent } from "../../lib/agent-types";

// Column names are snake_case via `casing: "snake_case"` (see client.ts, drizzle.config.ts).
const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};

// ── Better Auth (field names must match its model) ─────────────────────────
export const users = pgTable("users", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  ...timestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(),
    token: text().notNull().unique(),
    userId: text().notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text().notNull().references(() => users.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const verifications = pgTable("verifications", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  ...timestamps,
});

export const rateLimits = pgTable("rate_limits", {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

// ── LifeOS core ─────────────────────────────────────────────────────────────
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    actor: text().notNull(), // "owner" | "agent:<id>" | "system"
    action: text().notNull(), // e.g. "auth.sign_in"
    target: text(),
    ip: text(),
    metadata: jsonb().$type<Record<string, unknown>>(),
  },
  (t) => [index().on(t.occurredAt.desc()), index().on(t.action)],
);

export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    type: text().notNull(), // dotted: "github.pr.opened", "agent.run.completed"
    source: text().notNull(), // integration or agent id
    entityType: text(),
    entityId: text(),
    title: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>(),
  },
  (t) => [index().on(t.occurredAt.desc()), index().on(t.type), index().on(t.entityType, t.entityId)],
);

export const notificationCategory = pgEnum("notification_category", [
  "URGENT",
  "IMPORTANT",
  "FYI",
  "AGENT",
  "APPROVAL",
  "REMINDER",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    category: notificationCategory().notNull(),
    priority: integer().notNull().default(0),
    source: text().notNull(),
    title: text().notNull(),
    body: text(),
    entityType: text(),
    entityId: text(),
    actionUrl: text(),
    activityEventId: uuid().references(() => activityEvents.id, { onDelete: "set null" }),
    readAt: timestamp({ withTimezone: true }),
    snoozedUntil: timestamp({ withTimezone: true }),
    dismissedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("notifications_inbox_idx").on(t.createdAt.desc()).where(sql`${t.dismissedAt} is null`)],
);

// ── Phase 3: agents ─────────────────────────────────────────────────────────
const tstz = () => timestamp({ withTimezone: true });

export const toolTier = pgEnum("tool_tier", ["READ", "PREPARE", "APPROVE", "EXECUTE", "HIGH_RISK"]);
export const runStatus = pgEnum("run_status", [
  "queued", "running", "waiting_approval", "completed", "failed", "cancelled", "expired",
]);
export const toolCallStatus = pgEnum("tool_call_status", ["running", "done", "failed", "waiting_approval", "cancelled"]);
export const approvalStatus = pgEnum("approval_status", [
  "pending", "approved", "executing", "executed", "failed", "rejected", "expired", "cancelled",
]);

// Missing row = registry defaults.
export const agents = pgTable("agents", {
  id: text().primaryKey(),
  paused: boolean().notNull().default(false),
  model: text(), // null = registry default
  updatedAt: tstz().notNull().defaultNow().$onUpdate(() => new Date()),
});

export const permissions = pgTable(
  "permissions",
  {
    agentId: text().notNull(),
    tool: text().notNull(),
    tier: toolTier().notNull(),
    updatedAt: tstz().notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.agentId, t.tool] })],
);

export const threads = pgTable(
  "threads",
  {
    id: uuid().primaryKey().defaultRandom(),
    title: text().notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.updatedAt.desc())],
);

export const threadMessages = pgTable(
  "thread_messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    threadId: uuid().notNull().references(() => threads.id, { onDelete: "cascade" }),
    role: text().notNull(), // "user" | "assistant"
    content: text().notNull(),
    runId: uuid(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [index().on(t.threadId, t.createdAt)],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    agentId: text().notNull(),
    threadId: uuid().references(() => threads.id, { onDelete: "set null" }),
    parentRunId: uuid().references((): AnyPgColumn => agentRuns.id, { onDelete: "set null" }),
    retryOf: uuid(),
    prompt: text().notNull(),
    model: text().notNull(), // current/final model; updated when a run switches (D-05)
    tier: text(), // null | "simple" | "reasoning" (D-01)
    routeMode: text(), // null = not routed, "auto" = tiered with Sonnet fallback, "free" = pinned Free only (D-04)
    routeEvents: jsonb().$type<RouteEvent[]>().notNull().default([]),
    sawPrivate: boolean().notNull().default(false), // D-09 thread-level private-data taint
    status: runStatus().notNull().default("queued"),
    messages: jsonb().$type<unknown[]>().notNull().default([]),
    answer: text(),
    error: text(),
    errorKind: text(), // "limit:tool_calls" | "limit:tokens" | "limit:time" | "interrupted" | "llm" | ...
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    cacheWriteTokens: integer().notNull().default(0),
    cacheReadTokens: integer().notNull().default(0),
    costUsd: numeric({ precision: 12, scale: 6 }).notNull().default("0"),
    toolCallCount: integer().notNull().default(0),
    activeMs: integer().notNull().default(0),
    startedAt: tstz(),
    firstToolAt: tstz(),
    endedAt: tstz(),
    heartbeatAt: tstz(),
    cancelRequestedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index().on(t.agentId, t.createdAt.desc()),
    index().on(t.status),
    index().on(t.createdAt.desc()),
    index().on(t.threadId),
    index().on(t.startedAt),
  ],
);

export const toolCalls = pgTable(
  "tool_calls",
  {
    id: uuid().primaryKey().defaultRandom(),
    runId: uuid().notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
    toolUseId: text().notNull(),
    seq: integer().notNull(),
    kind: text().notNull().default("tool"), // "tool" | "delegate"
    tool: text().notNull(), // dotted display name
    tier: toolTier().notNull(),
    status: toolCallStatus().notNull(),
    input: jsonb(),
    output: jsonb(),
    inputSummary: text(),
    outputSummary: text(),
    error: text(),
    idempotencyKey: text(),
    childRunId: uuid(),
    startedAt: tstz(),
    durationMs: integer(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex().on(t.idempotencyKey),
    uniqueIndex().on(t.runId, t.toolUseId),
    index().on(t.runId, t.seq),
  ],
);

export const runTurns = pgTable(
  "run_turns",
  {
    id: uuid().primaryKey().defaultRandom(),
    runId: uuid().notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
    seq: integer().notNull(),
    model: text().notNull(),
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    cacheWriteTokens: integer().notNull().default(0),
    cacheReadTokens: integer().notNull().default(0),
    costUsd: numeric({ precision: 12, scale: 6 }).notNull().default("0"),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [index().on(t.runId)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid().primaryKey().defaultRandom(),
    runId: uuid().notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
    toolCallId: uuid().notNull().references(() => toolCalls.id, { onDelete: "cascade" }),
    agentId: text().notNull(),
    tool: text().notNull(), // e.g. "github.create_issue"
    status: approvalStatus().notNull().default("pending"),
    originalPayload: jsonb().notNull(),
    editedPayload: jsonb(),
    payloadHash: text().notNull(),
    reason: text(),
    expiresAt: tstz().notNull(),
    decidedAt: tstz(),
    result: jsonb().$type<{ number: number; url: string } | null>(),
    error: text(),
    ambiguous: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [index().on(t.status, t.expiresAt), index().on(t.createdAt.desc())],
);

// Ciphertext + last4 only; never store the raw token.
export const connections = pgTable("connections", {
  id: text().primaryKey(), // "github_read" | "github_write"
  ciphertext: text().notNull(),
  last4: text().notNull(),
  login: text(),
  expiresAt: tstz(),
  status: text().notNull().default("connected"), // "connected" | "error"
  lastError: text(),
  repos: jsonb().$type<string[]>().notNull().default([]),
  lastSyncAt: tstz(),
  lastSyncError: text(),
  ...timestamps,
});

// ── Phase 3: GitHub sync ────────────────────────────────────────────────────
export const githubRepos = pgTable("github_repos", {
  id: bigint({ mode: "number" }).primaryKey(),
  fullName: text().notNull().unique(),
  owner: text(),
  name: text(),
  private: boolean(),
  defaultBranch: text(),
  htmlUrl: text(),
  description: text(),
  language: text(),
  archived: boolean().default(false),
  pushedAt: tstz(),
  syncedAt: tstz(),
  ...timestamps,
});

const repoRef = () => bigint({ mode: "number" }).references(() => githubRepos.id, { onDelete: "cascade" });

export const githubPullRequests = pgTable(
  "github_pull_requests",
  {
    id: bigint({ mode: "number" }).primaryKey(),
    repoId: repoRef(),
    number: integer(),
    title: text(),
    state: text(),
    draft: boolean(),
    merged: boolean().default(false),
    mergedAt: tstz(),
    authorLogin: text(),
    htmlUrl: text(),
    requestedReviewers: jsonb().$type<string[]>().default([]),
    reviews: jsonb().$type<{ login: string; state: string; submittedAt: string | null }[]>().default([]),
    ghUpdatedAt: tstz(),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.repoId, t.number)],
);

export const githubIssues = pgTable(
  "github_issues",
  {
    id: bigint({ mode: "number" }).primaryKey(),
    repoId: repoRef(),
    number: integer(),
    title: text(),
    state: text(),
    authorLogin: text(),
    assignees: jsonb().$type<string[]>().default([]),
    labels: jsonb().$type<string[]>().default([]),
    htmlUrl: text(),
    ghUpdatedAt: tstz(),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.repoId, t.number)],
);

export const githubCommits = pgTable(
  "github_commits",
  {
    sha: text().primaryKey(),
    repoId: repoRef(),
    message: text(), // first line
    authorLogin: text(),
    committedAt: tstz(),
    htmlUrl: text(),
  },
  (t) => [index().on(t.repoId, t.committedAt.desc())],
);

export const githubWorkflowRuns = pgTable(
  "github_workflow_runs",
  {
    id: bigint({ mode: "number" }).primaryKey(),
    repoId: repoRef(),
    name: text(),
    branch: text(),
    status: text(),
    conclusion: text(),
    htmlUrl: text(),
    headSha: text(),
    ghCreatedAt: tstz(),
  },
  (t) => [index().on(t.repoId, t.ghCreatedAt.desc())],
);

export const githubEtags = pgTable("github_etags", {
  url: text().primaryKey(),
  etag: text().notNull(),
  updatedAt: tstz().notNull().defaultNow().$onUpdate(() => new Date()),
});
