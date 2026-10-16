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
  "outreach.list_events", "outreach.get_event", "mail.list", "mail.get_message", "mail.send_reply", // D-19, D-29: events and mail are third-party text too
  "socials.get_post", "socials.list_posts", // posts may contain copied repo or event content
  "finance.overview", "finance.list_merchants", "finance.list_transactions", "finance.update",
  "knowledge.search", "knowledge.get", // saved notes can quote third-party text
] as const;

/** D-28: mail is always private. Once any of these ran in a run's content scope, no run in that scope may use a free model. */
export const MAIL_TOOLS = ["mail.list", "mail.get_message", "mail.send_reply"] as const;
export const FINANCE_TOOLS = ["finance.overview", "finance.list_merchants", "finance.list_transactions", "finance.update"] as const;
export const KNOWLEDGE_TOOLS = ["knowledge.search", "knowledge.get"] as const;
/** Agents whose own data is always private: their runs never use a free model, whatever the private-data opt-in says. */
export const HARD_PRIVATE_AGENTS: readonly string[] = ["finance", "knowledge"];
const HARD_PRIVATE_TOOLS = [...MAIL_TOOLS, ...FINANCE_TOOLS, ...KNOWLEDGE_TOOLS];

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

/**
 * True when the run's ancestry (parent and retry chain, up to the root) starts from an automation. That origin is set
 * only by the automation engine, never by model input, so it is a trusted signal for the unattended-run floor.
 */
export async function automationOrigin(h: DB, runId: string | null): Promise<boolean> {
  if (!runId) return false;
  const r = await h.execute<{ hit: boolean }>(sql`
    with recursive up(id, parent, retry, origin, depth) as (
      select id, parent_run_id, retry_of, origin, 0 from agent_runs where id = ${runId}
      union all
      select a.id, a.parent_run_id, a.retry_of, a.origin, up.depth + 1 from agent_runs a join up on a.id = coalesce(up.parent, up.retry) where up.depth < 20
    )
    select exists(select 1 from up where origin = 'automation') as hit`);
  return Boolean(r.rows[0]?.hit);
}

/** Unattended runs: any side effect needs an owner approval, whatever the tool's tier or a permission override says. */
export function withUnattendedFloor(tier: ToolTier, sideEffect: boolean, unattended: boolean): ToolTier {
  return unattended && sideEffect && (tier === "READ" || tier === "PREPARE" || tier === "EXECUTE") ? "APPROVE" : tier;
}

/** Mail, financial and knowledge data always stay off free models, including sibling/retry/thread history. */
export async function hardPrivateInScope(h: DB, runId: string | null): Promise<boolean> {
  if (!runId) return false;
  const [hit] = await h
    .select({ id: toolCalls.id })
    .from(toolCalls)
    .where(sql`${inArray(toolCalls.tool, HARD_PRIVATE_TOOLS)} and ${toolCalls.runId} in ${contentScope(runId)}`)
    .limit(1);
  // Unattended automation runs may carry event text (e.g. email subjects) in their prompt: treat them as hard-private too.
  return Boolean(hit) || (await automationOrigin(h, runId));
}
