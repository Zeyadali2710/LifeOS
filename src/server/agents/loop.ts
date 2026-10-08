import type Anthropic from "@anthropic-ai/sdk";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { ChatEvent, RouteEvent, RunStatus } from "@/lib/agent-types";
import { formatDuration } from "@/lib/format";
import { db, type DB } from "../db/client";
import { agentRuns, approvals, runTurns, toolCalls } from "../db/schema";
import { emitActivity, notifyLive } from "../events";
import { log } from "../log";
import { enqueue as realEnqueue, QUEUES, type Enqueue } from "../queue";
import { routeSteps, toApprovalDTO, toRunDTO, toStepDTO } from "./dto";
import { callTool } from "./gateway";
import { getLlm } from "./llm";
import { costUsd } from "./pricing";
import { FreeModelError } from "./openrouter";
import { getAgent, MODELS, RUN_LIMITS } from "./registry";
import {
  checkFreeTurn,
  ESCALATE_TOOL,
  escalateReason,
  FREE_SUFFIX,
  freeCoolingDown,
  getFreePrivateOk,
  hasFreeKey,
  isFree,
  markFreeUnavailable,
  mentionsSensitive,
  privateInTree,
  resolveModel,
  sensitiveRepoNames,
} from "./routing";
import { agentConfig, isPaused } from "./runs";
import { assertUnderCap } from "./spend";
import { appendMessage, threadHistory } from "./threads";
import { TOOLS, toolLabel } from "./tools";
import { toAnthropicTool, type LlmClient, type LlmUsage, type Tool } from "./types";

type Msg = Anthropic.MessageParam;

export type CreateRunResult = { ok: true; runId: string } | { ok: false; code: "paused" | "cap" | "not_live" | "private_blocked"; capUsd?: number };

/** Preflight (live, pause, spend cap) then insert a queued run. Child runs skip the cap (D-15). */
export async function createRun(
  h: DB,
  p: { agentId: string; prompt: string; threadId?: string | null; parentRunId?: string; retryOf?: string; tier?: "simple" | "reasoning" | null; tierReason?: string; privacyAnchor?: string | null; now?: () => Date; emit?: typeof emitActivity },
): Promise<CreateRunResult> {
  if (!getAgent(p.agentId)?.live) return { ok: false, code: "not_live" };
  if (await isPaused(h, p.agentId)) return { ok: false, code: "paused" };
  if (!p.parentRunId) {
    const cap = await assertUnderCap(h, (p.now ?? (() => new Date()))(), p.emit);
    if (!cap.ok) return { ok: false, code: "cap", capUsd: cap.capUsd };
  }
  const agent = getAgent(p.agentId)!;
  const cfg = await agentConfig(h, p.agentId);
  const at = (p.now ?? (() => new Date()))();
  const { model, mode, reason, blocked } = resolveModel({
    agentId: p.agentId,
    pref: cfg.pref,
    routable: !!agent.routable,
    defaultModel: agent.defaultModel,
    tier: p.tier ?? null,
    hasKey: await hasFreeKey(h),
    coolingDown: freeCoolingDown(at),
    privateTainted: await privateInTree(h, p.parentRunId ?? p.privacyAnchor ?? null),
    privateOk: await getFreePrivateOk(h),
  });
  if (blocked) return { ok: false, code: blocked };
  const history: Msg[] = p.threadId ? await threadHistory(h, p.threadId, 20) : [];
  const last = history.at(-1);
  // The chat route may already have stored this prompt in the thread; don't send it twice.
  if (!(last?.role === "user" && last.content === p.prompt)) history.push({ role: "user", content: p.prompt });
  const [run] = await h
    .insert(agentRuns)
    .values({
      agentId: p.agentId,
      threadId: p.threadId ?? null,
      parentRunId: p.parentRunId ?? null,
      retryOf: p.retryOf ?? null,
      prompt: p.prompt,
      model,
      tier: p.tier ?? null,
      routeMode: mode,
      routeEvents: mode
        ? [{ at: at.toISOString(), kind: "routed", from: null, to: model, reason: (reason ?? "") + (p.tierReason ? `: ${p.tierReason.slice(0, 200)}` : ""), seq: 0 }]
        : [],
      messages: history,
    })
    .returning({ id: agentRuns.id });
  await notifyLive(h, "run", run!.id);
  return { ok: true, runId: run!.id };
}

