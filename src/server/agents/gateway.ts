import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { ChatEvent } from "@/lib/agent-types";
import type { DB } from "../db/client";
import { agentRuns, approvals, permissions, socialPosts, socialVariants, toolCalls } from "../db/schema";
import { emitActivity, notifyLive } from "../events";
import { log } from "../log";
import { approvalSummary } from "@/lib/approval-kinds";
import { automationOrigin, CONTENT_TOOLS, contentScope, resolvePolicy, withContentFloor, withUnattendedFloor } from "./policy";
import { redact, summarize } from "./redact";
import { getAgent } from "./registry";
import { apiName, ToolError, type LlmClient, type Tool, type ToolContext } from "./types";

export type GatewayResult =
  | { status: "ok"; output: unknown; callId: string; duplicate?: boolean }
  | { status: "error"; error: string; callId: string }
  | { status: "waiting_approval"; approvalId: string; callId: string };

type GatewayCtx = {
  handle: DB;
  runId: string;
  agentId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous tool map; each tool validates its own I/O via zod
  tools: Record<string, Tool<any, any>>;
  now?: () => Date;
  emit?: typeof emitActivity;
  fetch?: typeof fetch;
  onEvent?: (e: ChatEvent) => void;
  llm?: LlmClient;
  /** Fired once a fresh tool_calls row is claimed and its handler is about to run (live "running" step). */
  onClaimed?: (callId: string) => Promise<void>;
};

