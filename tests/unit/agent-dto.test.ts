import { describe, expect, it } from "vitest";
import { routeSteps, toApprovalDTO, toRunDTO, toStepDTO } from "@/server/agents/dto";
import { modelLabel, modelShort } from "@/server/agents/registry";

const t0 = new Date("2026-01-01T00:00:00Z");
const run = {
  id: "r", agentId: "chief", threadId: null, parentRunId: null, retryOf: null, prompt: "p", model: "m", status: "completed",
  messages: [{ secret: 1 }], answer: "a", error: null, errorKind: null, inputTokens: 10, outputTokens: 5, cacheWriteTokens: 2,
  cacheReadTokens: 3, costUsd: "0.043100", toolCallCount: 1, activeMs: 0, startedAt: t0, firstToolAt: new Date(t0.getTime() + 500),
  endedAt: new Date(t0.getTime() + 2000), tier: null,
} as never;

describe("dto", () => {
  it("maps run", () => {
    const d = toRunDTO(run);
    expect(d).toMatchObject({ costUsd: 0.0431, tokensCache: 5, durationMs: 2000, firstToolMs: 500, startedAt: t0.toISOString() });
    expect(JSON.stringify(d)).not.toContain("secret");
    expect(toRunDTO({ ...(run as object), endedAt: null } as never).durationMs).toBeNull();
  });
  it("maps step", () => {
    const row = { id: "s", runId: "r", seq: 1, kind: "tool", tool: "github.list", status: "waiting_approval", startedAt: null, durationMs: null, inputSummary: null, outputSummary: null, error: null } as never;
    expect(toStepDTO(row, { agentId: "chief" })).toMatchObject({ state: "waiting", actor: "chief", action: "github.list" });
    expect(toStepDTO({ ...(row as object), kind: "delegate", tool: "dev" } as never, { agentId: "chief" }, () => "Dev").action).toBe("Delegating to Dev");
  });
  it("maps approval and throws on bad payload", () => {
    const row = {
      id: "a", runId: "r", agentId: "dev", tool: "github.create_issue", status: "pending", originalPayload: { repo: "o/r", title: "T" },
      editedPayload: null, reason: null, createdAt: t0, expiresAt: t0, decidedAt: null, result: null, error: null,
    } as never;
    expect(toApprovalDTO(row)).toMatchObject({ kind: "issue" });
    expect(toApprovalDTO(row).original).toEqual({ repo: "o/r", title: "T", body: "", labels: [] });
    expect(() => toApprovalDTO({ ...(row as object), originalPayload: {} } as never)).toThrow();
  });
  it("maps calendar approval by kind", () => {
    const ev = { calendarId: "11111111-1111-4111-8111-111111111111", calendarLabel: "Home", provider: "google", eventId: "22222222-2222-4222-8222-222222222222", etag: null, scope: "this", instanceStart: null, title: "T", start: "2026-01-01T00:00:00Z", end: "2026-01-01T01:00:00Z", allDay: false };
    const row = { id: "a", runId: "r", agentId: "org", tool: "calendar.delete_event", status: "pending", originalPayload: ev, editedPayload: null, reason: null, createdAt: t0, expiresAt: t0, decidedAt: null, result: null, error: null } as never;
    expect(toApprovalDTO(row)).toMatchObject({ kind: "event_delete", original: ev });
    expect(() => toApprovalDTO({ ...(row as object), originalPayload: {} } as never)).toThrow();
  });
  it("maps tier", () => {
    expect(toRunDTO(run).tier).toBeNull();
    expect(toRunDTO({ ...(run as object), tier: "simple" } as never).tier).toBe("simple");
  });
  it("maps route events to steps", () => {
    const ev = (kind: string, to: string | null, reason: string, from: string | null = null) => ({ at: t0.toISOString(), kind, from, to, reason, seq: 0 });
    const steps = (e: unknown[]) => routeSteps({ id: "r", agentId: "projects", routeEvents: e } as never);
    const one = steps([ev("routed", "x/y:free", "tag simple")])[0]!;
    expect(one).toMatchObject({ id: "route:r:0", kind: "route", state: "done", action: "Routed: free (tag simple)", tool: "x/y:free", actor: "projects" });
    expect(steps([ev("fallback", "claude-sonnet-5-5", "timeout", "x:free")])[0]!.action).toBe("Fell back → Sonnet: timeout");
    expect(steps([ev("escalated", "claude-sonnet-5-5", "needs analysis")])[0]!.action).toBe("Escalated → Sonnet: needs analysis");
    expect(steps([ev("private", "claude-sonnet-5-5", "private repo data")])[0]!.action).toBe("Switched → Sonnet: private repo data");
    expect(steps([ev("routed", "claude-sonnet-5-5", "tag reasoning")])[0]!.action).toBe("Routed: Claude Sonnet 5.5 (tag reasoning)");
    expect(steps([ev("blocked", null, "rate limited")])[0]).toMatchObject({ state: "failed", error: "rate limited", action: "Free model unavailable: rate limited" });
    expect(steps([ev("routed", "x:free", "a".repeat(500))])[0]!.action.length).toBeLessThan(260);
  });
  it("labels models", () => {
    expect(modelLabel("vendor/some-model:free")).toBe("Free · some-model");
    expect(modelShort("vendor/some-model:free")).toBe("FREE");
    expect(modelShort("claude-sonnet-5-5")).toBe("SONNET");
    expect(modelShort("a/b-c")).toBe("b-c");
  });
});

