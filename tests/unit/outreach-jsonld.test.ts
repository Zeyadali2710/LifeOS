import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractEvent } from "@/server/outreach/jsonld";

const fx = (n: string) => readFileSync(`tests/fixtures/outreach/${n}`, "utf8");
const U = "https://example.com/page";
const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const base = { "@type": "Event", name: "N", startDate: "2026-11-01T10:00:00Z" };

describe("extractEvent", () => {
  it("eventbrite-style page", () => {
    const e = extractEvent(fx("eventbrite-page.html"), U)!;
    expect(e).toMatchObject({
      title: "Sample: Tech Mixer", location: "Sample Venue, 1 Test St, Sydney, NSW", lat: -33.87, lng: 151.2,
      priceText: "Free", organizer: "Sample Org", remoteId: U, online: false, url: "https://example.com/e/mixer",
    });
    expect(e.startAt.toISOString()).toBe("2026-11-12T07:00:00.000Z");
    expect(e.endAt).not.toBeNull();
  });
  it("humanitix-style @graph, array @type, offers array, tolerates broken block first", () => {
    const e = extractEvent(fx("humanitix-page.html"), U)!;
    expect(e).toMatchObject({ title: "Sample: Business Breakfast", priceText: "From $25", url: "https://example.com/e/breakfast" });
  });
  it("online attendance mode / VirtualLocation", () => {
    expect(extractEvent(fx("humanitix-page.html"), U)!.online).toBe(true);
    expect(extractEvent(ld({ ...base, eventAttendanceMode: "OnlineEventAttendanceMode" }), U)!.online).toBe(true);
  });
  it("null without an Event", () => {
    expect(extractEvent(fx("no-jsonld.html"), U)).toBeNull();
    expect(extractEvent(ld({ "@type": "Organization", name: "x" }), U)).toBeNull();
    expect(extractEvent(ld({ "@type": "Event", name: "x" }), U)).toBeNull();
    expect(extractEvent(ld({ ...base, startDate: "nope" }), U)).toBeNull();
  });
  it("decodes entities and caps description", () => {
    expect(extractEvent(ld({ ...base, description: "a &amp; b" }), U)!.description).toBe("a & b");
    expect(extractEvent(ld({ ...base, description: "x".repeat(9000) }), U)!.description).toHaveLength(4000);
  });
  it("unsafe url falls back to page url", () => {
    expect(extractEvent(ld({ ...base, url: "javascript:alert(1)" }), U)!.url).toBe(U);
    expect(extractEvent(ld({ ...base, url: "http://example.com/x" }), U)!.url).toBe(U);
  });
  it("price variants", () => {
    expect(extractEvent(ld({ ...base, offers: { price: 12 } }), U)!.priceText).toBe("$12");
    expect(extractEvent(ld(base), U)!.priceText).toBeNull();
  });
});
