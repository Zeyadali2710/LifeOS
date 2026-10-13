import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { INTERESTS_KEY } from "@/lib/outreach-types";
import { calendarEvents, calendars, activityEvents, connections, eventSources, outreachEvents, projects, settings } from "@/server/db/schema";
import { encrypt } from "@/server/crypto";
import { SafeGetError } from "@/server/net/safe-get";
import { mockEvents } from "@/server/outreach/mock-events";
import { createOutreachSync, rescoreAll, upsertEvents } from "@/server/outreach/sync";
import { fakeGithub } from "../helpers/fake-github";
import { setupTestDb } from "./helpers";

process.env.LIFEOS_MASTER_KEY ??= randomBytes(32).toString("base64");
process.env.DATABASE_URL ??= "postgres://unused/unused";
process.env.BETTER_AUTH_SECRET ??= "x".repeat(32);
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const t = setupTestDb();
const NOW = new Date("2026-10-13T00:00:00Z");
const LUMA = readFileSync("tests/fixtures/outreach/luma-sydney.ics", "utf8");

const feed = (body: string) => async () => ({ status: 200, contentType: "text/calendar", body, finalUrl: "" });
const vevent = (uid: string, title: string, start: string, extra = "") =>
  `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:20261001T000000Z\r\nDTSTART:${start}\r\nDTEND:${start.replace(/T(\d\d)/, (_, h) => `T${String(+h + 1).padStart(2, "0")}`)}\r\nSUMMARY:${title}\r\n${extra}END:VEVENT\r\n`;
const cal = (...v: string[]) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//EN\r\n${v.join("")}END:VCALENDAR\r\n`;

const sync = (o: Parameters<typeof createOutreachSync>[0] = {}) => createOutreachSync({ handle: t.handle(), now: () => NOW, ...o });
const all = () => t.handle().select().from(outreachEvents);
async function addFeed() {
  const [r] = await t.handle().insert(eventSources).values({ kind: "ics", label: "Feed", urlCiphertext: encrypt("https://example.com/feed.ics"), host: "example.com" }).returning();
  return r!;
}
const src = async (kind: string) => (await t.handle().select().from(eventSources).where(eq(eventSources.kind, kind)))[0]!;

beforeEach(async () => {
  const h = t.handle();
  await h.delete(activityEvents);
  await h.delete(outreachEvents);
  await h.delete(eventSources);
  await h.delete(projects);
  await h.delete(settings);
  await h.delete(calendarEvents);
  await h.delete(calendars);
  await h.delete(connections);
});

