// iCal feed -> RawEvent occurrences (D-04). Reuses the Phase 4 ical.js expansion; no RRULE code here.
import ICAL from "ical.js";
import { isSafeUrl } from "@/lib/safe-url";
import type { RawEvent } from "@/lib/outreach-types";
import { normalizeVevent } from "../calendar/caldav/provider";
import { expand, loadZones } from "../calendar/expand";
import type { StoredEvent } from "../calendar/types";
import { capUtf8, htmlToText } from "../text";

export class FeedError extends Error {
  constructor() {
    super("Feed isn't valid iCal.");
  }
}

const ONLINE = /(^|\.)(zoom\.us|meet\.google\.com|teams\.microsoft\.com)$/i;
const DAY = 86400000;

function hostOnline(u: string | null): boolean {
  try {
    return !!u && ONLINE.test(new URL(u).hostname);
  } catch {
    return false;
  }
}

export function parseFeed(text: string, now: Date, opts: { days?: number; cap?: number } = {}): RawEvent[] {
  const days = opts.days ?? 60;
  const cap = opts.cap ?? 500;
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw new FeedError();
  }
  if (root.name !== "vcalendar") throw new FeedError();
  const zones = loadZones(root);
  const vtz = root.getAllSubcomponents("vtimezone").map((z) => z.toString());
  const rows: StoredEvent[] = [];
  const meta = new Map<string, ICAL.Component>();
  // ponytail: RECURRENCE-ID overrides are skipped (feeds are mostly single events), handle if a feed needs them.
  for (const v of root.getAllSubcomponents("vevent")) {
    if (v.hasProperty("recurrence-id")) continue;
    try {
      const n = normalizeVevent(v, zones, "", null);
      const id = `f${rows.length}`;
      const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", ...vtz, v.toString(), "END:VCALENDAR"].join("\r\n");
      rows.push({ ...n, id, calendarId: "feed", raw: { ics } });
      meta.set(id, v);
    } catch {
      /* skip unparseable VEVENT */
    }
  }
  const out: RawEvent[] = [];
  for (const i of expand(rows, now, new Date(now.getTime() + days * DAY))) {
    if (out.length >= cap) break;
    const v = meta.get(i.eventId)!;
    const prop = (n: string) => (v.getFirstPropertyValue(n) as string | null) || null;
    const desc = i.description ?? "";
    const link = prop("url") ?? /https:\/\/[^\s<>"')]+/.exec(desc)?.[0] ?? null;
    const url = isSafeUrl(link) ? link : null;
    const geo = v.getFirstPropertyValue("geo") as number[] | null;
    const org = v.getFirstProperty("organizer")?.getParameter("cn") as string | undefined;
    const cats = v.getAllProperties("categories").flatMap((p) => p.getValues().map(String));
    out.push({
      remoteId: i.recurring ? `${i.remoteId}@${i.start.toISOString()}` : i.remoteId,
      title: i.title.slice(0, 200),
      startAt: i.start,
      endAt: i.end > i.start ? i.end : null,
      allDay: i.allDay,
      timeZone: i.tz,
      location: i.location,
      lat: geo && Number.isFinite(+geo[0]!) ? +geo[0]! : null,
      lng: geo && Number.isFinite(+geo[1]!) ? +geo[1]! : null,
      online: !i.location && (hostOnline(url) || /https:\/\/[^\s]*(zoom\.us|meet\.google\.com|teams\.microsoft\.com)/i.test(desc)),
      organizer: org ?? null,
      priceText: null,
      url,
      description: capUtf8(htmlToText(desc), 4000).text,
      categories: cats.slice(0, 10),
    });
  }
  return out;
}
