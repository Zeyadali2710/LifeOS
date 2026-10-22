import { beforeEach, describe, expect, it, vi } from "vitest";
import { BriefingsScreen } from "@/features/briefings/briefings-screen";
import { DEFAULT_SCHEDULE } from "@/lib/digest";
import { getBriefing, getSchedule, listBriefings } from "@/server/briefings";
import { describeAction, linkedRunState, runState } from "@/features/automations/model";
import { loadAutomationsView } from "@/server/automations-view";
import { loadAutomations } from "@/server/automations";
import type { DB } from "@/server/db/client";

vi.mock("@/server/automations", () => ({ loadAutomations: vi.fn() }));
vi.mock("@/server/briefings", () => ({ getBriefing: vi.fn(), getSchedule: vi.fn(), listBriefings: vi.fn() }));
vi.mock("@/server/db/client", () => ({ db: () => ({}) }));
vi.mock("@/features/briefings/briefings-view", () => ({ BriefingsView: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));

describe("briefing selection", () => {
  const id = "dc7478c8-f8cb-4a89-8112-72891f351010";
  const row = { id, kind: "morning", period: "2026-10-23", headline: "A quiet day", createdAt: new Date("2026-10-22T20:00:00Z"), readAt: null };
  beforeEach(() => {
    vi.mocked(getSchedule).mockResolvedValue(DEFAULT_SCHEDULE);
    vi.mocked(listBriefings).mockResolvedValue([row]);
    vi.mocked(getBriefing).mockResolvedValue({ ...row, scheduled: true, body: { kind: "morning", period: row.period, headline: row.headline, sections: [] } });
  });

  it("selects the requested briefing even outside the recent list", async () => {
    vi.mocked(listBriefings).mockResolvedValue([]);
    const screen = await BriefingsScreen({ selectedId: id });
    expect(getBriefing).toHaveBeenLastCalledWith({}, id);
    expect(screen.props.selected.id).toBe(id);
    expect(screen.props.rows).toEqual([{ ...row, scheduled: true, body: screen.props.selected.body, createdAt: row.createdAt.toISOString() }]);
  });

  it("defaults to the latest briefing and keeps an empty screen usable", async () => {
    expect((await BriefingsScreen({})).props.selected.id).toBe(id);
    vi.mocked(listBriefings).mockResolvedValue([]);
    const screen = await BriefingsScreen({});
    expect(screen.props.selected).toBeNull();
    expect(screen.props.rows).toEqual([]);
  });

  it.each(["", "invalid", "dc7478c8-f8cb-4a89-8112-72891f351011"])("rejects unknown selection %s", async (selectedId) => {
    vi.mocked(getBriefing).mockResolvedValue(null);
    await expect(BriefingsScreen({ selectedId })).rejects.toThrow("not found");
  });
});

describe("automation presentation", () => {
  it.each([
    ["waiting_approval", "Waiting approval", "approval"],
    ["queued", "Running", "working"],
    ["running", "Running", "working"],
    ["completed", "Done", "idle"],
    ["failed", "Failed", "failed"],
    ["cancelled", "Cancelled", "idle"],
    ["expired", "Expired", "idle"],
  ])("shows the child %s state after dispatch completes", (agentStatus, label, tone) => {
    expect(runState({ status: "done", agentStatus })).toMatchObject({ label, tone });
  });

  it("preserves engine failures and skipped runs", () => {
    expect(runState({ status: "failed", agentStatus: "completed" }).label).toBe("Failed");
    expect(runState({ status: "skipped", agentStatus: null }).label).toBe("Skipped");
    expect(runState({ status: "done", agentStatus: null }).label).toBe("Done");
  });

  it("never hides a proposal behind another completed child", () => {
    const waiting = { id: "waiting", status: "waiting_approval" };
    expect(linkedRunState([{ id: "done", status: "completed" }, { id: "active", status: "running" }, waiting])).toEqual(waiting);
    expect(linkedRunState([{ id: "done", status: "completed" }, { id: "failed", status: "failed" }])?.id).toBe("failed");
    expect(linkedRunState([])).toBeUndefined();
  });

  it("keeps all configured action details visible", () => {
    expect(describeAction({ type: "notify", title: "Hello", body: "World", priority: "IMPORTANT" })).toContain("World");
    expect(describeAction({ type: "notify", title: "Hello", body: "", priority: "IMPORTANT" })).toContain("IMPORTANT");
    expect(describeAction({ type: "create_task", title: "Review", dueInDays: 0, priority: 1 })).toContain("due in 0 days");
    expect(describeAction({ type: "create_task", title: "Review", dueInDays: null, priority: null })).not.toContain("due in");
    expect(describeAction({ type: "ask_agent", prompt: "Draft an issue" })).toContain("Draft an issue");
  });
});

describe("automation view query", () => {
  it("follows the actual dispatched child and links its pending approval trace", async () => {
    const parent = "dc7478c8-f8cb-4a89-8112-72891f351001";
    const child = "dc7478c8-f8cb-4a89-8112-72891f351002";
    vi.mocked(loadAutomations).mockResolvedValue({ paused: false, automations: [{
      id: "rule", name: "CI", enabled: true, trigger: { type: "event", eventType: "github.ci.failed" }, conditions: [], actions: [{ type: "ask_agent", prompt: "Draft" }],
      runs: [{ id: "run", automationId: "rule", status: "done", error: null, agentRunId: parent, triggerRef: "event:ci", createdAt: "2026-10-23T00:00:00Z" }],
    }] });
    const where = vi.fn().mockResolvedValueOnce([{ runId: parent, output: { runId: child } }, { runId: parent, output: { runId: "invalid" } }])
      .mockResolvedValueOnce([{ id: parent, status: "completed" }, { id: child, status: "waiting_approval" }]);
    const handle = { select: () => ({ from: () => ({ where }) }) } as unknown as DB;
    const data = await loadAutomationsView(handle);
    expect(data.automations[0]!.runs[0]).toMatchObject({ status: "done", agentStatus: "waiting_approval", agentRunId: child });
    expect(where).toHaveBeenCalledTimes(2);
  });

  it("does not query run tables when there are no automations", async () => {
    vi.mocked(loadAutomations).mockResolvedValue({ paused: true, automations: [] });
    const select = vi.fn();
    expect(await loadAutomationsView({ select } as unknown as DB)).toEqual({ paused: true, automations: [] });
    expect(select).not.toHaveBeenCalled();
  });
});
