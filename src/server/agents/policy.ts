import { inArray, sql, type SQL } from "drizzle-orm";
import type { ToolTier } from "@/lib/agent-types";
import type { DB } from "../db/client";
import { toolCalls } from "../db/schema";

/** HIGH_RISK is a floor nothing lowers; otherwise the override wins (and may raise to HIGH_RISK). */
export function resolvePolicy(defaultTier: ToolTier, override: ToolTier | null | undefined): ToolTier {
  if (defaultTier === "HIGH_RISK") return "HIGH_RISK";
  return override ?? defaultTier;
}

/** Tools that return third-party text (repo files, PR bodies, issue titles): untrusted for the D-06 floor and the draft banner. */
export const CONTENT_TOOLS = [
  "github.get_file", "github.list_tree", "github.get_pull_request", "github.list_issues", "github.list_pull_requests", "github.recent_commits",
  "outreach.list_events", "outreach.get_event", "mail.list", "mail.get_message", // D-19, D-29: events and mail are third-party text too
] as const;

/** D-28: mail is always private. Once any of these ran in a run's content scope, no run in that scope may use a free model. */
export const MAIL_TOOLS = ["mail.list", "mail.get_message", "mail.send_reply"] as const;

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

/** Hard mail taint (Pitfall 1): deliberately ignores ai.free_private_ok. Same reach as the content floor. */
export async function mailInScope(h: DB, runId: string | null): Promise<boolean> {
  if (!runId) return false;
  const [hit] = await h
    .select({ id: toolCalls.id })
    .from(toolCalls)
    .where(sql`${inArray(toolCalls.tool, [...MAIL_TOOLS])} and ${toolCalls.runId} in ${contentScope(runId)}`)
    .limit(1);
  return Boolean(hit);
}
