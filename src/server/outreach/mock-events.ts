// Fixtures for the clearly-labelled MOCK providers (ADR-010). Generic names only.
import type { EventSourceKind, RawEvent } from "@/lib/outreach-types";
import { sydneyInstant, sydneyParts } from "../time";

const PLAN: Record<string, [days: number, title: string, desc: string, cats: string[]][]> = {
  eventbrite: [
    [3, "Sample: Startup founders mixer", "Meet founders and early-stage builders over drinks.", ["Startups", "Networking"]],
    [9, "Sample: Intro to cybersecurity careers", "Panel on breaking into security.", ["Cybersecurity"]],
    [17, "Sample: Fintech product night", "Talks on payments and lending products.", ["Fintech"]],
  ],
  luma: [
    [5, "Sample: AI builders demo night", "Short demos of AI projects.", ["AI"]],
    [12, "Sample: Engineering leadership fireside", "Chat with engineering leaders.", ["Engineering"]],
  ],
  meetup_mock: [
    [4, "Sample: Computer science study group", "Weekly algorithms practice.", ["Computer Science"]],
    [11, "Sample: Entrepreneurship coffee meetup", "Casual coffee for aspiring entrepreneurs.", ["Entrepreneurship", "Networking"]],
    [20, "Sample: Open source evening", "Hack on open source together.", ["Engineering"]],
  ],
  humanitix_mock: [
    [6, "Sample: Community networking night", "Meet people across tech and business.", ["Networking"]],
    [14, "Sample: Women in tech talks", "Lightning talks and Q&A.", ["Technology"]],
  ],
};

export function mockEvents(kind: EventSourceKind, now: Date): RawEvent[] {
  const base = sydneyParts(now);
  return (PLAN[kind] ?? []).map(([days, title, description, categories], i) => {
    const d = new Date(Date.UTC(base.year, base.month - 1, base.day + days));
    const startAt = sydneyInstant(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 18, 30);
    return {
      remoteId: `mock-${kind}-${i + 1}`,
      title,
      startAt,
      endAt: new Date(startAt.getTime() + 2 * 3600000),
      allDay: false,
      timeZone: "Australia/Sydney",
      location: "Sample venue, Sydney NSW",
      lat: null,
      lng: null,
      online: false,
      organizer: "Sample organiser",
      priceText: "Free",
      url: null,
      description,
      categories,
    };
  });
}
