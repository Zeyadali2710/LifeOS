import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OutreachEventDTO } from "@/lib/outreach-types";
import { canMove, STAGE_ORDER } from "@/lib/outreach-types";
import { discoverEvents, gmailThread, type DiscoveryFilters } from "@/features/outreach/model";
import { followUpDue, timeRange } from "@/features/outreach/fmt";
import { EventCard, Pipeline } from "@/features/outreach/events";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/shell/shell-provider", () => ({ useShell: () => ({ toast: vi.fn() }) }));
vi.mock("@/server/outreach-pipeline-actions", () => ({ moveStageAction: vi.fn(), addToCalendarAction: vi.fn(), createFollowUpsAction: vi.fn(), dismissEventAction: vi.fn(), restoreEventAction: vi.fn() }));
vi.mock("@/server/outreach-actions", () => ({ importEventUrlAction: vi.fn() }));

const NOW = "2026-10-22T00:00:00Z";
const event = (patch: Partial<OutreachEventDTO> = {}): OutreachEventDTO => ({
  id: "e", title: "Sydney AI meetup", startAt: "2026-10-24T07:00:00Z", endAt: "2026-10-24T09:00:00Z", allDay: false, timeZone: "Australia/Sydney", location: "Harbour venue", online: false, organizer: "Builders", priceText: "Free", url: null, description: "Talks", categories: ["AI", "Networking"], isMock: false, sourceKinds: ["ics"], score: 90, signals: [{ label: "INTERESTS", value: 1, max: 1, terms: ["AI"] }], why: "Matches AI interests", stage: null, calendarEventId: null, dismissedAt: null, ...patch,
});
const filters: DiscoveryFilters = { q: "", cat: "All", when: "any", free: false, sort: "score", interests: [] };

describe("Outreach discovery", () => {
  it("counts categories before the category filter, after search and free filters", () => {
    const result = discoverEvents([event(), event({ id: "design", categories: ["Design"], score: 70 }), event({ id: "paid", priceText: "$25" })], { ...filters, cat: "AI", free: true, q: "Builders" }, NOW);
    expect(result.items.map((e) => e.id)).toEqual(["e"]);
    expect(result.counts).toMatchObject({ All: 2, AI: 1, Design: 1, Networking: 1 });
  });
  it("uses Sydney week and weekend boundaries, including Sunday itself", () => {
    const items = [event({ id: "sun", startAt: "2026-10-25T07:00:00Z", endAt: null }), event({ id: "mon", startAt: "2026-10-26T07:00:00Z", endAt: null })];
    expect(discoverEvents(items, { ...filters, when: "week" }, NOW).items.map((e) => e.id)).toEqual(["sun"]);
    expect(discoverEvents(items, { ...filters, when: "weekend" }, "2026-10-25T00:00:00Z").items.map((e) => e.id)).toEqual(["sun"]);
  });
  it("filters finished events and later pipeline stages; retains an ongoing event", () => {
    const items = [event(), event({ id: "past", endAt: "2026-10-21T00:00:00Z" }), event({ id: "attended", stage: "ATTENDED" }), event({ id: "ongoing", startAt: "2026-10-21T23:00:00Z", endAt: "2026-10-22T01:00:00Z" })];
    expect(discoverEvents(items, filters, NOW).items.map((e) => e.id)).toEqual(["ongoing", "e"]);
  });
  it("sorts soonest and matches interests case-insensitively", () => {
    const items = [event({ id: "later", score: 100, startAt: "2026-10-29T07:00:00Z", endAt: null }), event()];
    expect(discoverEvents(items, { ...filters, sort: "date", interests: ["ai"] }, NOW).items.map((e) => e.id)).toEqual(["e", "later"]);
    expect(discoverEvents(items, { ...filters, interests: ["Design"] }, NOW).items).toHaveLength(0);
  });
});

describe("Outreach event behavior", () => {
  it("locks ordered steps and mock calendar writes", () => {
    const html = renderToStaticMarkup(createElement(EventCard, { event: event(), calendars: [], defaultCalendarId: null }));
    expect(html).toContain('title="Save it first"');
    expect(html).toContain('title="Mark Attending first"');
    expect((html.match(/disabled=""/g) ?? []).length).toBe(3);
    const mock = renderToStaticMarkup(createElement(EventCard, { event: event({ stage: "ATTENDING", isMock: true }), calendars: [], defaultCalendarId: null }));
    expect(mock).toContain("Mock events can&#x27;t go on your calendar.");
    expect((mock.match(/aria-pressed="true"/g) ?? []).length).toBe(3);
  });
  it("undoes any reached action by exactly one step", () => {
    for (const stage of STAGE_ORDER.slice(1)) {
      const previous = STAGE_ORDER[STAGE_ORDER.indexOf(stage) - 1]!;
      expect(canMove(stage, previous)).toBe(true);
    }
  });
  it("renders all six pipeline stages, including discovered and follow-up", () => {
    const html = renderToStaticMarkup(createElement(Pipeline, { events: [event()] }));
    for (const name of ["Discovered", "Saved", "Interested", "Attending", "Attended", "Follow up"]) expect(html).toContain(name);
  });
  it("keeps Sydney times and follow-up due dates across month boundaries", () => {
    expect(timeRange(event())).toBe("18:00–20:00");
    expect(followUpDue(event({ startAt: "2026-10-31T12:00:00Z", endAt: null }))).toBe("2026-11-02");
  });
  it("opens Gmail in the receiving account and rejects unsafe thread identifiers", () => {
    expect(gmailThread("owner+studio@example.com", "abc123")).toBe("https://mail.google.com/mail/?authuser=owner%2Bstudio%40example.com#inbox/abc123");
    expect(gmailThread(null, "abc")).toContain("/u/0/#inbox/abc");
    expect(gmailThread(null, "../bad")).toBeNull();
  });
});
