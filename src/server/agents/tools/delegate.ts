import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { toolCalls, agentRuns } from "../../db/schema";
import { advance, createRun } from "../loop";
import { AGENTS } from "../registry";
import { ToolError, type Tool } from "../types";

// Only live non-orchestrator agents; the orchestrator alone lists this tool, so depth is one level (D-13).
const ids = AGENTS.filter((a) => a.live && a.id !== "orchestrator").map((a) => a.id) as [string, ...string[]];

const out = z.object({ status: z.string(), answer: z.string().nullable(), childRunId: z.string().optional() });

export const delegateTool: Tool<{ agentId: string; task: string; tier: "simple" | "reasoning"; tierReason?: string }, z.infer<typeof out>> = {
  name: "delegate",
  label: "Delegating",
  description:
    "Hand a task to another agent (for example the projects agent for GitHub questions) and get its answer. Set tier: simple for lookups/listing/summaries, reasoning otherwise.",
  input: z.object({
    agentId: z.enum(ids),
    task: z.string().min(1).max(2000),
    tier: z.enum(["simple", "reasoning"]).default("reasoning"),
    tierReason: z.string().max(200).optional(),
  }),
  output: out,
  tier: "READ",
  sideEffect: false,
  async handler({ agentId, task, tier, tierReason }, ctx) {
    if (!ctx.llm) throw new ToolError("unavailable", "The assistant isn't available.");
    const made = await createRun(ctx.handle, { agentId, prompt: task, threadId: null, parentRunId: ctx.runId, tier, tierReason, now: ctx.now });
    if (!made.ok && made.code === "private_blocked")
      throw new ToolError("unavailable", "This agent is pinned to Free only and this conversation includes private-repo data, which isn't sent to free models.");
    if (!made.ok) throw new ToolError(made.code === "paused" ? "paused" : "unavailable", made.code === "paused" ? "Paused by you" : "Agent unavailable");
    await ctx.handle
      .update(toolCalls)
      .set({ childRunId: made.runId })
      .where(and(eq(toolCalls.runId, ctx.runId), eq(toolCalls.toolUseId, ctx.toolUseId)));
    const status = await advance(made.runId, {
      handle: ctx.handle,
      llm: ctx.llm,
      onEvent: ctx.onEvent,
      now: ctx.now,
      fetch: ctx.fetch,
    });
    if (status === "waiting_approval") return { status, answer: null, childRunId: made.runId };
    const [child] = await ctx.handle.select({ answer: agentRuns.answer, error: agentRuns.error }).from(agentRuns).where(eq(agentRuns.id, made.runId));
    return { status, answer: child?.answer ?? child?.error ?? null };
  },
};