describe("outreach sync", () => {
  it("creates the four built-in rows and stores their mock events flagged is_mock", async () => {
    await sync().run();
    expect((await t.handle().select().from(eventSources)).map((s) => s.kind).sort()).toEqual(["eventbrite", "humanitix_mock", "luma", "meetup_mock"]);
    const rows = await all();
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.isMock && (r.sources as { remoteId: string }[])[0]!.remoteId.startsWith("mock-"))).toBe(true);
  });

  it("inserts ics events as real, drops a Melbourne-geo event, and does not duplicate on re-sync", async () => {
    await addFeed();
    const mel = vevent("mel", "Sample: Melbourne thing", "20261025T080000Z", "GEO:-37.81;144.96"+"\u000d\u000a");
    const body = LUMA.replace("END:VCALENDAR", `${mel}END:VCALENDAR`);
    await sync({ get: feed(body) }).run();
    const real = (await all()).filter((r) => !r.isMock);
    expect(real.map((r) => r.title).sort()).toEqual(["Sample: Far-ahead online", "Sample: Founders night", "Sample: Sydney AI meetup"]);
    const before = (await all()).length;
    const r2 = await sync({ get: feed(body) }).run();
    expect(r2.added).toBe(0);
    expect(await all()).toHaveLength(before);
  });

  it("never overwrites stage, dismissed_at or calendar_event_id on re-sync", async () => {
    await addFeed();
    await sync({ get: feed(LUMA) }).run();
    const rows = (await all()).filter((r) => !r.isMock);
    const [c] = await t.handle().insert(calendars).values({ connectionId: (await t.handle().insert(connections).values({ id: "google_calendar", ciphertext: "x", last4: "" }).returning())[0]!.id, remoteId: "c", name: "C" }).returning();
    const [ce] = await t.handle().insert(calendarEvents).values({ calendarId: c!.id, remoteId: "r", title: "x", startAt: NOW, endAt: NOW, raw: {} }).returning();
    const stamp = new Date("2026-10-10T00:00:00Z");
    await t.handle().update(outreachEvents).set({ stage: "SAVED", stageChangedAt: stamp, calendarEventId: ce!.id, title: "Edited" }).where(eq(outreachEvents.id, rows[0]!.id));
    await t.handle().update(outreachEvents).set({ dismissedAt: stamp }).where(eq(outreachEvents.id, rows[1]!.id));
    await sync({ get: feed(LUMA) }).run();
    const [a] = await t.handle().select().from(outreachEvents).where(eq(outreachEvents.id, rows[0]!.id));
    const [b] = await t.handle().select().from(outreachEvents).where(eq(outreachEvents.id, rows[1]!.id));
    expect(a).toMatchObject({ stage: "SAVED", calendarEventId: ce!.id });
    expect(a!.stageChangedAt).toEqual(stamp);
    expect(b!.dismissedAt).toEqual(stamp);
  });

  it("merges a real event into a matching mock (D-11): one row, sources unioned, real wins, is_mock false", async () => {
    const m = mockEvents("meetup_mock", NOW)[0]!;
    const start = m.startAt.toISOString().replace(/[-:]|\.\d+/g, "");
    await addFeed();
    const body = cal(vevent("same", m.title, start, "DESCRIPTION:Real description\r\nLOCATION:Real Hall\\, Sydney\r\n"));
    await sync({ get: feed(body) }).run();
    const rows = (await all()).filter((r) => r.title === m.title);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ isMock: false, description: "Real description" });
    expect((rows[0]!.sources as { kind: string }[]).map((s) => s.kind).sort()).toEqual(["ics", "meetup_mock"]);
  });

  it("keeps weekly occurrences that share one URL as separate rows", async () => {
    await addFeed();
    const body = cal(vevent("wk", "Sample: Weekly", "20261014T080000Z", "URL:https://example.com/weekly\r\nRRULE:FREQ=WEEKLY;COUNT=4\r\n"));
    await sync({ get: feed(body) }).run();
    expect((await all()).filter((r) => r.canonicalUrl === "https://example.com/weekly")).toHaveLength(4);
  });

  it("isolates an ics SafeGetError: fixed message recorded, other sources still sync", async () => {
    const f = await addFeed();
    await sync({
      get: async () => {
        throw new SafeGetError("blocked");
      },
    }).run();
    const [row] = await t.handle().select().from(eventSources).where(eq(eventSources.id, f.id));
    expect(row!.lastSyncError).toBe("That address isn't allowed.");
    expect((await all()).length).toBeGreaterThan(0);
  });

  it("marks the eventbrite connection error on 401 and records discover=false with the D-06 message on organizer 404", async () => {
    await sync().run();
    await t.handle().insert(connections).values({ id: "eventbrite", ciphertext: encrypt("tok"), last4: "tok" });
    const orgs = () => new Response(JSON.stringify({ organizations: [{ id: "1" }] }));
    const eb = { id: "e1", name: { text: "Real Eventbrite AI night" }, start: { utc: "2026-10-25T08:00:00Z", timezone: "Australia/Sydney" }, url: "https://eb.example/e1", venue: { address: { localized_address_display: "1 Sample St, Sydney NSW" } } };
    const fetch401 = fakeGithub({ "GET /v3/users/me/organizations/": () => new Response("{}", { status: 401 }) });
    await sync({ fetch: fetch401 }).run();
    const [conn] = await t.handle().select().from(connections).where(eq(connections.id, "eventbrite"));
    expect(conn!.status).toBe("error");
    expect((await src("eventbrite")).lastSyncError).toBe("Access was rejected. Replace the key in Settings.");

    await t.handle().update(eventSources).set({ config: { organizerIds: ["99"] } }).where(eq(eventSources.kind, "eventbrite"));
    const ok = fakeGithub({
      "GET /v3/users/me/organizations/": orgs,
      "GET /v3/organizations/1/events/": () => new Response(JSON.stringify({ events: [eb] })),
      "GET /v3/organizers/99/events/": () => new Response("{}", { status: 404 }),
    });
    await sync({ fetch: ok }).run();
    const row = await src("eventbrite");
    expect(row.config.discover).toBe(false);
    expect(row.lastSyncError).toBe("Eventbrite doesn't allow listing this organizer's events with a private token.");
    expect(ok.calls[0]!.auth).toBe("Bearer tok");
    expect((await all()).find((r) => r.title === "Real Eventbrite AI night")?.isMock).toBe(false);
    expect((await t.handle().select().from(connections).where(eq(connections.id, "eventbrite")))[0]!.status).toBe("connected");
  });

  it("deletes unsaved mock events of a built-in once it runs real, keeping saved and multi-source ones", async () => {
    await sync().run();
    const eb = await src("eventbrite");
    const mocks = (await all()).filter((r) => (r.sources as { sourceId: string }[])[0]!.sourceId === eb.id);
    expect(mocks).toHaveLength(3);
    await t.handle().update(outreachEvents).set({ stage: "SAVED" }).where(eq(outreachEvents.id, mocks[0]!.id));
    const lu = await src("luma");
    await t.handle().update(outreachEvents).set({ sources: [...(mocks[1]!.sources as { sourceId: string; kind: string; remoteId: string }[]), { sourceId: lu.id, kind: "luma", remoteId: "x" }] }).where(eq(outreachEvents.id, mocks[1]!.id));
    await t.handle().insert(connections).values({ id: "eventbrite", ciphertext: encrypt("tok"), last4: "tok" });
    await sync({ fetch: fakeGithub({ "GET /v3/users/me/organizations/": () => new Response(JSON.stringify({ organizations: [] })) }) }).run();
    const left = new Set((await all()).map((r) => r.id));
    expect(left.has(mocks[0]!.id)).toBe(true);
    expect(left.has(mocks[1]!.id)).toBe(true);
    expect(left.has(mocks[2]!.id)).toBe(false);
  });

  it("scores events with interests and emits one activity only when a new event scores 70+", async () => {
    await t.handle().insert(settings).values({ key: INTERESTS_KEY, value: ["AI", "Startups", "Cybersecurity"] });
    await addFeed();
    const body = cal(vevent("hot", "Sample: AI Startups Cybersecurity night", "20261027T080000Z"), vevent("cold", "Sample: Pottery", "20261028T080000Z"));
    await sync({ get: feed(body) }).run();
    const hot = (await all()).find((r) => r.title.includes("Cybersecurity night"))!;
    expect(hot.score).toBeGreaterThanOrEqual(70);
    expect(hot.signals).toHaveLength(3);
    expect(hot.why).toContain("Matches");
    const acts = () => t.handle().select().from(activityEvents).where(eq(activityEvents.type, "outreach.synced"));
    expect(await acts()).toHaveLength(1);
    await sync({ get: feed(body) }).run();
    expect(await acts()).toHaveLength(1);
  });

  it("gives AI a 25 point interest match", async () => {
    await t.handle().insert(settings).values({ key: INTERESTS_KEY, value: ["AI"] });
    await addFeed();
    await sync({ get: feed(LUMA) }).run();
    const e = (await all()).find((r) => r.title === "Sample: Sydney AI meetup")!;
    expect(e.score).toBeGreaterThanOrEqual(25);
  });

  it("prunes unsaved events ended over 30 days ago and orphans, keeping saved and url-sourced ones", async () => {
    const h = t.handle();
    const base = { titleKey: "k", isMock: false };
    const old = { startAt: new Date("2026-08-01T00:00:00Z"), endAt: new Date("2026-08-01T01:00:00Z") };
    const ins = async (title: string, o: Partial<typeof outreachEvents.$inferInsert>) => (await h.insert(outreachEvents).values({ title, ...base, startAt: new Date("2026-10-20T00:00:00Z"), ...o }).returning())[0]!.id;
    const oldUnsaved = await ins("old", old);
    const oldSaved = await ins("oldsaved", { ...old, stage: "SAVED" });
    const orphan = await ins("orphan", { sources: [{ sourceId: "00000000-0000-0000-0000-000000000000", kind: "ics", remoteId: "x" }] });
    const url = await ins("url", { stage: "SAVED", sources: [{ sourceId: "url", kind: "url", remoteId: "x" }] });
    await sync().run();
    const ids = new Set((await all()).map((r) => r.id));
    expect(ids.has(oldUnsaved)).toBe(false);
    expect(ids.has(orphan)).toBe(false);
    expect(ids.has(oldSaved)).toBe(true);
    expect(ids.has(url)).toBe(true);
  });

  it("rescoreAll passes active project keywords and gives a PROJECTS signal", async () => {
    const h = t.handle();
    await h.insert(projects).values({ name: "Zeta", context: "quantum telescope calibration", category: "technical" });
    const [e] = await h.insert(outreachEvents).values({ title: "Evening talk", titleKey: "evening talk", startAt: new Date("2026-10-20T00:00:00Z"), isMock: false, description: "All about telescope optics" }).returning();
    await rescoreAll(h, NOW);
    const [r] = await h.select().from(outreachEvents).where(eq(outreachEvents.id, e!.id));
    const p = (r!.signals as { label: string; value: number }[]).find((s) => s.label === "PROJECTS")!;
    expect(p.value).toBe(10);
    expect(r!.why).toContain("project Zeta");
  });

  it("skips an event with an invalid date instead of failing the source (WR-S06)", async () => {
    const good = mockEvents("luma", NOW)[0]!;
    const bad = { ...good, remoteId: "bad", title: "Bad start" };
    const badEnd = { ...good, remoteId: "bad-end", title: "Bad end" };
    const r = await upsertEvents(
      t.handle(),
      { id: "s", kind: "luma" },
      [{ ...bad, startAt: new Date("nope") }, { ...badEnd, endAt: new Date("nope") }, good],
      false,
      NOW,
      { filter: false },
    );
    expect(r.added).toHaveLength(1);
    expect((await all()).map((e) => e.title)).toEqual([good.title]);
  });

  it("upsertEvents is reusable for url imports", async () => {
    const raw = { ...mockEvents("luma", NOW)[0]!, remoteId: "imp" };
    const r = await upsertEvents(t.handle(), { id: "url", kind: "url" }, [raw], false, NOW);
    expect(r.added).toHaveLength(1);
    expect((await all())[0]!.sources).toEqual([{ sourceId: "url", kind: "url", remoteId: "imp" }]);
  });
});