export class PendingToolError extends Error {}

/** One user message answering each tool_use id, from persisted rows (never from memory). */
export async function buildToolResults(h: DB, runId: string, toolUseIds: string[], opts: { allowPending?: boolean } = {}): Promise<Msg> {
  const rows = await h.select().from(toolCalls).where(and(eq(toolCalls.runId, runId), inArray(toolCalls.toolUseId, toolUseIds)));
  const content: Anthropic.ToolResultBlockParam[] = [];
  for (const id of toolUseIds) {
    const r = rows.find((x) => x.toolUseId === id);
    if (r?.status === "waiting_approval" || r?.status === "running") {
      if (opts.allowPending) continue;
      throw new PendingToolError(`tool call ${id} is still ${r.status}`);
    }
    if (r?.status === "done") content.push({ type: "tool_result", tool_use_id: id, content: `<tool_data>${JSON.stringify(r.output ?? null).replaceAll("<", "\\u003c")}</tool_data>` });
    else content.push({ type: "tool_result", tool_use_id: id, is_error: true, content: r?.error ?? r?.status ?? "Tool call not found" });
  }
  return { role: "user", content };
}

export type AdvanceOpts = {
  handle?: DB;
  llm: LlmClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous tool map
  tools?: Record<string, Tool<any, any>>;
  onEvent?: (e: ChatEvent) => void;
  now?: () => Date;
  fetch?: typeof fetch;
  signal?: AbortSignal;
};

const TERMINAL = ["completed", "failed", "cancelled", "expired"];

