import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveCalendarSecret } from "@/server/calendar/connections";
import { GMAIL_COMPOSE, GMAIL_READ } from "@/server/calendar/google/client";
import type { CalendarProvider, NormalizedEvent } from "@/server/calendar/types";
import { activityEvents, auditLog, calendarEvents, calendars, connections, mailMessages, notifications, settings } from "@/server/db/schema";
import { fakeCalendarProvider, type FakeCalendarProvider } from "../helpers/fake-calendar";
import { fakeGmail, type FakeMsg } from "../helpers/fake-gmail";
import { scriptedLlm } from "../helpers/fake-llm";
import { setupTestDb } from "./helpers";

process.env.DATABASE_URL ??= "postgres://unused/unused";
process.env.BETTER_AUTH_SECRET ??= "x".repeat(32);
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.LIFEOS_MASTER_KEY ??= randomBytes(32).toString("base64");
const t = setupTestDb();
let current: CalendarProvider;
vi.mock("@/server/calendar/providers", () => ({ providerFor: async () => current }));

import { ROSTER_CONFIG_KEY, rosterWeekKey } from "@/server/roster/apply";
import { runTriage, TRIAGE_GAVE_UP } from "@/server/mail/triage";

const key = randomBytes(32);
const NOW = new Date("2026-09-20T00:00:00Z");
const NEW = "Aro Pty Ltd: Roster for 21/09/2026 - 27/09/2026 (ID126_10035)";
const UPD = "Aro Pty Ltd: UPDATED ROSTER for 21/09/2026 - 27/09/2026 (ID126_10042)";
const html = (f: string) => readFileSync(`tests/fixtures/roster/${f}`, "utf8");

const ev = (remoteId: string, w: { title: string; start: string; end: string; location: string; description: string }): NormalizedEvent => ({
  remoteId, url: null, etag: `"${remoteId}-${Math.random()}"`, title: w.title, description: w.description, location: w.location,
  startAt: new Date(w.start), endAt: new Date(w.end), allDay: false, startDate: null, endDate: null, tz: "Australia/Sydney",
  recurrence: null, recurringRemoteId: null, originalStart: null, status: "confirmed", transparency: "opaque", declined: false, raw: {},
});

let fake: FakeCalendarProvider;
const provider = () =>
  fakeCalendarProvider("google", {
    calendars: [],
    results: {},
    create: async (_c, w, o) => ({ upserts: [ev(o!.remoteId!, w)], deletes: [] }),
    update: async (_c, s, w) => ({ upserts: [ev(s.remoteId, w)], deletes: [] }),
    remove: async (_c, s) => ({ upserts: [], deletes: [s.remoteId] }),
  });

let mailbox: FakeMsg[] = [];
let calA = "";
let calB = "";
let n = 0;
async function rosterMail(subject: string, file: string, at: Date, from = "rosters@burps.com.au") {
  const id = `r${++n}`;
  mailbox.push({ id, threadId: id, labelIds: ["INBOX"], snippet: "", internalDate: String(+at), historyId: "1", payload: { mimeType: "text/html", headers: [], body: { data: Buffer.from(html(file)).toString("base64url") } } });
  const [r] = await t.handle().insert(mailMessages).values({ gmailId: id, threadId: id, fromAddress: from, subject, receivedAt: at, labelIds: ["INBOX"] }).returning();
  return r!;
}
const config = (o: object = {}) =>
  t.handle().insert(settings).values({ key: ROSTER_CONFIG_KEY, value: { enabled: true, calendarId: calA, sender: "rosters@burps.com.au", branches: { "TG Warring": "TG Warringah" }, ...o } })
    .onConflictDoUpdate({ target: settings.key, set: { value: { enabled: true, calendarId: calA, sender: "rosters@burps.com.au", branches: { "TG Warring": "TG Warringah" }, ...o } } });
const llm = scriptedLlm([]);
const enqueue = vi.fn(async () => undefined);
const triage = () => runTriage({ handle: t.handle(), llm, fetch: fakeGmail({ messages: mailbox }), now: () => NOW, key, enqueue });
const events = () => t.handle().select().from(calendarEvents).orderBy(calendarEvents.startAt);
const mail = async (id: string) => (await t.handle().select().from(mailMessages).where(eq(mailMessages.id, id)))[0]!;

