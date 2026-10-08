import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/env", () => ({ env: () => ({ OPENROUTER_FREE_MODEL: process.env.TEST_FREE }) }));

import { MODELS } from "@/server/agents/registry";
import {
  DEFAULT_FREE_MODEL,
  effectivePref,
  freeCoolingDown,
  freeModel,
  isFree,
  markFreeUnavailable,
  mentionsSensitive,
  resetFreeCooldown,
  resolveModel,
} from "@/server/agents/routing";

const base = {
  agentId: "github",
  pref: null as string | null,
  routable: true,
  defaultModel: MODELS.sonnet as string,
  tier: "simple" as "simple" | "reasoning" | null,
  hasKey: true,
  coolingDown: false,
  privateTainted: false,
  privateOk: false,
};
const free = DEFAULT_FREE_MODEL;

describe("resolveModel", () => {
  beforeEach(() => void delete process.env.TEST_FREE);

  it("orchestrator is always Opus", () => {
    expect(resolveModel({ ...base, agentId: "orchestrator", pref: "free" })).toMatchObject({ model: MODELS.opus, mode: null });
  });
  it("no key keeps the agent default", () => {
    for (const pref of [null, "auto", "free"]) expect(resolveModel({ ...base, pref, hasKey: false, defaultModel: MODELS.haiku })).toMatchObject({ model: MODELS.haiku, mode: null });
  });
  it("Auto routes by tier", () => {
    expect(resolveModel(base)).toEqual({ model: free, mode: "auto", reason: "tag simple" });
    expect(resolveModel({ ...base, tier: "reasoning" })).toEqual({ model: MODELS.sonnet, mode: "auto", reason: "tag reasoning" });
    expect(resolveModel({ ...base, tier: null })).toMatchObject({ model: MODELS.sonnet, reason: "no tag" });
    expect(resolveModel({ ...base, coolingDown: true })).toMatchObject({ model: MODELS.sonnet, reason: "free model cooling down" });
  });
  it("Free only pins free and ignores cooldown", () => {
    expect(resolveModel({ ...base, pref: "free", tier: null, coolingDown: true })).toEqual({ model: free, mode: "free", reason: "pinned: free only" });
  });
  it("private taint blocks free unless opted in", () => {
    expect(resolveModel({ ...base, privateTainted: true })).toMatchObject({ model: MODELS.sonnet, mode: "auto", reason: "private data in thread" });
    expect(resolveModel({ ...base, privateTainted: true, pref: "free" }).blocked).toBe("private_blocked");
    expect(resolveModel({ ...base, privateTainted: true, privateOk: true }).model).toBe(free);
  });
  it("Claude pins turn routing off", () => {
    expect(resolveModel({ ...base, pref: MODELS.opus })).toMatchObject({ model: MODELS.opus, mode: null });
    expect(resolveModel({ ...base, pref: MODELS.sonnet })).toMatchObject({ model: MODELS.sonnet, mode: null });
  });
  it("non-routable agents ignore auto/free", () => {
    expect(resolveModel({ ...base, routable: false, pref: "auto" })).toMatchObject({ model: MODELS.sonnet, mode: null });
    expect(resolveModel({ ...base, routable: false, pref: "free" })).toMatchObject({ model: MODELS.sonnet, mode: null });
  });
  it("effectivePref", () => {
    expect(effectivePref({ pref: null, routable: true, hasKey: true, defaultModel: MODELS.sonnet })).toBe("auto");
    expect(effectivePref({ pref: null, routable: true, hasKey: false, defaultModel: MODELS.sonnet })).toBe(MODELS.sonnet);
  });
});

describe("free model config and cooldown", () => {
  it("env override and :free detection", () => {
    expect(freeModel()).toBe(DEFAULT_FREE_MODEL);
    process.env.TEST_FREE = "a/b:free";
    expect(freeModel()).toBe("a/b:free");
    delete process.env.TEST_FREE;
    expect(isFree(DEFAULT_FREE_MODEL)).toBe(true);
    expect(isFree(MODELS.sonnet)).toBe(false);
  });
  it("cools down for 5 minutes", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    resetFreeCooldown();
    markFreeUnavailable(now);
    expect(freeCoolingDown(new Date(now.getTime() + 4 * 60_000))).toBe(true);
    expect(freeCoolingDown(new Date(now.getTime() + 6 * 60_000))).toBe(false);
  });
});

describe("mentionsSensitive", () => {
  const msgs = [
    { role: "user", content: "hi" },
    { role: "assistant", content: [{ type: "tool_use", id: "1", name: "x", input: { repo: "Me/Secret" } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "1", content: [{ type: "text", text: "ok" }] }] },
  ];
  it("matches case-insensitively in any block", () => {
    expect(mentionsSensitive(msgs, ["me/secret"])).toBe(true);
    expect(mentionsSensitive(msgs, ["me/public"])).toBe(false);
    expect(mentionsSensitive([{ role: "user", content: [{ type: "tool_result", tool_use_id: "1", content: "from me/secret#3" }] }], ["me/secret"])).toBe(true);
  });
});

import { z } from "zod";
import { checkFreeTurn, ESCALATE_TOOL, escalateReason } from "@/server/agents/routing";

const tool = { name: "github.list_repos", input: z.object({ q: z.string() }) } as never;
const allowed = { "github.list_repos": tool };
const use = (input: unknown, name = "github_list_repos") => ({ type: "tool_use", id: "t", name, input }) as never;
const txt = (text: string) => ({ type: "text", text }) as never;
const turn = (o: object) => checkFreeTurn({ content: [txt("hello there")], stopReason: "end_turn", allowed, messages: [], toolCount: 1, requiresTools: true, ...o })?.code ?? null;

describe("escalate", () => {
  it("extracts and trims the reason", () => {
    expect(ESCALATE_TOOL.name).toBe("escalate");
    expect(escalateReason([txt("x")])).toBeNull();
    expect(escalateReason([use({ reason: ` ${"a".repeat(300)} ` }, "escalate")])).toHaveLength(200);
    expect(escalateReason([use({}, "escalate")])).toBe("no reason given");
  });
});

describe("checkFreeTurn", () => {
  it("accepts valid tool calls", () => expect(turn({ content: [use({ q: "x" })] })).toBeNull());
  it("invalid_tool_call", () => {
    expect(turn({ content: [use({ q: "x" }, "nope")] })).toBe("invalid_tool_call");
    expect(turn({ content: [use({ q: 1 })] })).toBe("invalid_tool_call");
  });
  it("empty", () => expect(turn({ content: [txt(" ")] })).toBe("empty"));
  it("no_tool_use", () => {
    expect(turn({ toolCount: 0 })).toBe("no_tool_use");
    expect(turn({ toolCount: 0, requiresTools: false })).toBeNull();
  });
  it("unsupported_ref", () => {
    const content = [txt("see me/a#7")];
    expect(turn({ content })).toBe("unsupported_ref");
    const messages = [{ role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "me/a#7 open" }] }];
    expect(turn({ content, messages })).toBeNull();
  });
  it("tool_markup", () => {
    for (const t of ["<tool_call>x", "<function=a>", 'x "tool_calls": []', '{"name": "a"}']) expect(turn({ content: [txt(t)] })).toBe("tool_markup");
  });
  it("repeat", () => {
    const messages = [{ role: "assistant", content: [{ type: "tool_use", id: "p", name: "github_list_repos", input: { q: "x" } }] }];
    expect(turn({ content: [use({ q: "x" })], messages })).toBe("repeat");
  });
  it("truncated", () => expect(turn({ stopReason: "max_tokens" })).toBe("truncated"));
});
