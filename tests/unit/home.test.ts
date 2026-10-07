import { describe, expect, it } from "vitest";
import { dateLine, lead } from "@/server/home";
import type { Health } from "@/server/health";

const h = (o: Partial<Health> = {}): Health => ({ status: "ok", db: "ok", worker: "ok", version: "dev", ...o }) as Health;
const now = new Date("2026-10-07T01:00:00Z");

describe("dateLine", () => {
  it("includes weather when present", () => {
    expect(dateLine(now, { temp: 17, word: "CLEAR" })).toBe("WEDNESDAY, OCTOBER 7 · SYDNEY · 17°C CLEAR");
    expect(dateLine(now, { temp: 17, word: null })).toBe("WEDNESDAY, OCTOBER 7 · SYDNEY · 17°C");
    expect(dateLine(now, null)).toBe("WEDNESDAY, OCTOBER 7");
  });
});

describe("lead", () => {
  it("quiet", () => {
    expect(lead({ unreadImportant: 0, health: h() })).toEqual([
      { text: "Everything is quiet. " },
      { text: "Nothing needs your attention.", strong: true },
    ]);
  });
  it("unread items", () => {
    expect(lead({ unreadImportant: 1, health: h() })).toEqual([
      { text: "1 item needs your attention.", strong: true },
      { text: " Systems are healthy." },
    ]);
    expect(lead({ unreadImportant: 2, health: h({ status: "degraded" }) })).toEqual([
      { text: "2 items need your attention.", strong: true },
      { text: " Systems are degraded." },
    ]);
  });
  it("unhealthy", () => {
    expect(lead({ unreadImportant: 0, health: h({ status: "degraded", worker: "stale" }) })).toEqual([
      { text: "Systems are degraded.", strong: true },
      { text: " Worker is not responding." },
    ]);
    expect(lead({ unreadImportant: 0, health: h({ status: "down", db: "down" }) })[1]).toEqual({ text: " Database is not responding." });
  });
  it("unknown", () => {
    expect(lead({ unreadImportant: 0, health: null })).toEqual([{ text: "System status is unknown.", strong: true }]);
  });
});
