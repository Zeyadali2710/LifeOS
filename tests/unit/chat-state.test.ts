import { describe, expect, it } from "vitest";
import type { RunDTO, StepDTO, TurnDTO } from "@/lib/agent-types";
import { applyChatEvent, PENDING_TURN, splitNdjson } from "@/shell/ai/chat-state";

const run = { id: "r1", prompt: "hi", status: "running", answer: null, startedAt: null } as unknown as RunDTO;
const step = (id: string, seq: number) => ({ id, runId: "r1", seq }) as unknown as StepDTO;
const pending: TurnDTO = { id: PENDING_TURN, prompt: "hi", at: "", run: null, steps: [], approvals: [] };

describe("applyChatEvent", () => {
  it("run replaces pending, steps upsert in seq order, deltas append, done replaces", () => {
    let t = applyChatEvent([pending], { k: "run", run, threadId: "t" });
    expect(t[0]!.id).toBe("r1");
    t = applyChatEvent(t, { k: "step", step: step("b", 2) });
    t = applyChatEvent(t, { k: "step", step: step("a", 1) });
    t = applyChatEvent(t, { k: "step", step: { ...step("b", 2), state: "done" } });
    expect(t[0]!.steps.map((s) => s.id)).toEqual(["a", "b"]);
    expect(t[0]!.steps[1]!.state).toBe("done");
    t = applyChatEvent(t, { k: "delta", runId: "r1", text: "Hel" });
    t = applyChatEvent(t, { k: "delta", runId: "r1", text: "lo" });
    expect(t[0]!.run?.answer).toBe("Hello");
    t = applyChatEvent(t, { k: "done", run: { ...run, status: "completed", answer: "Hello" } });
    expect(t[0]!.run?.status).toBe("completed");
  });
});

describe("splitNdjson", () => {
  it("handles chunk boundaries and invalid lines", () => {
    const a = splitNdjson("", '{"k":"delta","runId":"r","te');
    expect(a.events).toEqual([]);
    const b = splitNdjson(a.rest, 'xt":"x"}\n\nnot json\n{"k":"done"}\n');
    expect(b.events).toHaveLength(2);
    expect(b.rest).toBe("");
  });
});
