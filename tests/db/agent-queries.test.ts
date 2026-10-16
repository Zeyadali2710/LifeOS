import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { agentDetail, agentsOverview, recentRuns, runDetail } from "@/server/agents/queries";
import { setAgentPaused } from "@/server/agents/runs";
import { agentRuns, toolCalls } from "@/server/db/schema";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const h = () => t.handle();
const now = new Date("2026-10-08T12:30:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const HR = 3_600_000;
const mkRun = async (v: Partial<typeof agentRuns.$inferInsert> = {}) =>
  (await h().insert(agentRuns).values({ agentId: "projects", prompt: "p", model: "m", createdAt: ago(HR), ...v }).returning())[0]!;
const projects = async () => (await agentsOverview(h(), now)).agents.find((a) => a.id === "projects")!;

beforeEach(async () => {
  await h().execute(sql`truncate agent_runs, agents, settings cascade`);
});

describe("agent read models", () => {
  it("disabled agents have no stats; live agents with no runs get zeros", async () => {
    const o = await agentsOverview(h(), now);
    expect(o.agents).toHaveLength(12);
    expect(o.agents.find((a) => a.id === "home")).toMatchObject({ stats: null, status: "NOT CONNECTED" });
    const p = await projects();
    expect(p.status).toBe("READY");
    expect(p.stats).toEqual({ last: null, queue: 0, health: null, sparkline: Array(24).fill(0) });
    expect(o.agents.find((a) => a.id === "orchestrator")!.status).toBe("ONLINE");
  });

  it("computes status, health, sparkline and queue", async () => {
    await mkRun({ status: "completed", createdAt: ago(30 * 60_000) });
    await mkRun({ status: "completed", createdAt: ago(5 * HR) });
    await mkRun({ status: "failed", createdAt: ago(26 * HR) });
    await mkRun({ status: "queued", createdAt: ago(1000) });
    const p = await projects();
    expect(p.stats!.health).toBe(67);
    expect(p.stats!.queue).toBe(1);
    expect(p.stats!.sparkline[23]).toBe(2);
    expect(p.stats!.sparkline[18]).toBe(1);
    expect(p.stats!.sparkline.reduce((a, b) => a + b, 0)).toBe(3);

    await mkRun({ status: "running", createdAt: ago(10) });
    expect((await projects()).status).toBe("WORKING");
    await setAgentPaused(h(), "projects", true);
    expect((await projects()).status).toBe("PAUSED");
  });

  it("failed last run means ATTENTION", async () => {
    await mkRun({ status: "failed", createdAt: ago(1000) });
    expect((await projects()).status).toBe("ATTENTION");
  });

  it("paginates recent runs within 24h", async () => {
    for (let i = 1; i <= 5; i++) await mkRun({ createdAt: ago(i * 60_000) });
    await mkRun({ createdAt: ago(30 * HR) });
    const a = await recentRuns(h(), { limit: 3, now });
    expect(a.items).toHaveLength(3);
    expect(a.nextCursor).not.toBeNull();
    const b = await recentRuns(h(), { limit: 3, now, cursor: a.nextCursor! });
    expect(b.items).toHaveLength(2);
    expect(b.nextCursor).toBeNull();
  });

  it("agentDetail marks create_issue unavailable without a write token", async () => {
    const d = (await agentDetail(h(), "projects", now))!;
    expect(d.tools.find((x) => x.name === "github.create_issue")).toMatchObject({ state: "unavailable", reason: "issues-write token missing" });
    expect(d.tools.find((x) => x.name === "github.list_repos")!.state).toBe("not connected");
    expect(d.config.paused).toBe(false);
    expect(await agentDetail(h(), "nope", now)).toBeNull();
  });

  it("runDetail redacts tool I/O and omits conversation state", async () => {
    const r = await mkRun({ status: "completed" });
    await h().insert(toolCalls).values({
      runId: r.id,
      toolUseId: "u1",
      seq: 1,
      tool: "github.list_repos",
      tier: "READ",
      status: "done",
      input: { token: "ghp_secret", q: "x" },
      output: { items: [{ apiKey: "k", n: 1 }] },
    });
    const d = (await runDetail(h(), r.id))!;
    expect(d.toolCalls[0]!.input).toEqual({ token: "[redacted]", q: "x" });
    expect(JSON.stringify(d)).not.toContain("ghp_secret");
    expect(JSON.stringify(d.toolCalls[0]!.output)).toContain("[redacted]");
    expect(d.steps).toHaveLength(1);
    expect(d.run).not.toHaveProperty("messages");
    expect(await runDetail(h(), "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("merges route steps and counts free vs paid runs this month", async () => {
    const ev = { kind: "fallback", seq: 0.5, at: now.toISOString(), reason: "timeout", to: "claude-sonnet-5-5" };
    const r = await mkRun({ status: "completed", model: "claude-sonnet-5-5", startedAt: ago(HR), routeEvents: [ev] as never });
    await mkRun({ model: "x/y:free", startedAt: ago(HR) });
    expect((await runDetail(h(), r.id))!.steps.map((s) => s.kind)).toEqual(["route"]);
    expect((await agentsOverview(h(), now)).routing).toEqual({ free: 1, paid: 1 });
    const d = (await agentDetail(h(), "projects", now))!;
    expect(d.config).toMatchObject({ routable: true, freeAvailable: false });
  });
});
