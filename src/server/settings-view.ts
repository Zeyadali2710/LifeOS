import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { DB } from "./db/client";
import { agentRuns, runTurns } from "./db/schema";
import { sydneyMonthBounds } from "./agents/pricing";

/** Read alongside spendByModel so Settings can show the prototype's turn counts. */
export async function settingsModelTurns(handle: DB, now: Date) {
  const { start, end } = sydneyMonthBounds(now);
  return handle
    .select({ model: runTurns.model, turns: sql<number>`count(*)::int` })
    .from(runTurns)
    .innerJoin(agentRuns, eq(runTurns.runId, agentRuns.id))
    .where(and(gte(agentRuns.startedAt, start), lt(agentRuns.startedAt, end)))
    .groupBy(runTurns.model);
}
