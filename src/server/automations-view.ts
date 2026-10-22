import { inArray } from "drizzle-orm";
import { loadAutomations } from "./automations";
import type { DB } from "./db/client";
import { agentRuns } from "./db/schema";

/** The automation step can finish while its linked agent still waits for approval. */
export async function loadAutomationsView(h: DB) {
  const data = await loadAutomations(h);
  const ids = [...new Set(data.automations.flatMap((a) => a.runs.flatMap((r) => r.agentRunId ? [r.agentRunId] : [])))];
  const agents = ids.length ? await h.select({ id: agentRuns.id, status: agentRuns.status }).from(agentRuns).where(inArray(agentRuns.id, ids)) : [];
  return { ...data, automations: data.automations.map((a) => ({ ...a, runs: a.runs.map((r) => ({ ...r, agentStatus: agents.find((agent) => agent.id === r.agentRunId)?.status ?? null })) })) };
}
export type AutomationsViewData = Awaited<ReturnType<typeof loadAutomationsView>>;
