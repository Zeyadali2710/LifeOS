import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INTERESTS_KEY, type RawEvent } from "@/lib/outreach-types";
import { decrypt } from "@/server/crypto";
import { activityEvents, auditLog, connections, eventSources, outreachEvents, projects, settings } from "@/server/db/schema";
import { SafeGetError } from "@/server/net/safe-get";
import { eventKeyStatus, removeEventKey, saveEventKey } from "@/server/outreach/connections";
import { addFeed, importEventUrl, listEventSources, removeFeed, rescoreAfterProjectChange, saveEventbriteOrganizers, saveInterests, setFeedEnabled } from "@/server/outreach/sources";
import { upsertEvents } from "@/server/outreach/sync";
import { createProject } from "@/server/projects";
import { setupTestDb } from "./helpers";

process.env.LIFEOS_MASTER_KEY ??= randomBytes(32).toString("base64");
process.env.DATABASE_URL ??= "postgres://unused/unused";
process.env.BETTER_AUTH_SECRET ??= "x".repeat(32);
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

const t = setupTestDb();
vi.mock("@/server/db/client", async (orig) => ({ ...(await orig<object>()), db: () => t.handle() }));
vi.mock("@/server/session", () => ({ requireOwner: async () => undefined }));
const enqueue = vi.fn<(...a: unknown[]) => Promise<void>>(async () => undefined);
vi.mock("@/server/queue", () => ({ enqueue: (...a: unknown[]) => enqueue(...a), QUEUES: { eventsSync: "outreach.events.sync" } }));
const boom = vi.hoisted(() => ({ on: false }));
vi.mock("@/server/outreach/sync", async (orig) => {
  const m = await orig<typeof import("@/server/outreach/sync")>();
  return { ...m, rescoreAll: (...a: Parameters<typeof m.rescoreAll>) => (boom.on ? Promise.reject(new Error("boom")) : m.rescoreAll(...a)) };
});

import { saveEventKeyAction, syncEventsNowAction, addFeedAction } from "@/server/outreach-actions";
import { updateProjectAction } from "@/server/project-actions";

const NOW = new Date("2026-10-13T00:00:00Z");
const key = randomBytes(32);
const html = readFileSync("tests/fixtures/outreach/eventbrite-page.html", "utf8");
const noJsonLd = readFileSync("tests/fixtures/outreach/no-jsonld.html", "utf8");
const LUMA = readFileSync("tests/fixtures/outreach/luma-sydney.ics", "utf8");
const page = (body: string, url = "https://example.com/e/mixer") => async () => ({ status: 200, contentType: "text/html", body, finalUrl: url });
const feed = (body: string) => async () => ({ status: 200, contentType: "text/calendar", body, finalUrl: "" });
const blocked = async () => {
  throw new SafeGetError("blocked");
};
const h = () => t.handle();
const audits = async (action: string) => await h().select().from(auditLog).where(eq(auditLog.action, action));

beforeEach(async () => {
  boom.on = false;
  enqueue.mockClear();
  for (const tbl of [activityEvents, outreachEvents, eventSources, projects, settings, connections, auditLog]) await h().delete(tbl);
});