beforeEach(async () => {
  const h = t.handle();
  for (const tb of [mailMessages, settings, connections, notifications, activityEvents, auditLog]) await h.delete(tb);
  mailbox = [];
  enqueue.mockClear();
  await saveCalendarSecret(h, "google_calendar", { refreshToken: "r", accessToken: "tok", expiresAt: "2099-01-01T00:00:00Z" }, { account: "owner@example.test", scopes: [GMAIL_READ, GMAIL_COMPOSE] }, { key });
  const [a, b] = await h.insert(calendars).values([
    { connectionId: "google_calendar", remoteId: "work", name: "Work", access: "owner", enabled: true, category: "work" },
    { connectionId: "google_calendar", remoteId: "shifts", name: "Shifts", access: "owner", enabled: true, category: "work" },
  ]).returning();
  calA = a!.id;
  calB = b!.id;
  await config();
  fake = provider();
  current = fake;
});

describe("work roster", () => {
  it("adds the week's shifts by rule, never via the model, and is idempotent", async () => {
    const m = await rosterMail(NEW, "new.html", new Date("2026-09-19T01:00:00Z"));
    expect(await triage()).toMatchObject({ rules: 1, triaged: 0 });
    expect(llm.calls).toHaveLength(0);
    const evs = await events();
    expect(evs.map((e) => [e.title, e.location, e.startAt!.toISOString(), e.description])).toEqual([
      ["Work · TG Warringah", "TG Warringah", "2026-09-22T02:30:00.000Z", "Break 14:30–15:00\nFrom your work roster."],
      ["Work · TG Warringah", "TG Warringah", "2026-09-26T00:00:00.000Z", "Break 14:00–14:30\nFrom your work roster."],
      ["Work · TG Macquar", "TG Macquar", "2026-09-27T02:00:00.000Z", "Break 15:00–15:30\nFrom your work roster."],
    ]);
    expect(evs.every((e) => e.calendarId === calA)).toBe(true);
    expect(await mail(m.id)).toMatchObject({ triageModel: "rules:roster", category: "OTHER", importance: "LOW", summary: "Work roster, week of 21 Sept: 3 added, 0 changed, 0 removed." });
    expect((await t.handle().select().from(notifications)).map((x) => [x.category, x.title])).toEqual([["FYI", "Work roster updated"]]);
    const audits = await t.handle().select().from(auditLog);
    expect(audits.filter((a) => a.action.startsWith("calendar.")).map((a) => [a.actor, a.action])).toEqual(Array(3).fill(["system", "calendar.event.create"]));

    // Re-sync of the same email (e.g. the owner re-runs Triage): nothing new.
    await t.handle().update(mailMessages).set({ triagedAt: null }).where(eq(mailMessages.id, m.id));
    await triage();
    expect(fake.calls.create).toHaveLength(3);
    expect(await events()).toHaveLength(3);
    expect((await mail(m.id)).summary).toBe("Work roster, week of 21 Sept: already applied.");
    expect(await t.handle().select().from(notifications)).toHaveLength(1);
  });

  it("an updated roster changes only the changed shift; a later one removes a dropped shift", async () => {
    await rosterMail(NEW, "new.html", new Date("2026-09-19T01:00:00Z"));
    await triage();
    const tue = (await events())[0]!;
    await rosterMail(UPD, "updated.html", new Date("2026-09-19T05:00:00Z"));
    await triage();
    expect(fake.calls.create).toHaveLength(3);
    expect(fake.calls.update).toHaveLength(1);
    const after = await events();
    expect(after).toHaveLength(3);
    expect(after[0]).toMatchObject({ id: tue.id, startAt: new Date("2026-09-22T00:30:00Z"), description: "Break 13:30–14:00\nFrom your work roster." });

    // Saturday dropped: its event is deleted, the others untouched.
    const third = html("updated.html").replace("10:00 - 17:30", "").replace("Brk (14:00-14:30)", "");
    const id = `r${++n}`;
    mailbox.push({ id, threadId: id, labelIds: ["INBOX"], snippet: "", internalDate: "0", historyId: "1", payload: { mimeType: "text/html", body: { data: Buffer.from(third).toString("base64url") } } });
    await t.handle().insert(mailMessages).values({ gmailId: id, threadId: id, fromAddress: "Rosters@Burps.com.au", subject: UPD, receivedAt: new Date("2026-09-19T09:00:00Z"), labelIds: ["INBOX"] });
    await triage();
    expect(fake.calls.remove).toHaveLength(1);
    expect((await events()).map((e) => e.startAt!.toISOString())).toEqual(["2026-09-22T00:30:00.000Z", "2026-09-27T02:00:00.000Z"]);
  });

  it("an older roster arriving after a newer one changes nothing", async () => {
    await rosterMail(UPD, "updated.html", new Date("2026-09-19T05:00:00Z"));
    await triage();
    const m = await rosterMail(NEW, "new.html", new Date("2026-09-19T01:00:00Z"));
    await triage();
    expect(fake.calls.create).toHaveLength(3);
    expect(fake.calls.update).toHaveLength(0);
    expect((await mail(m.id)).summary).toContain("already applied");
  });

  it("a create that failed mid-week is retried under the same id, so it can't duplicate", async () => {
      const m = await rosterMail(NEW, "new.html", new Date("2026-09-19T01:00:00Z"));
    let calls = 0;
    const base = provider();
    fake = { ...base, create: async (...a) => (++calls === 2 ? Promise.reject(new Error("network")) : base.create(...a)) };
    current = fake;
    await triage();
    expect(await mail(m.id)).toMatchObject({ triagedAt: null, triageModel: "failed:1" });
    expect(await events()).toHaveLength(1);
    const state = (await t.handle().select().from(settings).where(eq(settings.key, rosterWeekKey("2026-09-21"))))[0]!.value as { gmailId: string | null; shifts: { eventId: string | null; key: string }[] };
    expect(state.gmailId).toBeNull();
    const pending = state.shifts.find((s) => !s.eventId)!;

    const seen: string[] = [];
    fake = { ...base, create: async (c, w, o) => (seen.push(o!.remoteId!), base.create(c, w, o)) };
    current = fake;
    await triage();
    expect(seen[0]).toBe(`lifeos${pending.key.replaceAll("-", "")}`);
    expect(await events()).toHaveLength(3);
    expect((await mail(m.id)).triageModel).toBe("rules:roster");
  });

  it("moves a changed shift to a newly chosen calendar; unchanged shifts stay put", async () => {
    await rosterMail(NEW, "new.html", new Date("2026-09-19T01:00:00Z"));
    await triage();
    await config({ calendarId: calB });
    await rosterMail(UPD, "updated.html", new Date("2026-09-19T05:00:00Z"));
    await triage();
    expect(fake.calls.remove).toHaveLength(1);
    const evs = await events();
    expect(evs.map((e) => [e.startAt!.toISOString(), e.calendarId === calB ? "B" : "A"])).toEqual([
      ["2026-09-22T00:30:00.000Z", "B"],
      ["2026-09-26T00:00:00.000Z", "A"],
      ["2026-09-27T02:00:00.000Z", "A"],
    ]);
  });

  it("an unreadable roster gives up at once with one notification and writes nothing", async () => {
    const m = await rosterMail(NEW, "new.html", new Date("2026-09-19T01:00:00Z"));
    mailbox[0]!.payload.body!.data = Buffer.from("<table><tr><td></td><td>TG A</td></tr><tr><td>Tue 22-Sep</td><td>ask AV</td></tr></table>").toString("base64url");
    await triage();
    expect(await mail(m.id)).toMatchObject({ triagedAt: null, triageModel: TRIAGE_GAVE_UP });
    expect(fake.calls.create).toHaveLength(0);
    const ns = await t.handle().select().from(notifications);
    expect(ns.map((x) => [x.category, x.body])).toEqual([["IMPORTANT", "Couldn't read the TG A shift on Tue 22-Sep. Nothing in your calendar was changed."]]);
    await triage(); // gave up: not retried automatically
    expect(await t.handle().select().from(notifications)).toHaveLength(1);
  });

  it("ignores roster-sender mail outside the INBOX (spam)", async () => {
    const m = await rosterMail(NEW, "new.html", new Date("2026-09-19T01:00:00Z"));
    await t.handle().update(mailMessages).set({ labelIds: ["INBOX", "SPAM"] }).where(eq(mailMessages.id, m.id));
    await runTriage({ handle: t.handle(), llm: null, fetch: fakeGmail({ messages: mailbox }), now: () => NOW, key, enqueue });
    expect(fake.calls.create).toHaveLength(0);
  });

  it("leaves roster mail to normal triage when the feature is off, and other senders always", async () => {
    await config({ enabled: false });
    await rosterMail(NEW, "new.html", new Date("2026-09-19T01:00:00Z"));
    await rosterMail(NEW, "new.html", new Date("2026-09-19T01:00:00Z"), "someone@else.test");
    const r = await runTriage({ handle: t.handle(), llm: null, fetch: fakeGmail({ messages: mailbox }), now: () => NOW, key, enqueue });
    expect(r.rules).toBe(0);
    expect(fake.calls.create).toHaveLength(0);
  });

  it("waits for another worker's lease and re-queues itself", async () => {
    await t.handle().insert(settings).values({ key: "roster.lock", value: "other", updatedAt: NOW });
    const m = await rosterMail(NEW, "new.html", new Date("2026-09-19T01:00:00Z"));
    await triage();
    expect(llm.calls).toHaveLength(0);
    expect(fake.calls.create).toHaveLength(0);
    expect(await mail(m.id)).toMatchObject({ triagedAt: null, triageModel: null });
    expect(enqueue).toHaveBeenCalledWith("mail.triage", { ids: [m.id] }, { startAfter: new Date(+NOW + 60_000) });
  });
});
