import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type DB } from "../db/client";
import { agentRuns, agents, approvals, settings, socialVariants, toolCalls } from "../db/schema";
import { notifyLive } from "../events";
import { getAgent, MODELS } from "./registry";

const PAUSE_KEY = "agents.paused";
const STALE_MIN = 5;

export async function isPaused(handle: DB = db(), agentId: string): Promise<boolean> {
  const [g] = await handle.select({ v: settings.value }).from(settings).where(eq(settings.key, PAUSE_KEY));
  if (g?.v === true) return true;
  const [a] = await handle.select({ p: agents.paused }).from(agents).where(eq(agents.id, agentId));
  return a?.p === true;
}

export async function setGlobalPause(handle: DB = db(), paused: boolean): Promise<void> {
  await handle
    .insert(settings)
    .values({ key: PAUSE_KEY, value: paused })
    .onConflictDoUpdate({ target: settings.key, set: { value: paused, updatedAt: new Date() } });
}

export async function setAgentPaused(handle: DB = db(), agentId: string, paused: boolean): Promise<boolean> {
  if (!getAgent(agentId)?.live) return false;
  await handle.insert(agents).values({ id: agentId, paused }).onConflictDoUpdate({ target: agents.id, set: { paused } });
  return true;
}

export async function setAgentModel(handle: DB = db(), agentId: string, model: string): Promise<boolean> {
  const agent = getAgent(agentId);
  const routing = model === "auto" || model === "free";
  if (!agent?.live || !(routing ? agent.routable : (Object.values(MODELS) as string[]).includes(model))) return false;
  await handle.insert(agents).values({ id: agentId, model }).onConflictDoUpdate({ target: agents.id, set: { model } });
  return true;
}

export async function agentConfig(handle: DB = db(), agentId: string): Promise<{ paused: boolean; pref: string | null; model: string }> {
  const [a] = await handle.select().from(agents).where(eq(agents.id, agentId));
  return { paused: a?.paused ?? false, pref: a?.model ?? null, model: a?.model ?? getAgent(agentId)?.defaultModel ?? MODELS.sonnet };
}

export async function cancelRun(handle: DB = db(), runId: string, now: Date = new Date()): Promise<boolean> {
  const [run] = await handle.select({ status: agentRuns.status, parentRunId: agentRuns.parentRunId }).from(agentRuns).where(eq(agentRuns.id, runId));
  if (!run) return false;
  if (run.status === "running") {
    await handle.update(agentRuns).set({ cancelRequestedAt: now }).where(and(eq(agentRuns.id, runId), eq(agentRuns.status, "running")));
    await notifyLive(handle, "run", runId);
    return true;
  }
  if (run.status === "queued") {
    const r = await handle
      .update(agentRuns)
      .set({ status: "cancelled", endedAt: now })
      .where(and(eq(agentRuns.id, runId), eq(agentRuns.status, "queued")))
      .returning({ id: agentRuns.id });
    if (r.length) await notifyLive(handle, "run", runId);
    return r.length > 0;
  }
  if (run.status !== "waiting_approval") return false;

  const cancelled = await handle.transaction(async (tx) => {
    const won = await tx
      .update(agentRuns)
      .set({ status: "cancelled", endedAt: now })
      .where(and(eq(agentRuns.id, runId), eq(agentRuns.status, "waiting_approval")))
      .returning({ id: agentRuns.id });
    if (!won.length) return null;
    const candidates = await tx.select({ id: approvals.id }).from(approvals)
      .where(and(eq(approvals.runId, runId), inArray(approvals.status, ["pending", "approved", "failed"]))).for("update");
    const cancellable: string[] = [];
    for (const a of candidates) {
      const rows = await tx.select({ status: socialVariants.status }).from(socialVariants).where(eq(socialVariants.approvalId, a.id)).for("update");
      if (!rows.some((v) => v.status === "publishing")) cancellable.push(a.id);
    }
    const apprs = cancellable.length ? await tx
      .update(approvals)
      .set({ status: "cancelled", decidedAt: now })
      .where(inArray(approvals.id, cancellable))
      .returning({ id: approvals.id }) : [];
    const socials = apprs.length ? await tx.update(socialVariants).set({ status: "draft", approvalId: null, scheduledAt: null,
      approvedTextHash: null, approvedProviderMode: null, approvedConnectionGeneration: null, updatedAt: now })
      .where(and(inArray(socialVariants.approvalId, apprs.map((a) => a.id)), inArray(socialVariants.status, ["pending_approval", "scheduled"])))
      .returning({ id: socialVariants.id }) : [];
    await tx.update(toolCalls).set({ status: "cancelled" }).where(and(eq(toolCalls.runId, runId), eq(toolCalls.status, "waiting_approval")));
    const parent = run.parentRunId
      ? await tx
          .update(agentRuns)
          .set({ status: "cancelled", endedAt: now })
          .where(and(eq(agentRuns.id, run.parentRunId), eq(agentRuns.status, "waiting_approval")))
          .returning({ id: agentRuns.id })
      : [];
    return { apprs, parent, socials };
  });
  if (!cancelled) return false;
  await notifyLive(handle, "run", runId);
  for (const a of cancelled.apprs) await notifyLive(handle, "approval", a.id);
  for (const p of cancelled.parent) await notifyLive(handle, "run", p.id);
  for (const v of cancelled.socials) await notifyLive(handle, "socials", v.id);
  return true;
}

// Only status = 'running' is swept; waiting_approval runs legitimately have no heartbeat.
export async function sweepOrphans(handle: DB = db(), now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_MIN * 60_000);
  const rows = await handle
    .update(agentRuns)
    .set({ status: "failed", errorKind: "interrupted", error: "Run interrupted (worker restarted or stalled)", endedAt: now })
    .where(
      and(
        eq(agentRuns.status, "running"),
        sql`(${agentRuns.heartbeatAt} < ${cutoff} or (${agentRuns.heartbeatAt} is null and ${agentRuns.startedAt} < ${cutoff}))`,
      ),
    )
    .returning({ id: agentRuns.id });
  for (const r of rows) await notifyLive(handle, "run", r.id);
  return rows.length;
}

export async function counts(handle: DB = db()) {
  const res = await handle.execute<{ running: number; queued: number; approvals_waiting: number }>(sql`
    select
      (select count(*)::int from agent_runs where status = 'running') as running,
      (select count(*)::int from agent_runs where status = 'queued') as queued,
      (select count(*)::int from approvals where status = 'pending') as approvals_waiting`);
  const r = res.rows[0]!;
  return { running: r.running, queued: r.queued, approvalsWaiting: r.approvals_waiting };
}
