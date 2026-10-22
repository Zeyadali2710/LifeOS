import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { linkedRunState } from "@/features/automations/model";
import { loadAutomations } from "./automations";
import type { DB } from "./db/client";
import { agentRuns, toolCalls } from "./db/schema";

/** The automation step can finish while its linked agent still waits for approval. */
export async function loadAutomationsView(h: DB) {
  const data = await loadAutomations(h);
  const ids = [...new Set(data.automations.flatMap((a) => a.runs.flatMap((r) => r.agentRunId ? [r.agentRunId] : [])))];
  const calls = ids.length ? await h.select({ runId: toolCalls.runId, output: toolCalls.output }).from(toolCalls).where(and(inArray(toolCalls.runId, ids), eq(toolCalls.tool, "automation.ask_agent"))) : [];
  const children = calls.flatMap((call) => {
    const output = z.object({ runId: z.uuid() }).safeParse(call.output);
    return output.success ? [{ parentId: call.runId, id: output.data.runId }] : [];
  });
  const allIds = [...new Set([...ids, ...children.map((c) => c.id)])];
  const agents = allIds.length ? await h.select({ id: agentRuns.id, status: agentRuns.status }).from(agentRuns).where(inArray(agentRuns.id, allIds)) : [];
  return { ...data, automations: data.automations.map((a) => ({ ...a, runs: a.runs.map((r) => {
    const linked = linkedRunState(children.filter((c) => c.parentId === r.agentRunId).flatMap((c) => agents.filter((agent) => agent.id === c.id)));
    return { ...r, agentStatus: linked?.status ?? agents.find((agent) => agent.id === r.agentRunId)?.status ?? null, agentRunId: linked?.id ?? r.agentRunId };
  }) })) };
}
export type AutomationsViewData = Awaited<ReturnType<typeof loadAutomationsView>>;
