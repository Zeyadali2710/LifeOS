import { describe, expect, it, vi } from "vitest";
import { createOpenRouter, FREE_TIMEOUT_MS, FreeModelError } from "@/server/agents/openrouter";
import { RUN_LIMITS } from "@/server/agents/registry";
import type { AnthropicTool } from "@/server/agents/types";
import text from "../fixtures/openrouter/text.json";
import toolCalls from "../fixtures/openrouter/tool-calls.json";


const KEY = "sk-or-secret-key";
const json = (b: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(b), init);
const tool: AnthropicTool = { name: "t_x", description: "d", input_schema: { type: "object", properties: {} } };
const params = (over: object = {}) => ({
  model: "vendor/x:free",
  system: "SYS",
  messages: [{ role: "user" as const, content: "hi" }],
  tools: [tool],
  maxTokens: 100,
  ...over,
});

function setup(...responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit; body: { [k: string]: unknown; messages: unknown; tools: unknown; provider: { data_collection?: string } } }[] = [];
  const f = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(init.body as string) });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    if (r instanceof Error) throw r;
    return r.clone();
  });
  const llm = createOpenRouter({ getKey: async () => KEY, fetch: f as unknown as typeof fetch });
  return { llm, calls };
}
const fail = async (p: Promise<unknown>) => (await p.catch((e) => e)) as FreeModelError;

describe("openrouter translation", () => {
  it("translates request and key placement", async () => {
    const { llm, calls } = setup(json(text));
    const onText = vi.fn();
    const turn = await llm.stream(
      params({
        messages: [
          { role: "user", content: "go" },
          {
            role: "assistant",
            content: [
              { type: "text", text: "ok" },
              { type: "tool_use", id: "tu1", name: "t_x", input: { a: 1 } },
            ],
          },
          {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "tu1", content: "boom", is_error: true },
              { type: "text", text: "more" },
            ],
          },
        ],
      }),
      onText,
    );
    const { url, init, body } = calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(init.body as string).not.toContain(KEY);
    expect(body.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "go" },
      { role: "assistant", content: "ok", tool_calls: [{ id: "tu1", type: "function", function: { name: "t_x", arguments: '{"a":1}' } }] },
      { role: "tool", tool_call_id: "tu1", content: "Error: boom" },
      { role: "user", content: "more" },
    ]);
    expect(body.tools).toEqual([{ type: "function", function: { name: "t_x", description: "d", parameters: tool.input_schema } }]);
    expect(body).toMatchObject({ tool_choice: "auto", stream: false, max_completion_tokens: 100, provider: { require_parameters: true, data_collection: "deny" } });
    expect(turn).toMatchObject({ stopReason: "end_turn", content: [{ type: "text", text: "All clear.", citations: null }], usage: { input: 50, output: 5, cacheWrite: 0, cacheRead: 0 } });
    expect(onText).toHaveBeenCalledOnce();
    expect(onText).toHaveBeenCalledWith("All clear.");
  });

  it("maps tool_calls with regenerated ids", async () => {
    const { llm } = setup(json(toolCalls));
    const turn = await llm.stream(params(), vi.fn());
    expect(turn.stopReason).toBe("tool_use");
    expect(turn.content[0]).toMatchObject({ type: "tool_use", name: "github_list_pull_requests", input: { repo: "a/b" } });
    expect((turn.content[0] as { id: string }).id).toMatch(/^call_or_/);
    expect(turn.usage.providerCostUsd).toBeUndefined();
  });

  it("maps length, provider cost and missing usage", async () => {
    const body = { choices: [{ finish_reason: "length", message: { content: "abcdefgh" } }], usage: { prompt_tokens: 1, completion_tokens: 2, cost: 0.5 } };
    const t = await setup(json(body)).llm.stream(params(), vi.fn());
    expect(t.stopReason).toBe("max_tokens");
    expect(t.usage.providerCostUsd).toBe(0.5);
    const t2 = await setup(json({ choices: body.choices })).llm.stream(params(), vi.fn());
    expect(t2.usage.output).toBeGreaterThan(0);
  });

  it("drops a whitespace-only text block before tool_calls (WR-01)", async () => {
    const b = { choices: [{ finish_reason: "tool_calls", message: { content: "\n\n", tool_calls: [{ function: { name: "t_x", arguments: "{}" } }] } }] };
    const t = await setup(json(b)).llm.stream(params(), vi.fn());
    expect(t.content.map((c) => c.type)).toEqual(["tool_use"]);
  });

  it("empty tool arguments become {}", async () => {
    const b = { choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ function: { name: "t_x", arguments: "" } }] } }] };
    const t = await setup(json(b)).llm.stream(params(), vi.fn());
    expect(t.content[0]).toMatchObject({ input: {} });
  });
});

