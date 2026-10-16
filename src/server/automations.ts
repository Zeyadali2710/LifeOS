import { and, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { fill, matches, MAX_RUNS_PER_DAY, scheduleRef, type Action, type Condition, type TriggerEventData } from "@/lib/automations";
import { callTool } from "./agents/gateway";
import { isPaused } from "./agents/runs";
import { TOOLS } from "./agents/tools";
import type { DB } from "./db/client";
import { activityEvents, agentRuns, automationRuns, automations } from "./db/schema";
import { notifyLive } from "./events";
import { log } from "./log";
import { sydneyParts } from "./time";

type Automation = typeof automations.$inferSelect;
const FIELD = { title: sql`${activityEvents.title}`, source: sql`${activityEvents.source}`, detail: sql`coalesce(${activityEvents.payload}->>'detail', '')` };
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
/** SQL form of `matches` (case-insensitive contains/equals); values are bound parameters. */
const conditionSql = (c: Condition) =>
  c.op === "equals" ? sql`lower(${FIELD[c.field]}) = lower(${c.value})` : sql`${FIELD[c.field]} ilike ${`%${likeEscape(c.value)}%`}`;
const EVENT_WINDOW_MS = 60 * 60_000;
const STALE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 3;

const ACTION_TOOL: Record<Action["type"], string> = { notify: "automation.notify", create_task: "automation.create_task", ask_agent: "automation.ask_agent" };
function toolInput(a: Action, e: TriggerEventData | null): Record<string, unknown> {
  if (a.type === "notify") return { title: fill(a.title, e).slice(0, 120), body: fill(a.body, e).slice(0, 500), priority: a.priority };
  if (a.type === "create_task") return { title: fill(a.title, e).slice(0, 200), dueInDays: a.dueInDays, priority: a.priority };
  return { prompt: fill(a.prompt, e).slice(0, 2000) };
}

/**
 * Atomically claims one trigger for an automation. Returns the new run, or null when this trigger was already claimed.
 * The per-automation advisory lock makes the 24-hour rate limit exact across concurrent workers.
 */
export async function claim(h: DB, a: Automation, triggerRef: string, event: TriggerEventData | null, now: Date) {
  return h.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lifeos.automation:${a.id}`}))`);
    const [recent] = await tx.select({ n: sql<number>`count(*)::int` }).from(automationRuns)
      .where(and(eq(automationRuns.automationId, a.id), ne(automationRuns.status, "skipped"), gte(automationRuns.createdAt, new Date(now.getTime() - 86_400_000))));
    const limited = (recent?.n ?? 0) >= MAX_RUNS_PER_DAY;
    const [run] = await tx.insert(automationRuns)
      // The first result entry snapshots the trigger event and the actions as claimed, so recovery after an edit replays the same work.
      .values({ automationId: a.id, triggerRef, status: limited ? "skipped" : "running", error: limited ? `Rate limit: more than ${MAX_RUNS_PER_DAY} runs in 24 hours.` : null, result: [{ event, actions: a.actions }] })
      .onConflictDoNothing().returning();
    if (!run || limited) return null;
    // The engine's own agent run, so every action is a gateway tool call with a trace in Command Centre.
    const [agentRun] = await tx.insert(agentRuns).values({ agentId: "automations", prompt: `Automation: ${a.name}`, model: "automation", origin: "automation", status: "running", startedAt: now }).returning({ id: agentRuns.id });
    await tx.update(automationRuns).set({ agentRunId: agentRun!.id }).where(eq(automationRuns.id, run.id));
    return { ...run, agentRunId: agentRun!.id };
  });
}

/** Executes (or re-executes) a claimed run's actions. Tool-use ids are deterministic, so repeats return earlier results. */
export async function execute(h: DB, runId: string, now: () => Date = () => new Date()): Promise<"done" | "failed"> {
  const [row] = await h.select({ run: automationRuns, a: automations }).from(automationRuns).innerJoin(automations, eq(automations.id, automationRuns.automationId)).where(eq(automationRuns.id, runId));
  if (!row?.run.agentRunId) return "failed";
  const snapshot = ((row.run.result ?? []) as { event?: TriggerEventData | null; actions?: Action[] }[])[0] ?? {};
  const event = snapshot.event ?? null, actions = snapshot.actions ?? row.a.actions;
  const results: unknown[] = [{ event, actions }];
  let error: string | null = null;
  for (const [i, action] of actions.entries()) {
    const r = await callTool({ handle: h, runId: row.run.agentRunId, agentId: "automations", tools: TOOLS, now }, ACTION_TOOL[action.type], toolInput(action, event), `a${runId}:${i}`);
    if (r.status === "ok") results.push({ action: action.type, output: r.output });
    else { error = `${action.type}: ${r.status === "error" ? r.error : r.status}`; results.push({ action: action.type, error }); break; }
  }
  const status = error ? "failed" : "done";
  await h.update(automationRuns).set({ status, result: results, error, updatedAt: now() }).where(eq(automationRuns.id, runId));
  await h.update(agentRuns).set({ status: error ? "failed" : "completed", error, errorKind: error ? "automation" : null, answer: error ? null : `Ran ${actions.length} action${actions.length === 1 ? "" : "s"}.`, endedAt: now() }).where(eq(agentRuns.id, row.run.agentRunId));
  await notifyLive(h, "run", row.run.agentRunId);
  return status;
}