describe("feeds", () => {
  it("rejects http, blocked hosts and non-iCal bodies", async () => {
    expect(await addFeed(h(), { label: "x", url: "http://example.com/f.ics" }, { get: feed(LUMA) })).toEqual({ ok: false, error: "invalid" });
    expect(await addFeed(h(), { label: "x", url: "https://example.com/f.ics" }, { get: blocked })).toEqual({ ok: false, error: "blocked" });
    expect(await addFeed(h(), { label: "x", url: "https://example.com/f.ics" }, { get: feed("<html>nope</html>") })).toEqual({ ok: false, error: "unreadable" });
    expect(await addFeed(h(), { label: " ", url: "https://example.com/f.ics" }, { get: feed(LUMA) })).toEqual({ ok: false, error: "invalid" });
    expect(await h().select().from(eventSources)).toHaveLength(0);
  });

  it("stores the URL encrypted, exposes only host + label, toggles and removes with id-only audit", async () => {
    const url = "https://example.com/secret-token/f.ics";
    const r = await addFeed(h(), { label: "Luma", url }, { get: feed(LUMA), key, now: NOW });
    if (!r.ok) throw new Error("add failed");
    const [row] = await h().select().from(eventSources).where(eq(eventSources.id, r.id));
    expect(row).toMatchObject({ kind: "ics", label: "Luma", host: "example.com" });
    expect(decrypt(row!.urlCiphertext!, key)).toBe(url);
    const dto = JSON.stringify(await listEventSources(h()));
    expect(dto).toContain("example.com");
    expect(dto).not.toContain("secret-token");
    expect(dto).not.toContain("urlCiphertext");
    expect((await audits("outreach.feed.add"))[0]!.metadata).toEqual({ id: r.id, host: "example.com" });

    expect(await setFeedEnabled(h(), r.id, false)).toBe(true);
    expect((await listEventSources(h()))[0]!.enabled).toBe(false);
    expect(await removeFeed(h(), r.id)).toBe(true);
    expect(await h().select().from(eventSources)).toHaveLength(0);
    expect((await audits("outreach.feed.remove"))[0]!.metadata).toEqual({ id: r.id });
  });
});

