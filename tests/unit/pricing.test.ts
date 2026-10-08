import { describe, expect, it } from "vitest";
import { formatDuration, formatTokens, formatUsd } from "@/lib/format";
import { costUsd, sydneyMonthBounds } from "@/server/agents/pricing";

const z = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };

describe("costUsd", () => {
  it("prices each token class", () => {
    expect(costUsd("claude-opus-5-5", { ...z, input: 1e6 })).toBe(4);
    expect(costUsd("claude-sonnet-5-5", { ...z, output: 1e6 })).toBe(10);
    expect(costUsd("claude-haiku-4-5-20251001", { ...z, cacheRead: 1e6 })).toBeCloseTo(0.1);
    expect(costUsd("claude-opus-5-5", { ...z, cacheRead: 1e6 })).toBeCloseTo(0.2);
    expect(costUsd("claude-sonnet-5-5", { ...z, cacheWrite: 1e6 })).toBe(2.5);
  });
  it("falls back to Opus prices for unknown models", () => {
    expect(costUsd("mystery", { ...z, input: 1e6 })).toBe(4);
  });
  it("prices :free at $0 unless the provider reports cost", () => {
    const u = { ...z, input: 1e6, output: 1e6 };
    expect(costUsd("vendor/x:free", u)).toBe(0);
    expect(costUsd("vendor/x:free", { ...u, providerCostUsd: 0.01 })).toBe(costUsd("claude-opus-5-5", u));
    expect(costUsd("vendor/x", u)).toBe(costUsd("claude-opus-5-5", u));
  });
});

describe("sydneyMonthBounds", () => {
  it("handles AEST->AEDT in October", () => {
    const b = sydneyMonthBounds(new Date("2026-10-15T00:00:00Z"));
    expect(b.start.toISOString()).toBe("2026-09-30T14:00:00.000Z");
    expect(b.end.toISOString()).toBe("2026-10-31T13:00:00.000Z");
    expect(b.key).toBe("2026-10");
    expect(b.label).toBe("OCTOBER 2026");
  });
  it("handles AEDT->AEST in April", () => {
    const b = sydneyMonthBounds(new Date("2026-04-15T00:00:00Z"));
    expect(b.start.toISOString()).toBe("2026-03-31T13:00:00.000Z");
    expect(b.end.toISOString()).toBe("2026-04-30T14:00:00.000Z");
  });
  it("rolls December into January", () => {
    const b = sydneyMonthBounds(new Date("2026-12-15T00:00:00Z"));
    expect(b.end.toISOString()).toBe("2026-12-31T13:00:00.000Z");
  });
});

describe("format", () => {
  it("formats usd, tokens, duration", () => {
    expect(formatUsd(0.0431)).toBe("US$0.043");
    expect(formatUsd(0.0004)).toBe("<US$0.001");
    expect(formatUsd(4.82)).toBe("US$4.82");
    expect(formatTokens(18400)).toBe("18.4k");
    expect(formatTokens(900)).toBe("900");
    expect(formatDuration(1800)).toBe("1.8s");
    expect(formatDuration(112000)).toBe("1m 52s");
  });
});
