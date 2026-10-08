import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import type { RunDTO, StepDTO } from "@/lib/agent-types";
import type { DB } from "../db/client";
import { agentRuns, toolCalls } from "../db/schema";
import { getConnections } from "../github/connections";
import { toRunDTO, toStepDTO } from "./dto";
import { redact } from "./redact";
import { AGENTS, getAgent, RUN_LIMITS } from "./registry";
import { agentConfig, isPaused } from "./runs";
import { capStatus } from "./spend";
import { TOOLS, toolLabel } from "./tools";

const H = 3_600_000;
const D = 24 * H;
export type AgentStatus = "ONLINE" | "WORKING" | "READY" | "PAUSED" | "ATTENTION" | "NOT CONNECTED";

const byAgent = <T extends { agent_id: string }>(rows: T[]) => new Map(rows.map((r) => [r.agent_id, r]));
const pct = (done: number, finished: number) => (finished > 0 ? Math.round((done / finished) * 100) : null);

// isPaused ORs the global flag with the agent flag; an unregistered id has no agent row, so it isolates the global one.
const isGlobalPaused = (h: DB) => isPaused(h, "__global__");

async function runningPrompt(h: DB, agentId: string): Promise<string | null> {
  const [r] = await h
    .select({ p: agentRuns.prompt })
    .from(agentRuns)
    .where(and(eq(agentRuns.agentId, agentId), eq(agentRuns.status, "running")))
    .orderBy(desc(agentRuns.createdAt))
    .limit(1);
  return r?.p.slice(0, 140) ?? null;
}

export async function agentsOverview(h: DB, now: Date = new Date()) {
  const since24 = new Date(now.getTime() - D);
  const since7 = new Date(now.getTime() - 7 * D);
  const [latest, agg, buckets, health, hero, cap, conns, global] = await Promise.all([
    h.selectDistinctOn([agentRuns.agentId]).from(agentRuns).orderBy(agentRuns.agentId, desc(agentRuns.createdAt)),
    h.execute<{ agent_id: string; running: number; queued: number }>(sql`
      select agent_id, count(*) filter (where status = 'running')::int as running,
        count(*) filter (where status = 'queued')::int as queued
      from agent_runs where status in ('running', 'queued') group by agent_id`),
    h.execute<{ agent_id: string; ago: number; n: number }>(sql`
      select agent_id, floor(extract(epoch from (${now}::timestamptz - created_at)) / 3600)::int as ago, count(*)::int as n
      from agent_runs where created_at > ${since24} and created_at <= ${now} group by 1, 2`),
    h.execute<{ agent_id: string; done: number; finished: number }>(sql`
      select agent_id, count(*) filter (where status = 'completed')::int as done,
        count(*) filter (where status in ('completed', 'failed'))::int as finished
      from agent_runs where created_at > ${since7} group by agent_id`),
    h.execute<{ runs: number; median: number | null }>(sql`
      select count(*)::int as runs,
        (percentile_cont(0.5) within group (order by extract(epoch from (first_tool_at - started_at)) * 1000)
          filter (where first_tool_at is not null and started_at is not null))::float8 as median
      from agent_runs where parent_run_id is null and created_at > ${since24}`),
    capStatus(h, now),
    getConnections(h),
    isGlobalPaused(h),
  ]);
  const lastBy = new Map(latest.map((r) => [r.agentId, r]));
  const aggBy = byAgent(agg.rows);
  const healthBy = byAgent(health.rows);
  const tokenError = conns.some((c) => c.id === "github_read" && c.status === "error");

  const agents = await Promise.all(
    AGENTS.map(async (a) => {
      const base = { id: a.id, name: a.name, icon: a.icon, color: a.color, purpose: a.purpose, live: a.live, arrival: a.arrival };
      // Disabled agents get no stats at all, not zeros (D-13).
      if (!a.live) return { ...base, status: "NOT CONNECTED" as AgentStatus, currentTask: null, stats: null };
      const last = lastBy.get(a.id) ?? null;
      const g = aggBy.get(a.id);
      const hl = healthBy.get(a.id);
      const sparkline = Array<number>(24).fill(0);
      for (const b of buckets.rows) if (b.agent_id === a.id && b.ago >= 0 && b.ago < 24) sparkline[23 - b.ago] = b.n;
      const status: AgentStatus = (await isPaused(h, a.id))
        ? "PAUSED"
        : (g?.running ?? 0) > 0
          ? "WORKING"
          : last?.status === "failed" || (a.id === "projects" && tokenError)
            ? "ATTENTION"
            : a.id === "orchestrator"
              ? "ONLINE"
              : "READY";
      return {
        ...base,
        status,
        currentTask: status === "WORKING" ? await runningPrompt(h, a.id) : null,
        stats: { last: last ? toRunDTO(last) : null, queue: g?.queued ?? 0, health: hl ? pct(hl.done, hl.finished) : null, sparkline },
      };
    }),
  );
  const median = hero.rows[0]?.median;
  return {
    agents,
    totals: {
      live: agents.filter((a) => a.live).length,
      running: agents.filter((a) => a.status === "WORKING").length,
      attention: agents.filter((a) => a.status === "ATTENTION").length,
    },
    orchestrator: {
      runsToday: hero.rows[0]?.runs ?? 0,
      medianFirstToolMs: median == null ? null : Math.round(median),
      active: aggBy.get("orchestrator")?.running ?? 0,
      queued: aggBy.get("orchestrator")?.queued ?? 0,
    },
    spend: { mtdUsd: cap.mtdUsd, capUsd: cap.capUsd, label: `US$${cap.mtdUsd.toFixed(2)} of US$${cap.capUsd}` },
    globalPaused: global,
  };
}

