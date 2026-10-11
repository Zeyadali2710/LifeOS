import { z } from "zod";

// Single source for calendar event payloads (agent approvals + owner EventDialog). Client-safe.
const eventBase = z.object({
  title: z.string().trim().min(1, "Add a title.").max(200, "Title must be 200 characters or fewer."),
  start: z.string(), // ISO instant, or YYYY-MM-DD when allDay
  end: z.string(), // all-day end is an exclusive date
  allDay: z.boolean().default(false),
  timeZone: z.string().default("Australia/Sydney"),
  location: z.string().max(300).default(""),
  description: z.string().max(8000).default(""),
  showAs: z.enum(["busy", "free"]).default("busy"),
});

type Range = { start: string; end: string; allDay: boolean };
// Timed values must carry an offset: an offset-less time is read as server-local by the approval card but as
// timeZone-local by Google, so the owner could approve one time and get another (CR-A04).
const instant = z.iso.datetime({ offset: true });
const okTime = (s: string, allDay: boolean) => (allDay ? /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) : instant.safeParse(s).success);
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
  etag: z.string().nullable(),
  scope: z.enum(["this", "following", "all"]),
  instanceStart: z.string().nullable(),
};

// Agent create is non-recurring (no repeat field).
export const eventCreatePayload = eventBase.extend(target).superRefine(checkRange);

const before = z.object({
  title: z.string(),
  start: z.string(),
  end: z.string(),
  allDay: z.boolean(),
  location: z.string(),
  description: z.string(),
  showAs: z.string(),
});
export const eventUpdatePayload = eventBase
  .extend(target)
  .extend({ ...instance, before })
  .superRefine(checkRange);

export const eventDeletePayload = z.object({
  ...target,
  ...instance,
  title: z.string().max(200),
  start: z.string(),
  end: z.string(),
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
