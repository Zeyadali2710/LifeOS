import { describe, expect, it } from "vitest";
import { goalInput, goalProgress, goalsHeadline, horizonOf, isNeglected, momentum, objectiveInput, objectiveProgress } from "@/lib/goals";

describe("goal rules", () => {
  it("derives momentum from the two 14-day windows", () => {
    expect(momentum(0, 0)).toBe("quiet");
    expect(momentum(3, 1)).toBe("rising");
    expect(momentum(1, 3)).toBe("slowing");
    expect(momentum(2, 2)).toBe("steady");
  });

  it("measures objectives and goals without inventing progress", () => {
    expect(objectiveProgress(null, 0, 0, "active")).toBeNull();
    expect(objectiveProgress(null, 1, 3, "active")).toBe(33);
    expect(objectiveProgress(70, 0, 4, "active")).toBe(70);
    expect(objectiveProgress(null, 0, 0, "done")).toBe(100);
    expect(goalProgress([null, null])).toBeNull();
    expect(goalProgress([50, null, 100])).toBe(75);
  });

  it("flags neglect only for active work after 21 days", () => {
    const now = new Date("2026-10-30T00:00:00Z");
    expect(isNeglected(new Date("2026-10-08T00:00:00Z"), now, true)).toBe(true);
    expect(isNeglected(new Date("2026-10-10T00:00:00Z"), now, true)).toBe(false);
    expect(isNeglected(new Date("2026-01-01T00:00:00Z"), now, false)).toBe(false);
  });

  it("buckets target dates by Sydney horizon, weeks ending Sunday", () => {
    const today = "2026-10-15"; // Thursday
    expect(horizonOf("2026-10-01", today)).toBe("week"); // overdue
    expect(horizonOf("2026-10-18", today)).toBe("week"); // Sunday
    expect(horizonOf("2026-10-19", today)).toBe("month");
    expect(horizonOf("2026-12-31", today)).toBe("year");
    expect(horizonOf("2027-01-01", today)).toBe("long");
    expect(horizonOf(null, today)).toBe("long");
    expect(horizonOf("2026-10-18", "2026-10-18")).toBe("week"); // Sunday itself
  });

  it("writes an honest headline", () => {
    expect(goalsHeadline([])).toBe("Set a direction.");
    expect(goalsHeadline([{ momentum: "rising" }, { momentum: "quiet" }, { momentum: "rising" }])).toBe("Momentum is up on 2 of 3 goals.");
    expect(goalsHeadline([{ momentum: "steady" }])).toBe("Momentum is up on 0 of 1 goal.");
  });

  it("validates inputs", () => {
    expect(goalInput.safeParse({ title: "x", color: "red" }).success).toBe(false);
    expect(goalInput.safeParse({ title: "x", targetDate: "2026-02-30" }).success).toBe(false);
    expect(goalInput.safeParse({ title: "x", targetDate: "2028-02-29" }).success).toBe(true);
    expect(objectiveInput.safeParse({ goalId: "nope", title: "x" }).success).toBe(false);
    expect(objectiveInput.safeParse({ goalId: "9f1c3c2e-4b7a-4c55-9a51-1f7e3b2a6d10", title: "x", progress: 101 }).success).toBe(false);
  });
});