export async function advance(runId: string, opts: AdvanceOpts): Promise<RunStatus> {
  const h = opts.handle ?? db();
  const now = opts.now ?? (() => new Date());
  const tools = opts.tools ?? TOOLS;
  // Aborting the request only stops streaming to the client; the run continues (UI-SPEC).
  const emit = (e: ChatEvent) => {
    if (opts.signal?.aborted) return;
    try {
      opts.onEvent?.(e);
    } catch (err) {
      log.error({ err }, "onEvent failed");
    }
  };

  const [claimed] = await h
    .update(agentRuns)
    .set({ status: "running", startedAt: sql`coalesce(${agentRuns.startedAt}, ${now()})`, heartbeatAt: now() })
    .where(and(eq(agentRuns.id, runId), inArray(agentRuns.status, ["queued", "waiting_approval"])))
    .returning();
  if (!claimed) {
    const [cur] = await h.select({ s: agentRuns.status }).from(agentRuns).where(eq(agentRuns.id, runId));
    return cur?.s ?? "failed";
  }

  const run0 = claimed;
  const agent = getAgent(run0.agentId);
  const setStatus = async (set: Partial<typeof agentRuns.$inferInsert>): Promise<RunStatus> => {
    // Only a still-running run may be finished: a swept/cancelled run must not be resurrected.
    const [row] = await h.update(agentRuns).set(set).where(and(eq(agentRuns.id, runId), eq(agentRuns.status, "running"))).returning();
    if (!row) {
      const [cur] = await h.select({ s: agentRuns.status }).from(agentRuns).where(eq(agentRuns.id, runId));
      return cur?.s ?? "failed";
    }
    await notifyLive(h, "run", runId);
    emit({ k: "done", run: toRunDTO(row) });
    return row.status;
  };
  const finish = async (set: Partial<typeof agentRuns.$inferInsert>): Promise<RunStatus> => {
    const status = await setStatus({ ...set, endedAt: now() });
    if (run0.parentRunId) await resumeParent(h, runId, opts);
    return status;
  };
  const fail = (kind: string, error: string) => finish({ status: "failed", errorKind: kind, error });

  try {
    if (!agent?.live) return await fail("not_live", "Agent is not live");
    const allowed = Object.fromEntries(agent.tools.flatMap((n) => (tools[n] ? [[n, tools[n]!]] : [])));
    const anthropicTools = Object.values(allowed).map(toAnthropicTool);
    const messages = [...(run0.messages as Msg[])];
    let toolCount = run0.toolCallCount;
    let tokens = run0.inputTokens + run0.outputTokens;
    let active = run0.activeMs;
    const persist = (extra: Partial<typeof agentRuns.$inferInsert> = {}) =>
      h.update(agentRuns).set({ messages, activeMs: active, heartbeatAt: now(), ...extra }).where(eq(agentRuns.id, runId));
    const suspend = async (): Promise<RunStatus> => {
      await persist({ status: "waiting_approval" });
      await notifyLive(h, "run", runId);
      return "waiting_approval";
    };
    const labels = (name: string) => toolLabel(name);
    const emitStep = async (callId: string) => {
      const [row] = await h.select().from(toolCalls).where(eq(toolCalls.id, callId));
      if (!row) return;
      const target = row.kind === "delegate" ? getAgent(String((row.input as { agentId?: string } | null)?.agentId))?.name : undefined;
      emit({ k: "step", step: toStepDTO(row, run0, (t) => target ?? labels(t)) });
    };
    const emitApproval = async (approvalId: string) => {
      const [ap] = await h.select().from(approvals).where(eq(approvals.id, approvalId));
      if (!ap) return;
      try {
        emit({ k: "approval", approval: toApprovalDTO(ap) });
      } catch (err) {
        log.error({ err }, "approval DTO failed");
      }
    };
    if (run0.threadId) emit({ k: "run", run: toRunDTO(run0), threadId: run0.threadId });
    for (const step of routeSteps(run0)) emit({ k: "step", step }); // idempotent upsert client-side

    const pinnedFree = run0.routeMode === "free";
    let freeRetried = false;
    let curModel = run0.model;
    // D-09 thread-level taint: records what this run saw, whatever the opt-in; resolveModel decides if it matters.
    let tainted = run0.sawPrivate;
    const taint = async (m: unknown) => {
      if (tainted || !mentionsSensitive(m, await sensitiveRepoNames(h))) return;
      tainted = true;
      await h.update(agentRuns).set({ sawPrivate: true }).where(eq(agentRuns.id, runId));
    };
    // One-way switch (D-05). Persisting the model before the next turn keeps a resumed run on Sonnet.
    const switchToSonnet = async (kind: "fallback" | "escalated" | "private", rawReason: string): Promise<RunStatus | null> => {
      const reason = rawReason.slice(0, 200);
      const blocked = pinnedFree;
      const ev: RouteEvent = { at: now().toISOString(), kind: blocked ? "blocked" : kind, from: curModel, to: blocked ? null : MODELS.sonnet, reason, seq: toolCount + 0.5 };
      const [row] = await h
        .update(agentRuns)
        .set({ routeEvents: sql`${agentRuns.routeEvents} || ${JSON.stringify([ev])}::jsonb`, ...(blocked ? {} : { model: MODELS.sonnet }) })
        .where(eq(agentRuns.id, runId))
        .returning({ id: agentRuns.id, agentId: agentRuns.agentId, routeEvents: agentRuns.routeEvents });
      await notifyLive(h, "run", runId);
      const step = row && routeSteps(row).at(-1);
      if (step) emit({ k: "step", step });
      if (blocked) {
        const priv = kind === "private";
        return await fail(
          priv ? "private_blocked" : "free_unavailable",
          priv
            ? "This run needs private-repo data, which isn't sent to free models. Allow it in Settings → Connections or pick another model for this agent."
            : "The free model couldn't complete this run. The agent is pinned to Free only.",
        );
      }
      curModel = MODELS.sonnet;
      return null;
    };

    // Resume: the last assistant turn's tool_use blocks may still lack results (approval wait).
    const tail = messages.at(-1);
    if (tail?.role === "assistant" && Array.isArray(tail.content)) {
      const ids = tail.content.flatMap((b) => (b.type === "tool_use" ? [b.id] : []));
      if (ids.length) {
        try {
          messages.push(await buildToolResults(h, runId, ids));
          await taint(messages.at(-1));
        } catch (err) {
          if (!(err instanceof PendingToolError)) throw err;
          return await suspend();
        }
        await persist();
      }
    }

    await taint(messages);
    for (;;) {
      const [cur] = await h.select({ c: agentRuns.cancelRequestedAt }).from(agentRuns).where(eq(agentRuns.id, runId));
      if (cur?.c) return await finish({ status: "cancelled", error: "Cancelled by you" });
      if (tokens > RUN_LIMITS.tokens) return await fail("limit:tokens", "This run used too many tokens and was stopped.");
      if (active >= RUN_LIMITS.activeMs) return await fail("limit:time", "This run took too long and was stopped.");

      // D-09: before any free request is built, the whole conversation must be free of private/unknown repos.
      if (isFree(curModel) && !(await getFreePrivateOk(h)) && mentionsSensitive(messages, await sensitiveRepoNames(h))) {
        const s = await switchToSonnet("private", "private repo data");
        if (s) return s;
        continue;
      }

      const t0 = now().getTime();
      const model = curModel; // one turn is priced with exactly the model that served it (D-14)
      const addUsage = async (u: LlmUsage, m: string) => {
        const cost = costUsd(m, u).toFixed(6);
        await h
          .update(agentRuns)
          .set({
            inputTokens: sql`${agentRuns.inputTokens} + ${u.input}`,
            outputTokens: sql`${agentRuns.outputTokens} + ${u.output}`,
            cacheWriteTokens: sql`${agentRuns.cacheWriteTokens} + ${u.cacheWrite}`,
            cacheReadTokens: sql`${agentRuns.cacheReadTokens} + ${u.cacheRead}`,
            costUsd: sql`${agentRuns.costUsd} + (${cost})::numeric`,
          })
          .where(eq(agentRuns.id, runId));
        await h.insert(runTurns).values({
          runId,
          seq: sql`(select coalesce(max(seq), 0) + 1 from run_turns where run_id = ${runId})`,
          model: m,
          inputTokens: u.input,
          outputTokens: u.output,
          cacheWriteTokens: u.cacheWrite,
          cacheReadTokens: u.cacheRead,
          costUsd: cost,
        });
      };
      let streamedChars = 0;
      let turn;
      try {
        turn = await opts.llm.stream(
          {
            model,
            system: isFree(model) ? `${agent.systemPrompt} ${FREE_SUFFIX}` : agent.systemPrompt,
            messages,
            tools: isFree(model) && !pinnedFree ? [...anthropicTools, ESCALATE_TOOL] : anthropicTools,
            maxTokens: RUN_LIMITS.turnMaxTokens,
          },
          (text) => {
            streamedChars += text.length;
            emit({ k: "delta", runId, text });
          },
          opts.signal,
        );
      } catch (err) {
        // Tokens that streamed were billed even though the turn failed; estimate (~4 chars/token) so the spend cap sees them.
        if (streamedChars > 0 && !isFree(model)) {
          await addUsage({ input: Math.ceil(JSON.stringify(messages).length / 4), output: Math.ceil(streamedChars / 4), cacheWrite: 0, cacheRead: 0 }, model).catch(() => undefined);
        }
        if (opts.signal?.aborted || !isFree(model)) throw err;
        // Free turn failed (D-06/D-08): one retry on transient errors, then Sonnet.
        active += now().getTime() - t0;
        const fe = err instanceof FreeModelError ? err : null;
        if (fe?.transient && !freeRetried) {
          freeRetried = true;
          await new Promise((r) => setTimeout(r, Math.min(fe.retryAfterMs ?? 0, 5000)));
          continue;
        }
        if (fe && (fe.transient || fe.status === 429 || fe.status === 402)) markFreeUnavailable(now());
        const s = await switchToSonnet("fallback", fe ? `${fe.code}${fe.status ? " " + fe.status : ""}` : "error");
        if (s) return s;
        continue;
      }
      const u = turn.usage;
      tokens += u.input + u.output;
      await addUsage(u, model);
      if (isFree(model)) {
        // Bad free turns are dropped before they reach history (Pitfall 1); usage above is already recorded.
        const esc = pinnedFree ? null : escalateReason(turn.content);
        const bad = esc ? null : checkFreeTurn({ content: turn.content, stopReason: turn.stopReason, allowed, messages, toolCount, requiresTools: !!agent.requiresTools });
        if (esc || bad) {
          active += now().getTime() - t0;
          const s = await switchToSonnet(esc ? "escalated" : "fallback", esc ?? bad!.code);
          if (s) return s;
          continue;
        }
      }
      messages.push({ role: "assistant", content: turn.content as Msg["content"] });

      const uses = turn.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (!uses.length) {
        active += now().getTime() - t0;
        await persist();
        const answer = turn.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
        const status = await finish({ status: "completed", answer });
        if (status === "completed" && !run0.parentRunId) {
          if (run0.threadId) await appendMessage(h, run0.threadId, "assistant", answer, runId);
          await emitActivity(
            { type: "agent.run.completed", source: run0.agentId, title: "Run completed", detail: `${agent.name} · ${formatDuration(active)}` },
            undefined,
            h,
          );
        }
        return status;
      }

      await persist();
      let waiting = false;
      for (const use of uses) {
        if (toolCount >= RUN_LIMITS.toolCalls) return await fail("limit:tool_calls", "This run made too many tool calls and was stopped.");
        toolCount++;
        const res = await callTool(
          { handle: h, runId, agentId: run0.agentId, tools: allowed, now, fetch: opts.fetch, onEvent: opts.onEvent && emit, llm: opts.llm, onClaimed: emitStep },
          use.name,
          use.input,
          use.id,
        );
        const callId = res.callId;
        if (res.status === "ok" && (res.output as { status?: string } | null)?.status === "waiting_approval" && use.name === "delegate") {
          // Child suspended on an approval: this delegate call waits too.
          await h.update(toolCalls).set({ status: "waiting_approval", output: null }).where(eq(toolCalls.id, callId));
          waiting = true;
        } else if (res.status === "waiting_approval") {
          waiting = true;
          await emitApproval(res.approvalId);
        }
        if (callId) await emitStep(callId);
      }
      active += now().getTime() - t0;
      if (waiting) return await suspend();
      messages.push(await buildToolResults(h, runId, uses.map((b) => b.id)));
      await taint(messages.at(-1));
      await persist();
    }
  } catch (err) {
    log.error({ err, runId }, "agent run failed");
    return await fail("llm", "The assistant hit an error. Try again.").catch(() => "failed" as RunStatus);
  }
}