describe("step items", () => {
  const row = (tool: string, items: unknown[], status = "done") =>
    ({ id: "s", runId: "r", seq: 1, kind: "tool", tool, status, startedAt: null, durationMs: null, inputSummary: null, outputSummary: null, error: null, output: { connected: true, items } }) as never;
  const id = "22222222-2222-4222-8222-222222222222";
  it("maps events, free slots and tasks", () => {
    const ev = { id, category: "work", title: "Gym", start: "2026-10-08T08:00:00.000Z", end: "2026-10-08T09:30:00.000Z", allDay: false };
    const s = toStepDTO(row("calendar.list_events", [ev]), { agentId: "o" });
    expect(s.items).toEqual([{ key: "EVENT", category: "work", title: "Gym", subtitle: "Thu 19:00–20:30 · Work", href: `/organization?view=day&date=2026-10-08&event=${id}` }]);
    const f = toStepDTO(row("calendar.find_free_slots", [{ start: "2026-10-08T00:00:00.000Z", end: "2026-10-08T02:30:00.000Z", minutes: 150 }]), { agentId: "o" });
    expect(f.items?.[0]).toMatchObject({ key: "FREE", title: "Free", href: "/organization?view=day&date=2026-10-08" });
    expect(f.items?.[0]?.subtitle.startsWith("2 h 30 min")).toBe(true);
    const t = toStepDTO(row("tasks.list", [{ title: "A", due: null }]), { agentId: "o" });
    expect(t.items?.[0]).toMatchObject({ key: "TASK", subtitle: "No due date", href: "/organization#tasks" });
  });
  it("caps at 8, null otherwise", () => {
    const ev = { id, title: "x", start: "2026-10-08T08:00:00.000Z", end: "2026-10-08T09:00:00.000Z", allDay: false };
    const s = toStepDTO(row("calendar.list_events", Array(10).fill(ev)), { agentId: "o" });
    expect(s.items).toHaveLength(8);
    expect(s.itemsMore).toBe(2);
    expect(toStepDTO(row("calendar.list_events", [ev], "failed"), { agentId: "o" }).items).toBeNull();
    expect(toStepDTO(row("github.list", [ev]), { agentId: "o" }).items).toBeNull();
  });
  it("passes targetChanged", () => {
    const a = { id: "a", runId: "r", agentId: "o", tool: "github.create_issue", status: "pending", originalPayload: { repo: "o/r", title: "T" }, editedPayload: null, reason: null, createdAt: t0, expiresAt: t0, decidedAt: null, result: null, error: null } as never;
    expect(toApprovalDTO(a).targetChanged).toBeNull();
    expect(toApprovalDTO(a, null, true).targetChanged).toBe(true);
  });
});
