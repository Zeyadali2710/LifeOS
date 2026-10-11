import { z } from "zod";

/** True for a zone Intl knows (IANA). Bounded so a huge string never reaches Intl. */
export function isTimeZone(tz: string | null | undefined): tz is string {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
export const timeZone = z.string().max(64).refine(isTimeZone, "Unknown time zone.");
// ISO instant with offset, or YYYY-MM-DD: both fit in 40 chars. Format is checked by checkRange.
const when = z.string().max(40);

// Single source for calendar event payloads (agent approvals + owner EventDialog). Client-safe.
const eventBase = z.object({
  title: z.string().trim().min(1, "Add a title.").max(200, "Title must be 200 characters or fewer."),
  start: when, // ISO instant, or YYYY-MM-DD when allDay
  end: when, // all-day end is an exclusive date
  allDay: z.boolean().default(false),
  timeZone: timeZone.default("Australia/Sydney"),
  location: z.string().max(300).default(""),
  description: z.string().max(8000).default(""),
  showAs: z.enum(["busy", "free"]).default("busy"),
});

type Range = { start: string; end: string; allDay: boolean };
// Timed values must carry an offset: an offset-less time is read as server-local by the approval card but as
// timeZone-local by Google, so the owner could approve one time and get another (CR-A04).
const instant = z.iso.datetime({ offset: true });
const ymd = z.iso.date(); // rejects impossible dates like 2026-02-31, which Date.parse rolls over
const okTime = (s: string, allDay: boolean) => (allDay ? ymd : instant).safeParse(s).success;
const checkRange = (v: Range, ctx: z.RefinementCtx) => {
  if (!v.start) return void ctx.addIssue({ code: "custom", path: ["start"], message: "Pick a start date." });
  const message = v.allDay ? "Use a YYYY-MM-DD date." : "Use an ISO time with a UTC offset.";
  const malformed = (["start", "end"] as const).filter((k) => v[k] && !okTime(v[k], v.allDay));
  for (const k of malformed) ctx.addIssue({ code: "custom", path: [k], message });
  if (malformed.length) return;
  const bad = v.allDay ? v.end <= v.start : !(Date.parse(v.end) > Date.parse(v.start));
  if (bad) ctx.addIssue({ code: "custom", path: ["end"], message: "End must be after start." });
};

export const eventFields = eventBase.superRefine(checkRange);

const target = {
  calendarId: z.uuid({ message: "Pick a calendar." }),
  calendarLabel: z.string().max(200),
  provider: z.enum(["google", "icloud"]),
};
const instance = {
  eventId: z.uuid(),
  etag: z.string().max(512).nullable(),
  scope: z.enum(["this", "following", "all"]),
  instanceStart: when.nullable(),
};

// Agent create is non-recurring (no repeat field).
export const eventCreatePayload = eventBase.extend(target).superRefine(checkRange);

// Server-built from the stored event (provider text may exceed the edit limits), so caps are generous but bounded.
const before = z.object({
  title: z.string().max(1000),
  start: when,
  end: when,
  allDay: z.boolean(),
  location: z.string().max(1000),
  description: z.string().max(16000),
  showAs: z.string().max(10),
});
export const eventUpdatePayload = eventBase
  .extend(target)
  .extend({ ...instance, before })
  .superRefine(checkRange);

export const eventDeletePayload = z.object({
  ...target,
  ...instance,
  title: z.string().max(200),
  start: when,
  end: when,
  allDay: z.boolean(),
});

// Owner EventDialog / server actions.
export const eventInput = eventBase
  .extend({
    calendarId: z.uuid({ message: "Pick a calendar." }),
    repeat: z.enum(["none", "daily", "weekly", "monthly", "yearly", "custom"]).default("none"),
  })
  .superRefine(checkRange);

export type EventCreatePayload = z.infer<typeof eventCreatePayload>;
export type EventUpdatePayload = z.infer<typeof eventUpdatePayload>;
export type EventDeletePayload = z.infer<typeof eventDeletePayload>;
export type EventInput = z.infer<typeof eventInput>;