/** A child finished (or failed) after the parent suspended: close the delegate call and continue the parent. */
export async function resumeParent(h: DB, childRunId: string, opts: AdvanceOpts): Promise<RunStatus | null> {
  const [child] = await h.select().from(agentRuns).where(eq(agentRuns.id, childRunId));
  if (!child?.parentRunId || !TERMINAL.includes(child.status)) return null;
  const [parent] = await h.select({ s: agentRuns.status }).from(agentRuns).where(eq(agentRuns.id, child.parentRunId));
  if (parent?.s !== "waiting_approval") return null; // parent is still running inline; delegate() returns the result itself
  const done = child.status === "completed";
  await h
    .update(toolCalls)
    .set(
      done
        ? { status: "done", output: { status: "completed", answer: child.answer }, outputSummary: child.answer?.slice(0, 600) ?? null }
        : { status: "failed", error: child.error ?? `Agent run ${child.status}` },
    )
    .where(and(eq(toolCalls.childRunId, childRunId), eq(toolCalls.status, "waiting_approval")));
  return advance(child.parentRunId, { ...opts, handle: h });
}

export async function retryRun(
  h: DB,
  runId: string,
  opts: { enqueue?: Enqueue; now?: () => Date } = {},
): Promise<CreateRunResult | { ok: false; code: "not_retryable" }> {
  const [old] = await h.select().from(agentRuns).where(eq(agentRuns.id, runId));
  if (!old || !["failed", "cancelled", "expired"].includes(old.status)) return { ok: false, code: "not_retryable" };
  const made = await createRun(h, { agentId: old.agentId, prompt: old.prompt, threadId: old.threadId, retryOf: old.id, tier: old.tier as "simple" | "reasoning" | null, privacyAnchor: old.parentRunId ?? old.id, now: opts.now });
  if (made.ok) await (opts.enqueue ?? realEnqueue)(QUEUES.resume, { runId: made.runId }, { singletonKey: `run:${made.runId}` });
  return made;
}

/** Worker entry (plan 12): run to the next suspension with the real client, NOTIFYing per step change. */
export async function runQueued(h: DB, runId: string, opts: Partial<AdvanceOpts> = {}): Promise<RunStatus> {
  const llm = opts.llm ?? getLlm();
  if (!llm) {
    await h.update(agentRuns).set({ status: "failed", errorKind: "no_key", error: "No Anthropic API key", endedAt: new Date() }).where(eq(agentRuns.id, runId));
    await notifyLive(h, "run", runId);
    return "failed";
  }
  let last = "";
  return advance(runId, {
    ...opts,
    handle: h,
    llm,
    onEvent: (e) => {
      if (e.k !== "step" && e.k !== "done" && e.k !== "approval") return;
      const key = e.k === "step" ? `${e.step.id}:${e.step.state}` : e.k;
      if (key === last) return;
      last = key;
      void notifyLive(h, "run", runId);
    },
  });
}
