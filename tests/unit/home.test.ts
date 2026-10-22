import { describe, expect, it } from "vitest";
import { homeDateLine } from "@/server/home";

describe("homeDateLine", () => {
  it("weekday day month, Sydney time and zone", () => {
    expect(homeDateLine(new Date("2026-10-21T22:41:00Z"))).toBe("THURSDAY 22 OCTOBER · SYDNEY · 9:41 AEDT");
    expect(homeDateLine(new Date("2026-07-01T02:05:00Z"))).toBe("WEDNESDAY 1 JULY · SYDNEY · 12:05 AEST");
  });
});
