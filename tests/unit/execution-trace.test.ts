import { describe, expect, it } from "vitest";
import { actorLabel, stepView } from "@/agents/execution-trace";
import type { StepDTO } from "@/lib/agent-types";

const step = (o: Partial<StepDTO>): StepDTO => ({
  id: "s1", runId: "r1", seq: 1, kind: "tool", actor: "projects", action: "List PRs", tool: "github.list_prs",
  state: "done", startedAt: null, durationMs: 2100, inputSummary: null, outputSummary: null, error: null, items: null, itemsMore: 0, ...o,
});

describe("stepView", () => {
  it("maps states to label and tone", () => {
    expect(stepView(step({ state: "queued" }))).toMatchObject({ label: "QUEUED", tone: "text-3" });
    expect(stepView(step({ state: "running" }))).toMatchObject({ label: "RUNNING", tone: "indigo" });
    expect(stepView(step({ state: "done" }))).toMatchObject({ label: "2.1s", tone: "text-3" });
    expect(stepView(step({ state: "waiting" }))).toMatchObject({ label: "WAITING", tone: "amber" });
    expect(stepView(step({ state: "failed" }))).toMatchObject({ label: "FAILED", tone: "red" });
    expect(stepView(step({ state: "cancelled" }))).toMatchObject({ label: "CANCELLED", tone: "text-3" });
  });
  it("route steps are indigo ROUTE, or red FAILED when blocked", () => {
    expect(stepView(step({ kind: "route" }))).toMatchObject({ label: "ROUTE", tone: "indigo", expandable: false, showOutput: false });
    expect(stepView(step({ kind: "route", state: "failed" }))).toMatchObject({ label: "FAILED", tone: "red" });
  });
  it("is expandable only with a summary; running hides output", () => {
    expect(stepView(step({})).expandable).toBe(false);
    expect(stepView(step({ outputSummary: "x" })).expandable).toBe(true);
    expect(stepView(step({ state: "running", inputSummary: "i", outputSummary: "o" })).showOutput).toBe(false);
    expect(stepView(step({ inputSummary: "i", outputSummary: "o" })).showOutput).toBe(true);
  });
});

describe("actorLabel", () => {
  it("labels actors", () => {
    expect(actorLabel("orchestrator")).toBe("LIFEOS");
    expect(actorLabel("projects")).toBe("PROJECTS AGENT");
  });
});
