// Owner-configured automation actions. Only the non-LLM `automations` agent holds these tools; the engine calls them
// through the gateway with deterministic tool-use ids, so a re-executed run returns earlier results instead of repeating.
import { z } from "zod";
import { addDays, sydneyYmd } from "@/lib/project-rules";
import { emitActivity } from "../../events";
import { enqueue, QUEUES } from "../../queue";
import { createTask } from "../../tasks";
import { createRun } from "../loop";
import { ToolError, type Tool } from "../types";

const out = z.record(z.string(), z.unknown());

const notify: Tool<{ title: string; body: string; priority: "FYI" | "IMPORTANT" }, Record<string, unknown>> = {
  name: "automation.notify",
  label: "Sending a notification",
  description: "Owner-configured automation action: post a LifeOS notification.",
  input: z.object({ title: z.string().min(1).max(120), body: z.string().max(500).default(""), priority: z.enum(["FYI", "IMPORTANT"]).default("FYI") }),
  output: out, tier: "EXECUTE", sideEffect: true,
  async handler(i, ctx) {
    const r = await emitActivity(
      { type: "automation.notified", source: "automation", title: i.title, detail: i.body },
      { category: i.priority, title: i.title, body: i.body || undefined, actionUrl: "/automations" },
      ctx.handle,
    );
    if (!r) throw new ToolError("unavailable", "The notification could not be saved.");
    return { notificationId: r.notificationId };
  },
};

const createTaskTool: Tool<{ title: string; dueInDays: number | null; priority: 1 | 2 | 3 | null }, Record<string, unknown>> = {
  name: "automation.create_task",
  label: "Creating a task",
  description: "Owner-configured automation action: add a task to Organization.",
  input: z.object({ title: z.string().min(1).max(200), dueInDays: z.number().int().min(0).max(365).nullable().default(null), priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable().default(null) }),
  output: out, tier: "EXECUTE", sideEffect: true,
  async handler(i, ctx) {
    const now = ctx.now();
    const r = await createTask(ctx.handle, { title: i.title, priority: i.priority, dueDate: i.dueInDays === null ? null : addDays(sydneyYmd(now), i.dueInDays) }, now);
    if (!r.ok) throw new ToolError("invalid_input", Object.values(r.errors)[0] ?? "The task could not be created.");
    return { taskId: r.task.id, title: r.task.title, dueDate: r.task.dueDate };
  },
};

const askAgent: Tool<{ prompt: string }, Record<string, unknown>> = {
  name: "automation.ask_agent",
  label: "Asking LifeOS",
  description: "Owner-configured automation action: start an unattended orchestrator run. Its side effects always wait for owner approval.",
  input: z.object({ prompt: z.string().min(1).max(2000) }),
  output: out, tier: "EXECUTE", sideEffect: true,
  async handler(i, ctx) {
    const r = await createRun(ctx.handle, { agentId: "orchestrator", prompt: i.prompt, origin: "automation", now: ctx.now });
    if (!r.ok) throw new ToolError("unavailable", r.code === "cap" ? "The monthly AI spend cap is reached." : r.code === "paused" ? "The orchestrator is paused." : "LifeOS couldn't start the run.");
    await enqueue(QUEUES.resume, { runId: r.runId });
    return { runId: r.runId, link: `/agents/runs/${r.runId}` };
  },
};

export const automationTools = { [notify.name]: notify, [createTaskTool.name]: createTaskTool, [askAgent.name]: askAgent };
