import { sql, type SQL } from "drizzle-orm";
import type { ToolTier } from "@/lib/agent-types";

/** HIGH_RISK is a floor nothing lowers; otherwise the override wins (and may raise to HIGH_RISK). */
export function resolvePolicy(defaultTier: ToolTier, override: ToolTier | null | undefined): ToolTier {
  if (defaultTier === "HIGH_RISK") return "HIGH_RISK";
  return override ?? defaultTier;
}

/** Tools that return third-party text (repo files, PR bodies, issue titles): untrusted for the D-06 floor and the draft banner. */
export const CONTENT_TOOLS = ["github.get_file", "github.list_tree"] as const;

/**
 * Run ids whose content reads count for `runId`: its orchestrator tree (self, parent, siblings, children), the run it
 * retries (and that run's parent), and every run (plus children) in those runs' threads. Same reach as the D-09 privacy
 * taint, because content flows on through the thread history and retries.
 */
export const contentScope = (runId: string): SQL => sql`(
  with me as (select id, parent_run_id, retry_of from agent_runs where id = ${runId}),
  anchors as (
    select id from me union select parent_run_id from me union select retry_of from me
    union select o.parent_run_id from agent_runs o, me where o.id = me.retry_of
  ),
  roots as (
    select id from anchors
    union select r.id from agent_runs r where r.thread_id in (select thread_id from agent_runs where id in (select id from anchors))
  )
  select id from roots where id is not null
  union select r.id from agent_runs r where r.parent_run_id in (select id from roots)
)`;

/** Repo content can only ever produce a proposal the owner reviews (D-06): once content was read, side-effect tools need >= APPROVE. */
export function withContentFloor(tier: ToolTier, sideEffect: boolean, sawContent: boolean): ToolTier {
  return sideEffect && sawContent && (tier === "READ" || tier === "PREPARE" || tier === "EXECUTE") ? "APPROVE" : tier;
}
