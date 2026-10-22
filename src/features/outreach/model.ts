import type { OutreachEventDTO } from "@/lib/outreach-types";
import { sydneyYmd } from "./fmt";

export const DISCOVERY_CATEGORIES = ["All", "AI", "Startups", "Design", "Fintech", "Engineering", "Cybersecurity", "Networking"];
export type DiscoveryFilters = { q: string; when: string; cat: string; free: boolean; sort: string; interests: string[] };

export function discoverEvents(events: OutreachEventDTO[], filters: DiscoveryFilters, now: string) {
  const today = Date.parse(`${sydneyYmd(now)}T00:00:00Z`);
  const weekday = new Date(today).getUTCDay();
  const weekEnd = today + (7 - (weekday || 7)) * 86400000;
  const weekendStart = today + ((6 - weekday + 7) % 7) * 86400000;
  const query = filters.q.trim().toLowerCase();
  const base = events.filter((e) => {
    const date = Date.parse(`${sydneyYmd(e.startAt)}T00:00:00Z`);
    const upcoming = Date.parse(e.endAt ?? new Date(Date.parse(e.startAt) + 86400000).toISOString()) >= Date.parse(now);
    const when = filters.when === "week" ? date <= weekEnd : filters.when === "weekend" ? date >= (weekday === 0 ? today : weekendStart) && date <= (weekday === 0 ? today : weekendStart + 86400000) : filters.when === "month" ? date <= today + 30 * 86400000 : true;
    return upcoming && !["ATTENDED", "FOLLOW_UP"].includes(e.stage ?? "") && when
      && (!filters.free || /^free\b|^\$?0(?:\.00)?$/i.test(e.priceText?.trim() ?? ""))
      && (!query || [e.title, e.location, e.organizer, ...e.categories].join(" ").toLowerCase().includes(query))
      && (!filters.interests.length || e.signals.some((s) => s.label === "INTERESTS" && s.terms.some((t) => filters.interests.some((i) => i.toLowerCase() === t.toLowerCase()))));
  });
  const items = base.filter((e) => filters.cat === "All" || e.categories.some((c) => c.toLowerCase() === filters.cat.toLowerCase()));
  items.sort((a, b) => filters.sort === "date" ? Date.parse(a.startAt) - Date.parse(b.startAt) : b.score - a.score || Date.parse(a.startAt) - Date.parse(b.startAt));
  return { items, counts: Object.fromEntries(DISCOVERY_CATEGORIES.map((c) => [c, c === "All" ? base.length : base.filter((e) => e.categories.some((x) => x.toLowerCase() === c.toLowerCase())).length])) };
}

export const gmailThread = (mailbox: string | null | undefined, thread: string) => /^[a-zA-Z0-9]+$/.test(thread)
  ? `https://mail.google.com/mail/${mailbox ? `?authuser=${encodeURIComponent(mailbox)}` : "u/0/"}#inbox/${thread}` : null;
