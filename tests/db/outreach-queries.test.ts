import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_INTERESTS, INTERESTS_KEY } from "@/lib/outreach-types";
import { encrypt } from "@/server/crypto";
import { connections, eventSources, outreachEvents, settings } from "@/server/db/schema";
import { eventCount, loadEvent, loadInterests, loadOutreachEvents, pipelineEvents, sourceStatus } from "@/server/outreach/queries";
import { setupTestDb } from "./helpers";

process.env.LIFEOS_MASTER_KEY ??= randomBytes(32).toString("base64");
process.env.DATABASE_URL ??= "postgres://unused/unused";
process.env.BETTER_AUTH_SECRET ??= "x".repeat(32);
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const t = setupTestDb();
const NOW = new Date("2026-10-13T00:00:00Z");
const d = (s: string) => new Date(s);
const seed = async (title: string, o: Partial<typeof outreachEvents.$inferInsert> = {}) =>
  (await t.handle().insert(outreachEvents).values({ title, titleKey: title.toLowerCase(), startAt: d("2026-10-20T10:00:00Z"), endAt: d("2026-10-20T12:00:00Z"), isMock: false, ...o }).returning())[0]!;

beforeEach(async () => {
  const h = t.handle();
  await h.delete(outreachEvents);
  await h.delete(eventSources);
  await h.delete(connections);
  await h.delete(settings);
});

describe("outreach read queries", () => {
  it("hideMock excludes mocks, dismissed and past events; sorted by score then start", async () => {
    await seed("low", { score: 10 });
    await seed("high-late", { score: 90, startAt: d("2026-10-25T10:00:00Z"), endAt: d("2026-10-25T11:00:00Z") });
    await seed("high-early", { score: 90 });
    await seed("mock", { score: 99, isMock: true });
    await seed("gone", { score: 99, dismissedAt: NOW });
    await seed("past", { score: 99, startAt: d("2026-10-01T10:00:00Z"), endAt: d("2026-10-01T11:00:00Z") });
    const r = await loadOutreachEvents(t.handle(), NOW, { hideMock: true });
    expect(r.map((e) => e.title)).toEqual(["high-early", "high-late", "low"]);
    expect(await eventCount(t.handle(), NOW, true)).toBe(3);
  });

  it("hideMock false includes mocks; sourceKinds are distinct", async () => {
    await seed("m", { isMock: true, sources: [{ sourceId: "a", kind: "ics", remoteId: "1" }, { sourceId: "b", kind: "ics", remoteId: "2" }, { sourceId: "c", kind: "luma", remoteId: "3" }] });
    const r = await loadOutreachEvents(t.handle(), NOW, { hideMock: false });
    expect(r).toHaveLength(1);
    expect(r[0]!.sourceKinds).toEqual(["ics", "luma"]);
  });

  it("loadEvent returns dismissed events and null for unknown ids", async () => {
    const e = await seed("x", { dismissedAt: NOW });
    expect((await loadEvent(t.handle(), e.id))?.dismissedAt).toBe(NOW.toISOString());
    expect(await loadEvent(t.handle(), "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("pipelineEvents lists saved events of any date, not dismissed", async () => {
    await seed("old-saved", { stage: "ATTENDED", startAt: d("2026-01-01T00:00:00Z"), endAt: null });
    await seed("hidden", { stage: "SAVED", dismissedAt: NOW });
    await seed("unsaved");
    expect((await pipelineEvents(t.handle())).map((e) => e.title)).toEqual(["old-saved"]);
  });

  it("sourceStatus: real source detection, mock count, failing sources", async () => {
    const h = t.handle();
    await seed("m", { isMock: true });
    expect(await sourceStatus(h)).toEqual({ hasRealSource: false, mockCount: 1, failing: [] });
    await h.insert(eventSources).values({ kind: "luma", label: "Luma" });
    expect((await sourceStatus(h)).hasRealSource).toBe(false);
    await h.insert(eventSources).values({ kind: "ics", label: "Feed", urlCiphertext: encrypt("https://example.com/f.ics"), host: "example.com", lastSyncError: "Feed unreadable" });
    const s = await sourceStatus(h);
    expect(s.hasRealSource).toBe(true);
    expect(s.failing).toEqual([{ label: "Feed", lastSyncError: "Feed unreadable" }]);
    await h.delete(eventSources);
    await h.insert(connections).values({ id: "luma", ciphertext: "x", last4: "1234" });
    expect((await sourceStatus(h)).hasRealSource).toBe(true);
  });

  it("interests default, then read from settings", async () => {
    expect(await loadInterests(t.handle())).toEqual(DEFAULT_INTERESTS);
    await t.handle().insert(settings).values({ key: INTERESTS_KEY, value: ["AI"] });
    expect(await loadInterests(t.handle())).toEqual(["AI"]);
  });
});
