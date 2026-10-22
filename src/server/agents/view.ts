// Agents screen read model (server only): per-agent table figures, inspector and run trace.
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { ApprovalDTO, RunDTO, StepDTO, ToolTier } from "@/lib/agent-types";
import type { DB } from "../db/client";
import { agentRuns } from "../db/schema";
import { listApprovals } from "./approvals";
import { toRunDTO } from "./dto";
import { agentDetail, runDetail } from "./queries";
import { getAgent, modelLabel } from "./registry";
import { TOOLS } from "./tools";

const D = 86_400_000;

export type AgentRow = { id: string; runs24: number; cost24: number };

/** Runs and spend per agent over the last 24 h (Table view). */
export async function agentTable(h: DB, now: Date): Promise<AgentRow[]> {
  const rows = await h
    .select({ id: agentRuns.agentId, runs24: sql<number>`count(*)::int`, cost24: sql<number>`coalesce(sum(${agentRuns.costUsd}), 0)::float8` })
    .from(agentRuns)
    .where(gte(agentRuns.createdAt, new Date(now.getTime() - D)))
    .groupBy(agentRuns.agentId);
  return rows;
}

export type Inspector = {
  id: string;
  name: string;
  purpose: string;
  model: string;
  modelPref: string;
  routable: boolean;
  system: boolean;
  paused: boolean;
  tools: { name: string; tier: ToolTier; state: string; reason: string | null }[];
  latest: { run: RunDTO; steps: StepDTO[] } | null;
  recent: RunDTO[];
  pending: ApprovalDTO | null;
};

/** Everything the inspector shows for one agent. Never includes the system prompt. */
export async function agentInspector(h: DB, id: string, now = new Date()): Promise<Inspector | null> {
  const [d, pending] = await Promise.all([agentDetail(h, id, now), listApprovals(h, "pending")]);
  if (!d) return null;
  return {
    id: d.agent.id,
    name: d.agent.name,
    purpose: d.agent.purpose,
    model: d.agent.system ? "No model" : modelLabel(d.config.model),
    modelPref: d.config.model,
    routable: d.config.routable,
    system: !!d.agent.system,
    paused: d.config.paused,
    tools: d.tools.map((t) => ({ name: t.name, tier: (TOOLS[t.name]?.tier ?? t.tier) as ToolTier, state: t.state, reason: t.reason })),
    latest: d.latestRun,
    recent: d.recentRuns.slice(0, 4),
    pending: pending.find((a) => a.agentId === id) ?? null,
  };
}

export type RunTrace = NonNullable<Awaited<ReturnType<typeof runDetail>>> & { agentName: string };

export async function runTrace(h: DB, id: string): Promise<RunTrace | null> {
  const d = await runDetail(h, id);
  if (!d) return null;
  return { ...d, agent: null, agentName: getAgent(d.run.agentId)?.name ?? d.run.agentId };
}

/** The latest failed run per agent (for the failure block). */
export async function lastFailed(h: DB, agentId: string): Promise<RunDTO | null> {
  const [r] = await h.select().from(agentRuns).where(and(eq(agentRuns.agentId, agentId), eq(agentRuns.status, "failed"))).orderBy(desc(agentRuns.createdAt)).limit(1);
  return r ? toRunDTO(r) : null;
}
