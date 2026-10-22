import { describe, expect, it } from "vitest";
import { skip, skippedFor, unskip, type SkipStorage } from "@/features/organization/plan-skips";

function fake(): SkipStorage & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

describe("plan skips", () => {
  it("adds, removes and keeps only today's key", () => {
    const s = fake();
    skip("2026-10-07", "a", s);
    skip("2026-10-08", "b", s);
    expect([...s.m.keys()]).toEqual(["lifeos.plan.skipped.2026-10-08"]);
    skip("2026-10-08", "c", s);
    expect([...skippedFor("2026-10-08", s)]).toEqual(["b", "c"]);
    unskip("2026-10-08", "b", s);
    expect([...skippedFor("2026-10-08", s)]).toEqual(["c"]);
  });

  it("ignores bad data and storage failures", () => {
    const s = fake();
    s.m.set("lifeos.plan.skipped.d", "{oops");
    expect(skippedFor("d", s).size).toBe(0);
    const bad: SkipStorage = {
      ...s,
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(skippedFor("d", bad).size).toBe(0);
    expect(() => skip("d", "x", bad)).not.toThrow();
  });
});