const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const canon = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canon).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.entries(v)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([k, x]) => `${JSON.stringify(k)}:${canon(x)}`)
          .join(",")}}`
      : (JSON.stringify(v) ?? "null");

export async function callTool(
  ctx: GatewayCtx,
  name: string,
  rawInput: unknown,
  toolUseId: string,
): Promise<GatewayResult> {
  const { handle: h, runId, agentId } = ctx;
  const now = ctx.now ?? (() => new Date());
  const tool = ctx.tools[name] ?? Object.values(ctx.tools).find((t) => apiName(t.name) === name || t.name === name);
  const tc: ToolContext = { handle: h, runId, agentId, toolUseId, now, fetch: ctx.fetch, onEvent: ctx.onEvent, llm: ctx.llm };
  const toolName = tool?.name ?? name;
  const kind = toolName === "delegate" ? "delegate" : "tool";

  const base = (tier: Tool["tier"], status: "running" | "failed" | "waiting_approval", key: string | null, input: unknown) => ({
    runId,
    toolUseId,
    kind,
    tool: toolName,
    tier,
    status,
    input: redact(input) ?? null,
    inputSummary: summarize(redact(input)),
    idempotencyKey: key,
    startedAt: now(),
    seq: sql<number>`(select coalesce(max(seq), 0) + 1 from tool_calls where run_id = ${runId})`,
  });

  const bump = (tx: DB) =>
    tx
      .update(agentRuns)
      .set({ toolCallCount: sql`${agentRuns.toolCallCount} + 1`, firstToolAt: sql`coalesce(${agentRuns.firstToolAt}, ${now()})` })
      .where(eq(agentRuns.id, runId));

  /** Record a rejection as a failed row. */
  const reject = async (error: string): Promise<GatewayResult> => {
    const [row] = await h
      .insert(toolCalls)
      .values({ ...base(tool?.tier ?? "READ", "failed", null, rawInput), error })
      .onConflictDoNothing()
      .returning({ id: toolCalls.id });
    if (row) await bump(h);
    return { status: "error", error, callId: row?.id ?? "" };
  };

  // Step 1: allow-list, liveness, cancel, availability.
  const agent = getAgent(agentId);
  if (!tool || !agent?.live || !agent.tools.includes(tool.name)) {
    return reject(!agent?.live ? "agent is not live" : `tool ${name} not allowed for this agent`);
  }
  const [run] = await h.select({ c: agentRuns.cancelRequestedAt }).from(agentRuns).where(eq(agentRuns.id, runId));
  if (run?.c) return reject("cancelled");
  const unavailable = await tool.available?.(tc);
  if (unavailable) return reject(unavailable);

  // Step 2: validate + re-resolve entities.
  const parsed = tool.input.safeParse(rawInput);
  if (!parsed.success) return reject(`invalid input: ${parsed.error.message}`);
  let input = parsed.data;
  try {
    if (tool.resolve) input = await tool.resolve(input, tc);
  } catch (err) {
    return reject(err instanceof ToolError ? err.message : "Tool failed");
  }

  // Step 3: tier.
  const [ov] = await h
    .select({ tier: permissions.tier })
    .from(permissions)
    .where(and(eq(permissions.agentId, agentId), eq(permissions.tool, tool.name)));
  const resolved = resolvePolicy(tool.tier, ov?.tier);
  let seen = false;
  if (tool.sideEffect && resolved !== "APPROVE" && resolved !== "HIGH_RISK") {
    // Tree, thread and retried runs count, so a write can't escape via a fresh child run, a later turn or a retry.
    const [hit] = await h
      .select({ id: toolCalls.id })
      .from(toolCalls)
      .where(and(inArray(toolCalls.tool, [...CONTENT_TOOLS]), sql`${toolCalls.runId} in ${contentScope(runId)}`))
      .limit(1);
    seen = Boolean(hit);
  }
  // The automations agent executes the owner's own configured actions; every other agent in an unattended tree is floored.
  const unattended = tool.sideEffect && agentId !== "automations" && (await automationOrigin(h, runId));
  const tier = withUnattendedFloor(withContentFloor(resolved, tool.sideEffect, seen), tool.sideEffect, unattended);
  const needsApproval = tier === "APPROVE" || tier === "HIGH_RISK";

  // Step 4: claim the row (approval branch creates the approval atomically).
  const key = tool.sideEffect && !needsApproval ? sha(`${runId}:${toolUseId}`) : null;
  let approvalId: string | undefined;
  let payload: unknown = input;
  let reason: string | null = null;
  if (needsApproval) {
    // A throwing toApproval (e.g. schema drift) is a failed call the model can correct, not a failed run.
    try {
      const ap = tool.toApproval?.(input);
      payload = ap?.payload ?? input;
      reason = ap?.reason ?? null;
    } catch (err) {
      if (!(err instanceof ToolError)) log.error({ err, tool: tool.name }, "toApproval failed");
      return reject(err instanceof ToolError ? err.message : "invalid input: the approval request could not be prepared");
    }
  }
  let claimed: string | null;
  try { claimed = await h.transaction(async (tx) => {
    if (tool.name === "socials.publish") {
      const [variant] = await tx.select({ postId: socialVariants.postId }).from(socialVariants).where(eq(socialVariants.id, input.variantId as string));
      if (!variant) throw new ToolError("not_allowed", "This variant no longer exists.");
      // Social mutations lock parent then variant, so deletion cannot pass a stale publication guard.
      const [post] = await tx.select({ id: socialPosts.id }).from(socialPosts).where(eq(socialPosts.id, variant.postId)).for("update");
      if (!post) throw new ToolError("not_allowed", "This post no longer exists.");
    }
    const [row] = await tx
      .insert(toolCalls)
      .values(base(tier, needsApproval ? "waiting_approval" : "running", key, input))
      .onConflictDoNothing()
      .returning({ id: toolCalls.id });
    if (!row) return null;
    await bump(tx);
    if (needsApproval) {
      const [ap] = await tx
        .insert(approvals)
        .values({
          runId,
          toolCallId: row.id,
          agentId,
          tool: tool.name,
          originalPayload: payload,
          payloadHash: sha(canon(payload)),
          reason,
          expiresAt: new Date(now().getTime() + EXPIRY_MS),
        })
        .returning({ id: approvals.id });
      approvalId = ap!.id;
      if (tool.name === "socials.publish") {
        const [linked] = await tx.update(socialVariants).set({ status: "pending_approval", approvalId, updatedAt: now() })
          .where(and(eq(socialVariants.id, input.variantId as string), eq(socialVariants.platform, input.platform as string), eq(socialVariants.status, "draft")))
          .returning({ id: socialVariants.id });
        if (!linked) throw new ToolError("not_allowed", "This variant already has a publish request.");
      }
    }
    return row.id;
  }); } catch (err) { return reject(err instanceof ToolError ? err.message : "Approval request failed."); }

  if (!claimed) {
    // Duplicate (idempotency key or run+toolUseId): answer from the stored row.
    const [ex] = await h
      .select()
      .from(toolCalls)
      .where(key ? eq(toolCalls.idempotencyKey, key) : and(eq(toolCalls.runId, runId), eq(toolCalls.toolUseId, toolUseId)));
    if (!ex) return { status: "error", error: "already running", callId: "" };
    if (ex.status === "done") return { status: "ok", output: ex.output, callId: ex.id, duplicate: true };
    if (ex.status === "failed") return { status: "error", error: ex.error ?? "Tool failed", callId: ex.id };
    if (ex.status === "waiting_approval") {
      const [ap] = await h.select({ id: approvals.id }).from(approvals).where(eq(approvals.toolCallId, ex.id));
      if (ap) return { status: "waiting_approval", approvalId: ap.id, callId: ex.id };
    }
    return { status: "error", error: "already running", callId: ex.id };
  }
  const callId = claimed;

  if (needsApproval) {
    const s = approvalSummary(tool.name, payload, new Date(now().getTime() + EXPIRY_MS));
    await (ctx.emit ?? emitActivity)(
      {
        type: "agent.approval.requested",
        source: agentId,
        title: "Approval requested",
        detail: `${agent.name} · ${tool.label}`,
        tone: "amber",
      },
      { category: "APPROVAL", title: s.title || `Approval waiting: ${tool.label}`, body: s.body, actionUrl: `/approvals?id=${approvalId}` },
      h,
    );
    await notifyLive(h, "approval", approvalId!);
    return { status: "waiting_approval", approvalId: approvalId!, callId };
  }

  // Steps 5-6: run the handler.
  await ctx.onClaimed?.(callId);
  const t0 = Date.now();
  const finish = async (set: Partial<typeof toolCalls.$inferInsert>) => {
    await h.update(toolCalls).set({ ...set, durationMs: Date.now() - t0 }).where(eq(toolCalls.id, callId));
  };
  try {
    const out = tool.output.safeParse(await tool.handler(input, tc));
    if (!out.success) throw new ToolError("invalid_input", "invalid output from tool");
    const o = redact(out.data);
    await finish({ status: "done", output: o ?? null, outputSummary: summarize(o) });
    return { status: "ok", output: out.data, callId };
  } catch (err) {
    let msg = "Tool failed";
    if (err instanceof ToolError) msg = err.message;
    else log.error({ err, tool: tool.name }, "tool handler failed");
    await finish({ status: "failed", error: msg });
    return { status: "error", error: msg, callId };
  }
}
