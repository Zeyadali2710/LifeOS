import { describe, expect, it } from "vitest";
import { resolvePolicy } from "@/server/agents/policy";

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
