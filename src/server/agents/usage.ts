import { eq, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { agentRuns, runTurns } from "../db/schema";
import { costUsd } from "./pricing";
import type { LlmUsage } from "./types";

/** Adds one model turn's tokens and cost to a run and records its run_turns row (shared by the agent loop and mail triage). */
export async function addRunUsage(h: DB, runId: string, u: LlmUsage, model: string): Promise<void> {
  const cost = costUsd(model, u).toFixed(6);
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
    model,
    inputTokens: u.input,
    outputTokens: u.output,
    cacheWriteTokens: u.cacheWrite,
    cacheReadTokens: u.cacheRead,
    costUsd: cost,
  });
}
