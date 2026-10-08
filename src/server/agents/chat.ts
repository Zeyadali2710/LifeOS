import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AgentStatusDTO, ApprovalDTO, ChatBlockCode, ThreadDetailDTO, TurnDTO } from "@/lib/agent-types";
import type { DB } from "../db/client";
import { agentRuns, approvals, githubRepos, threadMessages, threads, toolCalls } from "../db/schema";
import { routeSteps, toApprovalDTO, toRunDTO, toStepDTO } from "./dto";
import { getLlm } from "./llm";
import { createRun } from "./loop";
import { getAgent } from "./registry";
import { counts, isPaused } from "./runs";
import { capStatus } from "./spend";
import { appendMessage, createThread } from "./threads";
import { toolLabel } from "./tools";

export async function assistantStatus(h: DB, now: Date = new Date()): Promise<AgentStatusDTO> {
  const [c, cap, paused, repo] = await Promise.all([
    counts(h),
    capStatus(h, now),
    isPaused(h, "orchestrator"),
    h.select({ n: githubRepos.fullName }).from(githubRepos).orderBy(sql`${githubRepos.pushedAt} desc nulls last`).limit(1),
  ]);
  const assistant = !getLlm() ? "no_key" : cap.reached ? "cap" : paused ? "paused" : c.running > 0 ? "working" : "ready";
  return { assistant, running: c.running, queued: c.queued, approvalsWaiting: c.approvalsWaiting, mtdUsd: cap.mtdUsd, capUsd: cap.capUsd, firstRepo: repo[0]?.n ?? null };
}

export type StartChatResult = { ok: true; runId: string; threadId: string } | { ok: false; code: ChatBlockCode; capUsd?: number };

/** Preflight (key, rate, pause, cap) before any thread/run row or LLM call exists. */
export async function startChat(h: DB, p: { prompt: string; threadId?: string }, now: Date = new Date()): Promise<StartChatResult> {
  if (!getLlm()) return { ok: false, code: "no_key" };
  const [recent] = await h
    .select({ n: sql<number>`count(*)::int` })
    .from(agentRuns)
    .where(and(isNull(agentRuns.parentRunId), sql`${agentRuns.createdAt} > ${new Date(now.getTime() - 60_000)}`));
  if ((recent?.n ?? 0) >= 10) return { ok: false, code: "rate_limited" };
  if (await isPaused(h, "orchestrator")) return { ok: false, code: "paused" };
  const cap = await capStatus(h, now);
  if (cap.reached) return { ok: false, code: "cap", capUsd: cap.capUsd };
  const threadId = p.threadId ?? (await createThread(h, p.prompt));
  const made = await createRun(h, { agentId: "orchestrator", prompt: p.prompt, threadId, now: () => now });
  if (!made.ok) return { ok: false, code: made.code === "cap" ? "cap" : "paused", capUsd: made.capUsd };
  // Appended only once the run exists, so a refused request doesn't leave a duplicate prompt behind on retry.
  await appendMessage(h, threadId, "user", p.prompt);
  return { ok: true, runId: made.runId, threadId };
}

export async function threadDetail(h: DB, id: string): Promise<ThreadDetailDTO | null> {
  const [t] = await h.select().from(threads).where(eq(threads.id, id));
  if (!t) return null;
  const [m] = await h.select({ n: sql<number>`count(*)::int` }).from(threadMessages).where(eq(threadMessages.threadId, id));
  const all = await h.select().from(agentRuns).where(eq(agentRuns.threadId, id)).orderBy(asc(agentRuns.createdAt));
  const tops = all.filter((r) => !r.parentRunId);
  const kids = tops.length ? await h.select().from(agentRuns).where(inArray(agentRuns.parentRunId, tops.map((r) => r.id))) : [];
  const byId = new Map([...tops, ...kids].map((r) => [r.id, r]));
  const ids = [...byId.keys()];
  const calls = ids.length ? await h.select().from(toolCalls).where(inArray(toolCalls.runId, ids)).orderBy(asc(toolCalls.createdAt), asc(toolCalls.seq)) : [];
  const aps = ids.length ? await h.select().from(approvals).where(inArray(approvals.runId, ids)).orderBy(desc(approvals.createdAt)) : [];
  const turns: TurnDTO[] = tops.map((r) => {
    const family = new Set([r.id, ...kids.filter((k) => k.parentRunId === r.id).map((k) => k.id)]);
    const toolSteps = calls
      .filter((c) => family.has(c.runId))
      .map((c) => {
        const target = c.kind === "delegate" ? getAgent(String((c.input as { agentId?: string } | null)?.agentId))?.name : undefined;
        return toStepDTO(c, byId.get(c.runId)!, (x) => target ?? toolLabel(x));
      });
    const steps = [...toolSteps, ...[...family].flatMap((id) => routeSteps(byId.get(id)!))];
    const approvalDtos: ApprovalDTO[] = aps.filter((a) => family.has(a.runId)).map((a) => toApprovalDTO(a));
    return { id: r.id, prompt: r.prompt, at: r.createdAt.toISOString(), run: toRunDTO(r), steps, approvals: approvalDtos };
  });
  return { thread: { id: t.id, title: t.title, updatedAt: t.updatedAt.toISOString(), messageCount: m?.n ?? 0 }, turns };
}