export async function recentRuns(
  h: DB,
  o: { agentId?: string; cursor?: string; limit?: number; now?: Date } = {},
): Promise<{ items: RunDTO[]; nextCursor: string | null }> {
  const limit = Math.min(o.limit ?? 20, 100);
  const since = new Date((o.now ?? new Date()).getTime() - D);
  const rows = await h
    .select({ run: agentRuns, cur: sql<string>`to_char(${agentRuns.createdAt} at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` })
    .from(agentRuns)
    .where(
      and(
        gte(agentRuns.createdAt, since),
        o.agentId ? eq(agentRuns.agentId, o.agentId) : undefined,
        // ponytail: createdAt-only cursor; rows sharing a microsecond timestamp could be skipped at a page edge
        o.cursor ? sql`${agentRuns.createdAt} < ${o.cursor}::timestamptz` : undefined,
      ),
    )
    .orderBy(desc(agentRuns.createdAt))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return { items: page.map((r) => toRunDTO(r.run)), nextCursor: rows.length > limit ? page[limit - 1]!.cur : null };
}

const stepsFor = async (h: DB, run: { id: string; agentId: string }): Promise<StepDTO[]> =>
  (await h.select().from(toolCalls).where(eq(toolCalls.runId, run.id)).orderBy(asc(toolCalls.seq))).map((r) => toStepDTO(r, run, toolLabel));

export async function agentDetail(h: DB, agentId: string, now: Date = new Date()) {
  const agent = getAgent(agentId);
  if (!agent) return null;
  const [cfg, conns, [latest], queued, [hl], recent] = await Promise.all([
    agentConfig(h, agentId),
    getConnections(h),
    h.select().from(agentRuns).where(eq(agentRuns.agentId, agentId)).orderBy(desc(agentRuns.createdAt)).limit(1),
    h.select().from(agentRuns).where(and(eq(agentRuns.agentId, agentId), eq(agentRuns.status, "queued"))).orderBy(asc(agentRuns.createdAt)).limit(50),
    h
      .select({
        done: sql<number>`(count(*) filter (where status = 'completed'))::int`,
        finished: sql<number>`(count(*) filter (where status in ('completed', 'failed')))::int`,
        runs: sql<number>`count(*)::int`,
        avg: sql<number | null>`(avg(extract(epoch from (ended_at - started_at)) * 1000) filter (where ended_at is not null and started_at is not null))::float8`,
      })
      .from(agentRuns)
      .where(and(eq(agentRuns.agentId, agentId), gte(agentRuns.createdAt, new Date(now.getTime() - 7 * D)))),
    recentRuns(h, { agentId, now }),
  ]);
  const conn = (id: string) => conns.find((c) => c.id === id);
  const tools = agent.tools.map((name) => {
    const tier = TOOLS[name]?.tier ?? "READ";
    if (!name.startsWith("github.")) return { name, tier, state: "connected" as const, reason: null };
    if (name === "github.create_issue" && conn("github_write")?.status !== "connected") {
      return { name, tier, state: "unavailable" as const, reason: "issues-write token missing" };
    }
    const state = conn("github_read")?.status === "connected" ? ("connected" as const) : ("not connected" as const);
    return { name, tier, state, reason: null };
  });
  const permissions = [...new Set(tools.map((t) => t.tier))].map((tier) => ({ tier, tools: tools.filter((t) => t.tier === tier).map((t) => t.name) }));
  return {
    agent,
    config: { model: cfg.model, defaultModel: agent.defaultModel, paused: cfg.paused, limits: RUN_LIMITS },
    tools,
    permissions,
    latestRun: latest ? { run: toRunDTO(latest), steps: await stepsFor(h, latest) } : null,
    queue: queued.map(toRunDTO),
    recentRuns: recent.items,
    health: {
      success: hl ? pct(hl.done, hl.finished) : null,
      runs7d: hl?.runs ?? 0,
      avgRunMs: hl?.avg == null ? null : Math.round(hl.avg),
    },
  };
}

export async function runDetail(h: DB, runId: string) {
  const [run] = await h.select().from(agentRuns).where(eq(agentRuns.id, runId));
  if (!run) return null;
  const calls = await h.select().from(toolCalls).where(eq(toolCalls.runId, runId)).orderBy(asc(toolCalls.seq));
  return {
    run: toRunDTO(run),
    agent: getAgent(run.agentId) ?? null,
    steps: calls.map((c) => toStepDTO(c, run, toolLabel)),
    toolCalls: calls.map((c) => ({
      seq: c.seq,
      tool: c.tool,
      tier: c.tier,
      status: c.status,
      durationMs: c.durationMs,
      input: redact(c.input ?? null),
      output: redact(c.output ?? null),
    })),
  };
}