describe("event keys", () => {
  const f = (status: number) => vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => new Response("{}", { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
  const SECRET = "ebkey_SECRET_VALUE_9876";

  it("validates Eventbrite against the constant URL, stores encrypted with last4, audits without the key", async () => {
    const fx = f(200);
    expect(await saveEventKey(h(), "eventbrite", ` ${SECRET} `, { fetch: fx, key })).toEqual({ ok: true });
    expect((fx as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe("https://www.eventbriteapi.com/v3/users/me/");
    const [row] = await h().select().from(connections).where(eq(connections.id, "eventbrite"));
    expect(row!.last4).toBe("9876");
    expect(decrypt(row!.ciphertext, key)).toBe(SECRET);
    const a = await audits("connection.save");
    expect(a[0]!.metadata).toEqual({ id: "eventbrite", last4: "9876" });
    expect(JSON.stringify(a)).not.toContain("SECRET");
    expect(await eventKeyStatus(h())).toEqual({ eventbrite: { last4: "9876", status: "connected" }, luma: null });
  });

  it("maps 401 to rejected and a network error to unreachable without writing", async () => {
    expect(await saveEventKey(h(), "eventbrite", SECRET, { fetch: f(401), key })).toEqual({ ok: false, error: "rejected" });
    const down = (async () => {
      throw new Error("net");
    }) as unknown as typeof fetch;
    expect(await saveEventKey(h(), "eventbrite", SECRET, { fetch: down, key })).toEqual({ ok: false, error: "unreachable" });
    expect(await saveEventKey(h(), "eventbrite", "  ", { fetch: f(200), key })).toEqual({ ok: false, error: "invalid" });
    expect(await h().select().from(connections)).toHaveLength(0);
  });

  it("validates Luma with the x-luma-api-key header and removes", async () => {
    const fx = f(200);
    expect(await saveEventKey(h(), "luma", "lumakey1234", { fetch: fx, key })).toEqual({ ok: true });
    const call = (fx as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[0]).toBe("https://public-api.luma.com/v1/users/get-self");
    expect((call[1] as RequestInit).headers).toEqual({ "x-luma-api-key": "lumakey1234" });
    await removeEventKey(h(), "luma");
    expect(await h().select().from(connections)).toHaveLength(0);
    expect((await audits("connection.remove"))[0]!.metadata).toEqual({ id: "luma" });
  });

  it("saves Eventbrite organizer ids, validates digits and the 20 cap", async () => {
    expect(await saveEventbriteOrganizers(h(), ["123", "456"])).toEqual({ ok: true });
    await h().update(eventSources).set({ config: { organizerIds: ["123", "456"], discover: false } }).where(eq(eventSources.kind, "eventbrite"));
    expect(await saveEventbriteOrganizers(h(), ["789"])).toEqual({ ok: true });
    const [r] = await h().select().from(eventSources).where(eq(eventSources.kind, "eventbrite"));
    expect(r!.config).toEqual({ organizerIds: ["789"] });
    expect(await saveEventbriteOrganizers(h(), ["12a"])).toEqual({ ok: false, error: "invalid" });
    expect(await saveEventbriteOrganizers(h(), Array.from({ length: 21 }, (_, i) => String(i)))).toEqual({ ok: false, error: "invalid" });
  });
});

describe("import URL", () => {
  it("imports a JSON-LD page straight to SAVED with one stage activity, then reports existed", async () => {
    const r = await importEventUrl(h(), "https://example.com/e/mixer", { get: page(html), now: NOW });
    expect(r).toMatchObject({ ok: true, existed: false });
    if (!r.ok) throw new Error();
    const [e] = await h().select().from(outreachEvents);
    expect(e).toMatchObject({ id: r.id, stage: "SAVED", isMock: false });
    expect((e!.sources as { sourceId: string; kind: string }[])[0]).toMatchObject({ sourceId: "url", kind: "url" });
    expect(await h().select().from(activityEvents).where(eq(activityEvents.type, "outreach.stage"))).toHaveLength(1);
    expect(await importEventUrl(h(), "https://example.com/e/mixer", { get: page(html), now: NOW })).toEqual({ ok: true, id: r.id, existed: true });
    expect(await h().select().from(outreachEvents)).toHaveLength(1);
  });

  it("importing the URL of a dismissed event restores it and saves it (WR-S08)", async () => {
    const r = await importEventUrl(h(), "https://example.com/e/mixer", { get: page(html), now: NOW });
    if (!r.ok) throw new Error();
    await h().update(outreachEvents).set({ stage: null, dismissedAt: NOW }).where(eq(outreachEvents.id, r.id));
    expect(await importEventUrl(h(), "https://example.com/e/mixer", { get: page(html), now: NOW })).toEqual({ ok: true, id: r.id, existed: true });
    const [e] = await h().select().from(outreachEvents).where(eq(outreachEvents.id, r.id));
    expect(e).toMatchObject({ stage: "SAVED", dismissedAt: null });
  });

  it("returns no_event for a page without JSON-LD and maps fetch failures", async () => {
    expect(await importEventUrl(h(), "https://example.com/x", { get: page(noJsonLd), now: NOW })).toEqual({ ok: false, error: "no_event" });
    expect(await h().select().from(outreachEvents)).toHaveLength(0);
    expect(await importEventUrl(h(), "https://example.com/x", { get: blocked, now: NOW })).toEqual({ ok: false, error: "blocked" });
    expect(await importEventUrl(h(), "http://example.com/x", { get: page(html), now: NOW })).toEqual({ ok: false, error: "invalid" });
  });

  it("keeps an owner-chosen event outside the Sydney filter and window", async () => {
    const far = html.replace("2026-11-12T18:00:00+11:00", "2028-01-12T18:00:00+11:00").replace("Sydney", "Melbourne").replace('"NSW"', '"VIC"');
    const r = await importEventUrl(h(), "https://example.com/e/far", { get: page(far, "https://example.com/e/far"), now: NOW });
    expect(r).toMatchObject({ ok: true, existed: false });
    expect((await h().select().from(outreachEvents))[0]!.stage).toBe("SAVED");
  });
});

describe("interests", () => {
  it("validates and stores, then rescoring changes scores", async () => {
    expect(await saveInterests(h(), ["AI", "ai"], NOW)).toEqual({ ok: false, error: "duplicate" });
    expect(await saveInterests(h(), Array.from({ length: 21 }, (_, i) => `i${i}`), NOW)).toEqual({ ok: false, error: "too_many" });
    expect(await saveInterests(h(), ["x".repeat(41)], NOW)).toEqual({ ok: false, error: "too_long" });
    expect(await saveInterests(h(), ["a", " "], NOW)).toEqual({ ok: false, error: "empty" });
    await seedEvent("Quantum gardening night");
    const before = (await h().select().from(outreachEvents))[0]!.score;
    expect(await saveInterests(h(), ["Quantum gardening"], NOW)).toEqual({ ok: true });
    expect((await h().select().from(settings).where(eq(settings.key, INTERESTS_KEY)))[0]!.value).toEqual(["Quantum gardening"]);
    expect((await h().select().from(outreachEvents))[0]!.score).toBeGreaterThan(before);
  });
});

async function seedEvent(title: string) {
  const raw: RawEvent = {
    remoteId: "seed-" + title, title, startAt: new Date("2026-10-25T08:00:00Z"), endAt: null, allDay: false, timeZone: "Australia/Sydney",
    location: "Sydney NSW", lat: null, lng: null, online: false, organizer: null, priceText: null, url: "https://example.com/" + encodeURIComponent(title), description: "", categories: [],
  };
  await upsertEvents(h(), { id: "seed", kind: "ics" }, [raw], false, NOW);
}

describe("actions", () => {
  it("rejects an invalid key id without touching the database or queue", async () => {
    expect(await saveEventKeyAction("openrouter", "abc")).toEqual({ ok: false, error: "invalid" });
    expect(await h().select().from(connections)).toHaveLength(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("Sync now enqueues the singleton events sync", async () => {
    expect(await syncEventsNowAction()).toEqual({ ok: true });
    expect(enqueue).toHaveBeenCalledWith("outreach.events.sync", {}, { singletonKey: "outreach.events.sync" });
  });

  it("rejects a malformed feed submission before any fetch", async () => {
    expect(await addFeedAction("x".repeat(61), "https://example.com/f.ics")).toEqual({ ok: false, error: "invalid" });
  });
});

describe("project change rescoring (D-14)", () => {
  it("gives an event a PROJECTS signal after a project is renamed to a word in its title", async () => {
    await seedEvent("Zebracorn founders meetup");
    const p = await createProject(h(), { name: "Alpha" }, NOW);
    if (!p.ok) throw new Error();
    await rescoreAfterProjectChange(h(), NOW);
    const sig = async () => ((await h().select().from(outreachEvents))[0]!.signals as { label: string; value: number }[]).find((s) => s.label === "PROJECTS")!.value;
    expect(await sig()).toBe(0);
    await h().update(projects).set({ name: "Zebracorn" }).where(eq(projects.id, p.project.id));
    await rescoreAfterProjectChange(h(), NOW);
    expect(await sig()).toBe(10);
  });

  it("never fails when rescoreAll throws; updateProjectAction still returns ok", async () => {
    const p = await createProject(h(), { name: "Alpha" }, NOW);
    if (!p.ok) throw new Error();
    boom.on = true;
    await expect(rescoreAfterProjectChange(h(), NOW)).resolves.toBeUndefined();
    const r = await updateProjectAction(p.project.id, { name: "Beta" });
    expect(r).toMatchObject({ ok: true });
    await new Promise((res) => setTimeout(res, 50)); // let the fire-and-forget rejection be swallowed
  });

  it("an owner project write triggers a rescore", async () => {
    await seedEvent("Gammaware launch party");
    const p = await createProject(h(), { name: "Alpha" }, NOW);
    if (!p.ok) throw new Error();
    expect(await updateProjectAction(p.project.id, { name: "Gammaware" })).toMatchObject({ ok: true });
    await vi.waitFor(async () => {
      const s = ((await h().select().from(outreachEvents))[0]!.signals as { label: string; value: number }[]).find((x) => x.label === "PROJECTS")!.value;
      expect(s).toBe(10);
    });
  });
});
