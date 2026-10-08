import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ db: () => ({}) }));
vi.mock("@/server/github/connections", () => ({ markConnectionError: vi.fn(), openrouterKey: vi.fn() }));

import { dispatchingClient } from "@/server/agents/llm";
import type { LlmClient } from "@/server/agents/types";

const fake = () => {
  const stream = vi.fn(async () => ({ content: [], stopReason: "end_turn", usage: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 } }));
  return { stream } as unknown as LlmClient & { stream: ReturnType<typeof vi.fn> };
};

describe("dispatchingClient", () => {
  it("routes :free ids to the free client and the rest to anthropic", async () => {
    const a = fake();
    const f = fake();
    const c = dispatchingClient(a, f);
    await c.stream({ model: "x/y:free" } as never, () => {});
    expect([f.stream.mock.calls.length, a.stream.mock.calls.length]).toEqual([1, 0]);
    await c.stream({ model: "claude-sonnet-5-5" } as never, () => {});
    expect([f.stream.mock.calls.length, a.stream.mock.calls.length]).toEqual([1, 1]);
  });
});