/** Worker tick (every minute): event triggers, due schedules, then recovery of runs a crashed worker left behind. */
export async function runAutomations(h: DB, now: Date): Promise<{ started: number; recovered: number }> {
  if (await isPaused(h, "automations")) return { started: 0, recovered: 0 };
  const list = await h.select().from(automations).where(eq(automations.enabled, true));
  const p = sydneyParts(now);
  const local = { ymd: `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`, hm: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`, weekday: p.weekday };
  let started = 0;
  for (const a of list) {
    try {
      const claims: { ref: string; event: TriggerEventData | null }[] = [];
      if (a.trigger.type === "schedule") {
        const ref = scheduleRef(a.trigger, local);
        if (ref) claims.push({ ref, event: null });
      } else {
        const since = new Date(Math.max(a.enabledAt.getTime(), now.getTime() - EVENT_WINDOW_MS));
        // Conditions and "not claimed yet" run in SQL, so a burst of non-matching or handled events can't hide later ones.
        const events = await h.select({ id: activityEvents.id, type: activityEvents.type, title: activityEvents.title, source: activityEvents.source, payload: activityEvents.payload }).from(activityEvents)
          .where(and(eq(activityEvents.type, a.trigger.eventType), gte(activityEvents.occurredAt, since), ne(activityEvents.source, "automation"),
            ...a.conditions.map(conditionSql),
            sql`not exists (select 1 from automation_runs r where r.automation_id = ${a.id} and r.trigger_ref = 'event:' || ${activityEvents.id})`))
          .orderBy(activityEvents.occurredAt).limit(50);
        for (const e of events) {
          const data: TriggerEventData = { id: e.id, type: e.type, title: e.title, source: e.source, detail: String((e.payload as { detail?: unknown } | null)?.detail ?? "") };
          if (matches(a.conditions, data)) claims.push({ ref: `event:${e.id}`, event: data });
        }
      }
      for (const c of claims) {
        const run = await claim(h, a, c.ref, c.event, now);
        if (run) { started++; await execute(h, run.id); }
      }
    } catch (err) {
      log.error({ err, automationId: a.id }, "automation evaluation failed; other automations continue");
    }
  }
  // Recovery: a run still "running" after STALE_MS was interrupted mid-way; re-execute it (idempotent) a bounded number of times.
  let recovered = 0;
  const stale = await h.select({ id: automationRuns.id, attempts: automationRuns.attempts }).from(automationRuns)
    .where(and(eq(automationRuns.status, "running"), lt(automationRuns.updatedAt, new Date(now.getTime() - STALE_MS)))).limit(20);
  for (const s of stale) {
    if (s.attempts >= MAX_ATTEMPTS) {
      await h.update(automationRuns).set({ status: "failed", error: "Interrupted too many times.", updatedAt: now }).where(eq(automationRuns.id, s.id));
      continue;
    }
    const [bumped] = await h.update(automationRuns).set({ attempts: s.attempts + 1, updatedAt: now })
      .where(and(eq(automationRuns.id, s.id), eq(automationRuns.attempts, s.attempts), eq(automationRuns.status, "running"))).returning({ id: automationRuns.id });
    if (bumped) { recovered++; await execute(h, s.id).catch((err) => log.error({ err, runId: s.id }, "automation recovery failed")); }
  }
  return { started, recovered };
}

export async function loadAutomations(h: DB) {
  const list = await h.select().from(automations).orderBy(desc(automations.createdAt));
  const ids = list.map((a) => a.id);
  const runs = ids.length
    ? await h.select({ id: automationRuns.id, automationId: automationRuns.automationId, status: automationRuns.status, error: automationRuns.error, agentRunId: automationRuns.agentRunId, triggerRef: automationRuns.triggerRef, createdAt: automationRuns.createdAt })
        .from(automationRuns).where(inArray(automationRuns.automationId, ids)).orderBy(desc(automationRuns.createdAt)).limit(200)
    : [];
  return {
    paused: await isPaused(h, "automations"),
    automations: list.map((a) => ({
      id: a.id, name: a.name, enabled: a.enabled, trigger: a.trigger, conditions: a.conditions, actions: a.actions,
      runs: runs.filter((r) => r.automationId === a.id).slice(0, 5).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    })),
  };
}
export type AutomationsData = Awaited<ReturnType<typeof loadAutomations>>;
