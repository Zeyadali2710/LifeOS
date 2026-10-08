import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { ChatEvent } from "@/lib/agent-types";
import type { DB } from "../db/client";
import { agentRuns, approvals, permissions, toolCalls } from "../db/schema";
import { emitActivity, notifyLive } from "../events";
import { log } from "../log";
import { formatHM, sydneyParts, TZ } from "../time";
import { resolvePolicy } from "./policy";
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

function expiryText(d: Date) {
  const mon = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, month: "short" }).format(d);
  const p = sydneyParts(d);
  return `${p.weekday} ${p.day} ${mon} ${formatHM(d)}`;
}

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
  const tier = resolvePolicy(tool.tier, ov?.tier);
  const needsApproval = tier === "APPROVE" || tier === "HIGH_RISK";

  // Step 4: claim the row (approval branch creates the approval atomically).
  const key = tool.sideEffect && !needsApproval ? sha(`${runId}:${toolUseId}`) : null;
  let approvalId: string | undefined;
  let payload: unknown = input;
  if (needsApproval) payload = tool.toApproval?.(input).payload ?? input;
  const claimed = await h.transaction(async (tx) => {
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
          reason: tool.toApproval?.(input).reason ?? null,
          expiresAt: new Date(now().getTime() + EXPIRY_MS),
        })
        .returning({ id: approvals.id });
      approvalId = ap!.id;
    }
    return row.id;
  });

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
    const p = (payload ?? {}) as { repo?: unknown; title?: unknown };
    const body =
      typeof p.repo === "string" && typeof p.title === "string"
        ? `${p.repo}: "${p.title}". Expires ${expiryText(new Date(now().getTime() + EXPIRY_MS))}.`
        : undefined;
    await (ctx.emit ?? emitActivity)(
      {
        type: "agent.approval.requested",
        source: agentId,
        title: "Approval requested",
        detail: `${agent.name} · ${tool.label}`,
        tone: "amber",
      },
      { category: "APPROVAL", title: `Approval waiting: ${tool.label}`, body, actionUrl: `/approvals?id=${approvalId}` },
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
