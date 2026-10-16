import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callTool } from "@/server/agents/gateway";
import { createRun } from "@/server/agents/loop";
import { automationOrigin, hardPrivateInScope, withUnattendedFloor } from "@/server/agents/policy";
import { TOOLS } from "@/server/agents/tools";
import { activityEvents, agentRuns, agents, approvals, automationRuns, automations, notifications, permissions, settings, tasks, toolCalls } from "@/server/db/schema";
import { claim, execute, runAutomations } from "@/server/automations";
import { emitActivity } from "@/server/events";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const allowed = vi.hoisted(() => ({ owner: true }));
const enqueued = vi.hoisted(() => [] as unknown[]);
vi.mock("@/server/session", () => ({ requireOwner: async () => { if (!allowed.owner) throw new Error("Not owner"); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/env", () => ({ env: () => ({ LIFEOS_MASTER_KEY: Buffer.alloc(32, 7).toString("base64") }) }));
vi.mock("@/server/queue", async (orig) => ({ ...(await orig<object>()), enqueue: async (_n: string, d: unknown) => { enqueued.push(d); } }));
vi.mock("@/server/db/client", async (orig) => ({ ...(await orig<object>()), db: () => t.handle() }));
import { deleteAutomationAction, saveAutomationAction, setAutomationEnabledAction } from "@/server/automation-actions";

const h = () => t.handle();
const ok = async (p: Promise<{ ok: boolean; id?: string; error?: string }>) => { const r = await p; if (!r.ok) throw new Error(r.error); return r.id!; };
const ciRule = (extra: object = {}) => ({
  name: "CI watcher", trigger: { type: "event", eventType: "github.ci.failed" }, conditions: [{ field: "title", op: "contains", value: "main" }],
  actions: [{ type: "notify", title: "CI broke: {{event.title}}", body: "{{event.detail}}" }, { type: "create_task", title: "Fix {{event.title}}", dueInDays: 1, priority: 1 }], ...extra,
});
const ci = (title: string) => emitActivity({ type: "github.ci.failed", source: "github", title, detail: "build #42" }, undefined, h());

beforeEach(async () => {
  allowed.owner = true;
  enqueued.length = 0;
  for (const table of [automations, notifications, activityEvents, tasks, agentRuns, agents, permissions, approvals]) await h().delete(table);
  await h().delete(settings).where(eq(settings.key, "agents.paused"));
});

describe("automations", () => {
  it("event trigger → conditions → gateway actions, once per event, ignoring older events", async () => {
    await ci("CI failed on main (before)");
    await h().update(activityEvents).set({ occurredAt: new Date(Date.now() - 60_000) });
    await ok(saveAutomationAction(ciRule()));
    await ci("CI failed on main");
    await ci("CI failed on feature-x");
    const r1 = await runAutomations(h(), new Date());
    expect(r1.started).toBe(1);
    const [task] = await h().select().from(tasks);
    expect(task).toMatchObject({ title: "Fix CI failed on main", priority: 1 });
    expect(await h().select().from(notifications).where(eq(notifications.title, "CI broke: CI failed on main"))).toHaveLength(1);
    const [run] = await h().select().from(automationRuns);
    expect(run).toMatchObject({ status: "done", attempts: 1 });
    const calls = await h().select().from(toolCalls).where(eq(toolCalls.runId, run!.agentRunId!));
    expect(calls.map((c) => c.tool).sort()).toEqual(["automation.create_task", "automation.notify"]);
    expect((await h().select().from(agentRuns).where(eq(agentRuns.id, run!.agentRunId!)))[0]).toMatchObject({ agentId: "automations", origin: "automation", status: "completed" });
    expect((await runAutomations(h(), new Date())).started).toBe(0); // same event never runs twice
    // Its own notification event (source automation) never re-triggers anything.
    expect((await h().select().from(activityEvents).where(eq(activityEvents.type, "automation.notified")))[0]?.source).toBe("automation");
  });

  it("schedules fire within the grace window on chosen Sydney weekdays only", async () => {
    await ok(saveAutomationAction({ name: "Plan", trigger: { type: "schedule", at: "07:30", days: ["Thu"] }, actions: [{ type: "notify", title: "Plan your day" }] }));
    expect((await runAutomations(h(), new Date("2026-10-14T20:29:00Z"))).started).toBe(0); // Thu 07:29
    expect((await runAutomations(h(), new Date("2026-10-14T20:40:00Z"))).started).toBe(1); // Thu 07:40
    expect((await runAutomations(h(), new Date("2026-10-14T20:45:00Z"))).started).toBe(0); // already claimed
    expect((await runAutomations(h(), new Date("2026-10-21T21:10:00Z"))).started).toBe(0); // next Thu 08:10: too late, skipped
    expect((await runAutomations(h(), new Date("2026-10-16T20:40:00Z"))).started).toBe(0); // Sat
  });

  it("finds a matching event behind more than 50 non-matching ones, and handles a schedule across midnight", async () => {
    await ok(saveAutomationAction(ciRule({ actions: [{ type: "notify", title: "x" }] })));
    for (let i = 0; i < 55; i++) await ci(`CI failed on feature-${i}`);
    await ci("CI failed on main");
    expect((await runAutomations(h(), new Date())).started).toBe(1);
    await h().delete(automations);
    await ok(saveAutomationAction({ name: "Late", trigger: { type: "schedule", at: "23:50", days: ["Thu"] }, actions: [{ type: "notify", title: "late" }] }));
    expect((await runAutomations(h(), new Date("2026-10-15T13:05:00Z"))).started).toBe(1); // Fri 00:05 Sydney = Thu's 23:50 slot
    expect((await h().select().from(automationRuns))[0]?.triggerRef).toBe("schedule:2026-10-15T23:50");
  });

  it("recovery replays the snapshot taken at claim time, not a later edit; trigger edits restart the window", async () => {
    const id = await ok(saveAutomationAction(ciRule({ actions: [{ type: "notify", title: "original" }] })));
    await ci("CI failed on main");
    const [a] = await h().select().from(automations).where(eq(automations.id, id));
    const [e] = await h().select().from(activityEvents);
    const run = await claim(h(), a!, `event:${e!.id}`, { id: e!.id, type: e!.type, title: e!.title, source: e!.source, detail: "" }, new Date());
    await ok(saveAutomationAction(ciRule({ actions: [{ type: "create_task", title: "edited", dueInDays: null, priority: null }] }), id));
    await execute(h(), run!.id);
    expect(await h().select().from(tasks)).toHaveLength(0);
    expect(await h().select().from(notifications).where(eq(notifications.title, "original"))).toHaveLength(1);
    const before = (await h().select().from(automations).where(eq(automations.id, id)))[0]!.enabledAt;
    await ok(saveAutomationAction(ciRule({ name: "renamed only", actions: [{ type: "notify", title: "original" }] }), id));
    expect((await h().select().from(automations).where(eq(automations.id, id)))[0]!.enabledAt).toEqual(before);
    await ok(saveAutomationAction(ciRule({ trigger: { type: "event", eventType: "mail.important" }, actions: [{ type: "notify", title: "original" }] }), id));
    expect((await h().select().from(automations).where(eq(automations.id, id)))[0]!.enabledAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it("rate-limits to 20 runs a day and records the skip", async () => {
    await ok(saveAutomationAction(ciRule({ conditions: [], actions: [{ type: "notify", title: "x" }] })));
    for (let i = 0; i < 22; i++) await ci(`CI ${i}`);
    expect((await runAutomations(h(), new Date())).started).toBe(20);
    const rows = await h().select().from(automationRuns);
    expect(rows.filter((r) => r.status === "skipped")).toHaveLength(2);
    expect(rows.find((r) => r.status === "skipped")?.error).toMatch(/Rate limit/);
  });

  it("recovers an interrupted run without repeating completed actions", async () => {
    const id = await ok(saveAutomationAction(ciRule()));
    await ci("CI failed on main");
    const [a] = await h().select().from(automations).where(eq(automations.id, id));
    const [e] = await h().select().from(activityEvents);
    const run = await claim(h(), a!, `event:${e!.id}`, { id: e!.id, type: e!.type, title: e!.title, source: e!.source, detail: "build #42" }, new Date());
    expect(await claim(h(), a!, `event:${e!.id}`, null, new Date())).toBeNull();
    await execute(h(), run!.id);
    // Simulate a crash after the actions ran but before the status landed.
    await h().update(automationRuns).set({ status: "running", updatedAt: new Date(Date.now() - 10 * 60_000) }).where(eq(automationRuns.id, run!.id));
    expect(await runAutomations(h(), new Date())).toMatchObject({ recovered: 1 });
    expect(await h().select().from(tasks)).toHaveLength(1);
    expect((await h().select().from(automationRuns).where(eq(automationRuns.id, run!.id)))[0]).toMatchObject({ status: "done", attempts: 2 });
  });

  it("ask_agent starts an unattended orchestrator run whose tree is approval-floored and hard-private", async () => {
    await ok(saveAutomationAction(ciRule({ actions: [{ type: "ask_agent", prompt: "Investigate {{event.title}}" }] })));
    await ci("CI failed on main");
    await runAutomations(h(), new Date());
    const [orch] = await h().select().from(agentRuns).where(eq(agentRuns.agentId, "orchestrator"));
    expect(orch).toMatchObject({ origin: "automation", prompt: "Investigate CI failed on main" });
    expect(enqueued).toEqual([{ runId: orch!.id }]);
    const child = await createRun(h(), { agentId: "organization", prompt: "add it", parentRunId: orch!.id });
    if (!child.ok) throw new Error(child.code);
    expect(await automationOrigin(h(), child.runId)).toBe(true);
    expect(await hardPrivateInScope(h(), child.runId)).toBe(true);
    // An EXECUTE side-effect tool runs directly in an owner-started run, but waits for approval in an unattended tree.
    const handler = vi.fn(async () => ({ done: true }));
    const stub = { "calendar.create_event": { ...TOOLS["calendar.create_event"]!, tier: "EXECUTE" as const, output: z.record(z.string(), z.unknown()), resolve: undefined, available: undefined, toApproval: undefined, handler } };
    const owned = await createRun(h(), { agentId: "organization", prompt: "owner asks" });
    if (!owned.ok) throw new Error(owned.code);
    expect(await callTool({ handle: h(), runId: owned.runId, agentId: "organization", tools: stub }, "calendar.create_event", { title: "x", start: "2026-10-20T00:00:00Z", end: "2026-10-20T01:00:00Z" }, "tu_owned")).toMatchObject({ status: "ok" });
    const r = await callTool({ handle: h(), runId: child.runId, agentId: "organization", tools: stub }, "calendar.create_event", { title: "x", start: "2026-10-20T00:00:00Z", end: "2026-10-20T01:00:00Z" }, "tu_floor");
    expect(r.status).toBe("waiting_approval");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(withUnattendedFloor("EXECUTE", true, true)).toBe("APPROVE");
    expect(withUnattendedFloor("READ", false, true)).toBe("READ");
    expect(withUnattendedFloor("HIGH_RISK", true, true)).toBe("HIGH_RISK");
    // The automations agent itself is a system agent: never delegated to or chatted with.
    expect(await createRun(h(), { agentId: "automations", prompt: "hi" })).toMatchObject({ ok: false, code: "not_live" });
    expect(TOOLS.delegate!.input.safeParse({ agentId: "automations", task: "x", tier: "simple" }).success).toBe(false);
  });

  it("pausing the Automations agent stops the engine; re-enabling does not replay old events", async () => {
    const id = await ok(saveAutomationAction(ciRule()));
    await h().insert(agents).values({ id: "automations", paused: true }).onConflictDoUpdate({ target: agents.id, set: { paused: true } });
    await ci("CI failed on main");
    expect((await runAutomations(h(), new Date())).started).toBe(0);
    await h().delete(agents);
    await ok(setAutomationEnabledAction(id, false));
    await ok(setAutomationEnabledAction(id, true)); // enabledAt moves to now
    expect((await runAutomations(h(), new Date())).started).toBe(0);
    await ci("CI failed on main again");
    expect((await runAutomations(h(), new Date())).started).toBe(1);
  });

  it("validates input, deletes, and checks the owner", async () => {
    expect(await saveAutomationAction({ name: "x", trigger: { type: "event", eventType: "automation.notified" }, actions: [{ type: "notify", title: "y" }] })).toMatchObject({ ok: false });
    expect(await saveAutomationAction({ name: "x", trigger: { type: "schedule", at: "7:00", days: ["Mon"] }, actions: [{ type: "notify", title: "y" }] })).toMatchObject({ ok: false });
    expect(await saveAutomationAction({ name: "x", trigger: { type: "event", eventType: "mail.important" }, actions: [] })).toMatchObject({ ok: false, error: "Add at least one action." });
    const id = await ok(saveAutomationAction(ciRule()));
    expect(await saveAutomationAction(ciRule({ name: "Renamed" }), id)).toMatchObject({ ok: true });
    expect((await h().select().from(automations).where(eq(automations.id, id)))[0]?.name).toBe("Renamed");
    expect(await deleteAutomationAction(id)).toMatchObject({ ok: true });
    expect(await deleteAutomationAction(id)).toMatchObject({ ok: false });
    expect(await h().select().from(automationRuns).where(and(eq(automationRuns.automationId, id)))).toHaveLength(0);
    allowed.owner = false;
    for (const call of [() => saveAutomationAction({}), () => setAutomationEnabledAction("x", true), () => deleteAutomationAction("x")]) await expect(call()).rejects.toThrow("Not owner");
  });
});
