import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FeedError, parseFeed } from "@/server/outreach/ics";

const fx = (n: string) => readFileSync(`tests/fixtures/outreach/${n}`, "utf8");
const now = new Date("2026-10-14T00:00:00+11:00");

describe("parseFeed", () => {
  const evs = parseFeed(fx("luma-sydney.ics"), now);
  it("returns in-window events only", () => {
    expect(evs.map((e) => e.remoteId)).toEqual(["a1@sample", "a2@sample", "a3@sample"]);
  });
  it("url from URL property, else https link in DESCRIPTION", () => {
    expect(evs[0]!.url).toBe("https://example.com/e/a1");
    expect(evs[1]!.url).toBe("https://example.com/e/a2");
  });
  it("geo, organizer, categories, location", () => {
    expect(evs[0]).toMatchObject({ lat: -33.87, lng: 151.2, organizer: "Sample Org", categories: ["AI", "Startups"], location: "Sample Hall, Sydney", online: false });
  });
  it("online when no location and a zoom link", () => {
    expect(evs[2]!.online).toBe(true);
  });
  it("expands weekly RRULE inside 60 days with distinct remoteIds", () => {
    const r = parseFeed(fx("meetup-group.ics"), now);
    expect(r.length).toBeGreaterThanOrEqual(8);
    expect(r.length).toBeLessThanOrEqual(10);
    expect(new Set(r.map((e) => e.remoteId)).size).toBe(r.length);
    expect(r[0]!.remoteId).toBe(`weekly@sample@${r[0]!.startAt.toISOString()}`);
    expect(r.every((e) => e.startAt.getTime() < now.getTime() + 60 * 86400000)).toBe(true);
  });
  it("caps at 500 per feed", () => {
    const one = (i: number) => `BEGIN:VEVENT\r\nUID:u${i}\r\nDTSTART:20261101T000000Z\r\nSUMMARY:e${i}\r\nEND:VEVENT\r\n`;
    const feed = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${Array.from({ length: 600 }, (_, i) => one(i)).join("")}END:VCALENDAR\r\n`;
    expect(parseFeed(feed, now)).toHaveLength(500);
  });
  it("throws FeedError on garbage", () => {
    expect(() => parseFeed("not ical", now)).toThrow(FeedError);
    expect(() => parseFeed("not ical", now)).toThrow("Feed isn't valid iCal.");
  });
  it("skips RECURRENCE-ID overrides", () => {
    const f = fx("meetup-group.ics").replace("END:VCALENDAR", "BEGIN:VEVENT\r\nUID:weekly@sample\r\nRECURRENCE-ID;TZID=Australia/Sydney:20261021T190000\r\nDTSTART;TZID=Australia/Sydney:20261021T200000\r\nSUMMARY:moved\r\nEND:VEVENT\r\nEND:VCALENDAR");
    expect(parseFeed(f, now).some((e) => e.title === "moved")).toBe(false);
  });
});
