import { describe, expect, it } from "vitest";
import { resolvePolicy, withContentFloor } from "@/server/agents/policy";

describe("resolvePolicy", () => {
  it("never lowers HIGH_RISK", () => {
    expect(resolvePolicy("HIGH_RISK", "READ")).toBe("HIGH_RISK");
    expect(resolvePolicy("HIGH_RISK", null)).toBe("HIGH_RISK");
    expect(resolvePolicy("HIGH_RISK", "EXECUTE")).toBe("HIGH_RISK");
  });
  it("lets overrides win otherwise, including raising", () => {
    expect(resolvePolicy("APPROVE", "READ")).toBe("READ");
    expect(resolvePolicy("READ", "HIGH_RISK")).toBe("HIGH_RISK");
    expect(resolvePolicy("APPROVE", null)).toBe("APPROVE");
    expect(resolvePolicy("APPROVE", undefined)).toBe("APPROVE");
  });
});

describe("withContentFloor", () => {
  it("raises side-effect tools to APPROVE after content, never lowers", () => {
    for (const t of ["READ", "PREPARE", "EXECUTE"] as const) expect(withContentFloor(t, true, true)).toBe("APPROVE");
    expect(withContentFloor("HIGH_RISK", true, true)).toBe("HIGH_RISK");
    expect(withContentFloor("APPROVE", true, true)).toBe("APPROVE");
  });
  it("leaves side-effect-free tools and content-free runs alone", () => {
    expect(withContentFloor("EXECUTE", false, true)).toBe("EXECUTE");
    expect(withContentFloor("EXECUTE", true, false)).toBe("EXECUTE");
  });
});

describe("limitsFor", () => {
  it("gives projects a larger budget and everyone else RUN_LIMITS", async () => {
    const { limitsFor, getAgent, RUN_LIMITS } = await import("@/server/agents/registry");
    expect(limitsFor(getAgent("projects"))).toEqual({ toolCalls: 16, tokens: 150_000, activeMs: 240_000, turnMaxTokens: 8192 });
    expect(limitsFor(getAgent("organization"))).toEqual(RUN_LIMITS);
    expect(limitsFor(undefined)).toEqual(RUN_LIMITS);
  });
});
