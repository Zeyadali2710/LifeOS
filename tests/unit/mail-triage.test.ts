import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/client", () => ({ db: () => ({}) }));
vi.mock("@/server/github/connections", () => ({ markConnectionError: vi.fn(), openrouterKey: vi.fn() }));

const create = vi.hoisted(() => vi.fn());
const fin = { content: [], stop_reason: "end_turn", usage: { input_tokens: 0, output_tokens: 0 } };
const stream = { on() {}, finalMessage: async () => fin };
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { stream: (...a: unknown[]) => { create(...a); return stream; } }; } }));

import { anthropicClient } from "@/server/agents/llm";
import { RECORD_TRIAGE_TOOL, triageResult } from "@/server/mail/triage";

const ok = { id: "m1", category: "FOLLOW-UP", importance: "HIGH", summary: "s", action: "a", items: [{ text: "t", due: "2026-11-01" }], flag: true };
const parse = (o: object) => triageResult.safeParse({ results: [{ ...ok, ...o }] }).success;

describe("triageResult", () => {
  it("accepts a valid result and rejects out-of-range fields", () => {
    expect(parse({})).toBe(true);
    expect(parse({ category: "SPAM" })).toBe(false);
    expect(parse({ importance: "URGENT" })).toBe(false);
    expect(parse({ items: Array.from({ length: 6 }, () => ({ text: "x" })) })).toBe(false);
    expect(parse({ summary: "x".repeat(301) })).toBe(false);
    expect(parse({ items: [{ text: "x", due: "next week" }] })).toBe(false);
    expect(parse({ items: [{ text: "x", due: null }] })).toBe(true);
  });
  it("has a JSON schema tool", () => {
    expect(RECORD_TRIAGE_TOOL.name).toBe("record_triage");
    expect(RECORD_TRIAGE_TOOL.input_schema.type).toBe("object");
  });
});

describe("anthropicClient toolChoice", () => {
  it("forwards tool_choice only when given", async () => {
    const c = anthropicClient("k")!;
    const base = { model: "m", system: "s", messages: [], tools: [], maxTokens: 1 };
    await c.stream(base, () => {});
    expect(create.mock.calls[0]![0]).not.toHaveProperty("tool_choice");
    await c.stream({ ...base, toolChoice: { type: "tool", name: "record_triage" } }, () => {});
    expect(create.mock.calls[1]![0]).toMatchObject({ tool_choice: { type: "tool", name: "record_triage" } });
  });
});