describe("openrouter failures", () => {
  const msg = (m: object, finish: string | null = "tool_calls") => json({ choices: [{ finish_reason: finish, message: m }] });
  it.each([
    ["{bad", "invalid_tool_call"],
    ["[1]", "invalid_tool_call"],
  ])("rejects arguments %s", async (args, code) => {
    const e = await fail(setup(msg({ tool_calls: [{ function: { name: "t_x", arguments: args } }] })).llm.stream(params(), vi.fn()));
    expect(e).toBeInstanceOf(FreeModelError);
    expect(e).toMatchObject({ code, transient: false });
  });

  it.each(["content_filter", "error", null])("bad finish %s", async (f) => {
    const e = await fail(setup(msg({ content: "x" }, f)).llm.stream(params(), vi.fn()));
    expect(e.code).toBe("bad_finish");
  });

  it("empty output", async () => {
    const e = await fail(setup(msg({ content: "" }, "stop")).llm.stream(params(), vi.fn()));
    expect(e.code).toBe("empty");
  });

  it.each([408, 429, 500, 501, 502, 503, 504, 520, 524, 529, 599])("status %i is transient", async (status) => {
    const e = await fail(setup(json({ error: { code: status, message: "x" } }, { status })).llm.stream(params(), vi.fn()));
    expect(e).toMatchObject({ code: "http", transient: true, status });
  });

  it.each([400, 401, 402, 403, 422])("status %i is permanent", async (status) => {
    const e = await fail(setup(json({ error: { message: "x" } }, { status })).llm.stream(params(), vi.fn()));
    expect(e).toMatchObject({ code: "http", transient: false, status });
  });

  it("parses Retry-After and never leaks the key", async () => {
    const e = await fail(setup(json({ error: { message: "m".repeat(500) } }, { status: 429, headers: { "retry-after": "3" } })).llm.stream(params(), vi.fn()));
    expect(e.retryAfterMs).toBe(3000);
    expect(e.message.length).toBeLessThan(260);
    expect(e.message).not.toContain(KEY);
  });

  it("retries once without data_collection on 404 and remembers", async () => {
    const { llm, calls } = setup(json({ error: {} }, { status: 404 }), json(text));
    await llm.stream(params(), vi.fn());
    expect(calls).toHaveLength(2);
    expect(calls[0]!.body.provider.data_collection).toBe("deny");
    expect(calls[1]!.body.provider.data_collection).toBeUndefined();
    await llm.stream(params(), vi.fn());
    expect(calls[2]!.body.provider.data_collection).toBeUndefined();
  });

  it("404 twice is permanent", async () => {
    const e = await fail(setup(json({ error: {} }, { status: 404 })).llm.stream(params(), vi.fn()));
    expect(e).toMatchObject({ code: "http", transient: false, status: 404 });
  });

  it("caller abort rethrows AbortError; timeout and network are typed", async () => {
    const ac = new AbortController();
    const abort = new DOMException("aborted", "AbortError");
    ac.abort();
    expect(await setup(abort).llm.stream(params(), vi.fn(), ac.signal).catch((e) => e)).toBe(abort);
    const t = await fail(setup(new DOMException("t", "TimeoutError")).llm.stream(params(), vi.fn()));
    expect(t).toMatchObject({ code: "timeout", transient: true });
    const n = await fail(setup(new TypeError("fetch failed")).llm.stream(params(), vi.fn()));
    expect(n).toMatchObject({ code: "network", transient: true });
  });

  it("two timed-out free attempts plus backoff leave Sonnet half the run budget (WR-03)", () => {
    expect(2 * FREE_TIMEOUT_MS + 5000).toBeLessThanOrEqual(RUN_LIMITS.activeMs / 2);
  });

  it("no key", async () => {
    const llm = createOpenRouter({ getKey: async () => null, fetch: vi.fn() as unknown as typeof fetch });
    expect(await fail(llm.stream(params(), vi.fn()))).toMatchObject({ code: "no_key", transient: false });
  });
});
