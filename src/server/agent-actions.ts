"use server";

import { z } from "zod";
import { audit } from "./audit";
import { db } from "./db/client";
import { retryRun } from "./agents/loop";
import { AGENTS, MODELS } from "./agents/registry";
import { cancelRun, setAgentModel, setAgentPaused, setGlobalPause } from "./agents/runs";
import { log } from "./log";
import { requireOwner } from "./session";

type Result = Promise<{ ok: boolean; code?: string; runId?: string }>;
const agentId = z.enum(AGENTS.map((a) => a.id) as [string, ...string[]]);
const runId = z.uuid();
const model = z.enum(Object.values(MODELS) as [string, ...string[]]);

async function guarded(action: string, target: string | null, fn: () => Promise<Awaited<Result>>, metadata?: Record<string, unknown>): Result {
  try {
    const res = await fn();
    if (res.ok) await audit({ actor: "owner", action, target, metadata });
    return res;
  } catch (err) {
    log.error({ err, action }, "agent action failed");
    return { ok: false };
  }
}

export async function pauseAllAction(): Result {
  await requireOwner();
  return guarded("agents.pause_all", null, async () => (await setGlobalPause(db(), true), { ok: true }));
}

export async function resumeAllAction(): Result {
  await requireOwner();
  return guarded("agents.resume_all", null, async () => (await setGlobalPause(db(), false), { ok: true }));
}

export async function pauseAgentAction(raw: string): Result {
  await requireOwner();
  const p = agentId.safeParse(raw);
  if (!p.success) return { ok: false };
  return guarded("agents.pause", p.data, async () => ({ ok: await setAgentPaused(db(), p.data, true) }));
}

export async function resumeAgentAction(raw: string): Result {
  await requireOwner();
  const p = agentId.safeParse(raw);
  if (!p.success) return { ok: false };
  return guarded("agents.resume", p.data, async () => ({ ok: await setAgentPaused(db(), p.data, false) }));
}

export async function cancelRunAction(raw: string): Result {
  await requireOwner();
  const p = runId.safeParse(raw);
  if (!p.success) return { ok: false };
  return guarded("run.cancel", p.data, async () => ({ ok: await cancelRun(db(), p.data) }));
}

export async function retryRunAction(raw: string): Result {
  await requireOwner();
  const p = runId.safeParse(raw);
  if (!p.success) return { ok: false };
  return guarded("run.retry", p.data, async () => {
    const r = await retryRun(db(), p.data);
    return r.ok ? { ok: true, runId: r.runId } : { ok: false, code: r.code };
  });
}

export async function setAgentModelAction(rawAgent: string, rawModel: string): Result {
  await requireOwner();
  const p = z.tuple([agentId, model]).safeParse([rawAgent, rawModel]);
  if (!p.success) return { ok: false };
  return guarded("agent.model", p.data[0], async () => ({ ok: await setAgentModel(db(), p.data[0], p.data[1]) }), { model: p.data[1] });
}
