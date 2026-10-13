import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveCalendarSecret } from "@/server/calendar/connections";
import { GMAIL_COMPOSE, GMAIL_READ } from "@/server/calendar/google/client";
import { connections, mailMessages, settings } from "@/server/db/schema";
import { createMailSync, MAIL_SYNC_KEY, mailSyncState } from "@/server/mail/sync";
import { QUEUES } from "@/server/queue";
import { FIXTURE, fakeGmail, manyMessages } from "../helpers/fake-gmail";
import { setupTestDb } from "./helpers";

process.env.DATABASE_URL ??= "postgres://unused/unused";
process.env.BETTER_AUTH_SECRET ??= "x".repeat(32);
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.LIFEOS_MASTER_KEY ??= randomBytes(32).toString("base64");
const t = setupTestDb();
const key = randomBytes(32);
const NOW = new Date("2026-10-13T00:00:00Z");
const CAL = "https://www.googleapis.com/auth/calendar";

async function connect(scopes = [CAL, GMAIL_READ, GMAIL_COMPOSE]) {
  await saveCalendarSecret(t.handle(), "google_calendar", { refreshToken: "r", accessToken: "tok", expiresAt: "2099-01-01T00:00:00Z" }, { account: "owner@example.test", scopes }, { key });
}
const enqueue = vi.fn(async () => undefined);
const mk = (f: ReturnType<typeof fakeGmail>) => createMailSync({ handle: t.handle(), fetch: f, now: () => NOW, key, enqueue });
const gets = (f: ReturnType<typeof fakeGmail>) => f.calls.filter((c) => /\/messages\/[^/]+$/.test(new URL(c.url).pathname)).map((c) => new URL(c.url).pathname.split("/").pop()!);
const rows = () => t.handle().select().from(mailMessages);
const conn = async () => (await t.handle().select().from(connections).where(eq(connections.id, "google_calendar")))[0]!;

beforeEach(async () => {
  const h = t.handle();
  enqueue.mockClear();
  await h.delete(mailMessages);
  await h.delete(settings);
  await h.delete(connections);
  await connect();
});

describe("mail sync", () => {
  it("skips without gmail.readonly and makes no Gmail request", async () => {
    await connect([CAL]);
    const f = fakeGmail();
    expect(await mk(f).run()).toEqual({ skipped: "no_scope" });
    expect(f.calls).toHaveLength(0);
  });

  it("backfills 250 ids in two runs (200 + 50), saving the profile historyId first and never refetching", async () => {
    const f = fakeGmail({ messages: manyMessages(250, NOW) });
    await mk(f).run();
    expect(new URL(f.calls[0]!.url).pathname.endsWith("/profile")).toBe(true);
    expect(gets(f)).toHaveLength(200);
    expect(await mailSyncState(t.handle())).toMatchObject({ full: "pending", historyId: "1000" });
    await mk(f).run();
    const all = gets(f);
    expect(all).toHaveLength(250);
    expect(new Set(all).size).toBe(250);
    expect(await mailSyncState(t.handle())).toMatchObject({ full: "done", email: "owner@example.test" });
    expect(await rows()).toHaveLength(250);
  });

  it("stores parsed metadata and snippet only, flags bulk, never a body", async () => {
    await mk(fakeGmail()).run();
    const by = Object.fromEntries((await rows()).map((r) => [r.gmailId, r]));
    const p = by["m-plain"]!;
    expect(p).toMatchObject({ fromName: "Sam Sample", fromAddress: "sam@example.org", subject: "Sample project catch-up", bulk: false });
    expect(p.to).toEqual([{ name: "Owner", address: "owner@example.test" }]);
    expect(p.cc.map((a) => a.address)).toEqual(["pat@example.org", "other@example.org"]);
    expect(p.labelIds).toEqual(["INBOX", "UNREAD"]);
    expect(p.receivedAt).toEqual(new Date("2026-10-10T01:00:00Z"));
    expect(by["m-bulk"]!.bulk).toBe(true);
    expect(by["m-html"]!.bulk).toBe(false);
    expect(JSON.stringify(await rows())).not.toContain("attacker@evil.test");
    expect(Object.keys(p).some((k) => /body/i.test(k))).toBe(false);
  });

  it("incremental: fetches only added ids, applies label removal, advances historyId", async () => {
    const f = fakeGmail();
    await mk(f).run();
    expect(await mailSyncState(t.handle())).toMatchObject({ full: "done", historyId: "1000" });
    const fresh = { ...FIXTURE.messages.plain!, id: "m-new", threadId: "t-new" };
    f.state.mailbox.set("m-new", fresh);
    f.state.historyId = "1200";
    f.state.history = [
      { id: "1100", messagesAdded: [{ message: { id: "m-new", threadId: "t-new" } }, { message: { id: "m-plain", threadId: "t-plain" } }] },
      { id: "1110", labelsRemoved: [{ message: { id: "m-html", threadId: "t-html" }, labelIds: ["INBOX"] }] },
    ];
    f.calls.length = 0;
    const r = await mk(f).run();
    expect(r).toMatchObject({ ok: true, added: 1 });
    expect(gets(f)).toEqual(["m-new"]);
    expect((await rows()).find((x) => x.gmailId === "m-html")!.labelIds).toEqual([]);
    expect((await mailSyncState(t.handle())).historyId).toBe("1200");
  });

  it("incremental: an unknown message moved back into INBOX is fetched (WR-S05)", async () => {
    const f = fakeGmail();
    await mk(f).run();
    f.state.mailbox.set("m-unarchived", { ...FIXTURE.messages.plain!, id: "m-unarchived", threadId: "t-u" });
    f.state.historyId = "1200";
    f.state.history = [{ id: "1100", labelsAdded: [{ message: { id: "m-unarchived", threadId: "t-u" }, labelIds: ["INBOX"] }] }];
    expect(await mk(f).run()).toMatchObject({ ok: true, added: 1 });
    expect((await rows()).find((x) => x.gmailId === "m-unarchived")!.labelIds).toContain("INBOX");
  });

  it("a 404 full resync drops INBOX from rows archived during the gap and restores it on listed ones (WR-S05)", async () => {
    const f = fakeGmail();
    await mk(f).run();
    await t.handle().update(mailMessages).set({ labelIds: ["UNREAD"] }).where(eq(mailMessages.gmailId, "m-plain")); // stale: unarchived in Gmail
    const archived = f.state.mailbox.get("m-html")!;
    f.state.mailbox.set("m-html", { ...archived, labelIds: [] }); // archived in Gmail during the gap
    f.state.historyGone = true;
    await mk(f).run();
    const by = Object.fromEntries((await rows()).map((r) => [r.gmailId, r]));
    expect(by["m-html"]!.labelIds).not.toContain("INBOX");
    expect(by["m-plain"]!.labelIds).toContain("INBOX");
  });

  it("history 404 resets state and runs a full sync in the same call", async () => {
    const f = fakeGmail();
    await mk(f).run();
    f.state.historyGone = true;
    f.state.historyId = "5000";
    f.calls.length = 0;
    expect(await mk(f).run()).toMatchObject({ ok: true });
    expect(f.calls.some((c) => new URL(c.url).pathname.endsWith("/profile"))).toBe(true);
    expect(await mailSyncState(t.handle())).toMatchObject({ full: "done", historyId: "5000" });
  });

  it("403 insufficientPermissions drops the Gmail scopes only; the Google connection stays connected", async () => {
    const f = fakeGmail();
    f.state.forbid = true;
    expect(await mk(f).run()).toEqual({ error: "scope" });
    const c = await conn();
    expect(c.scopes).toEqual([CAL]);
    expect(c.status).toBe("connected");
    expect((await mailSyncState(t.handle())).lastSyncError).toBe("Gmail access was removed. Reconnect Google.");
  });

  it("401 marks the Google connection for reconnect", async () => {
    const f = fakeGmail();
    f.state.unauthorized = true;
    expect(await mk(f).run()).toEqual({ error: "auth" });
    expect(await conn()).toMatchObject({ status: "error", lastError: "Access was rejected." });
  });

  it("429 keeps the sync state for the next tick", async () => {
    const f = fakeGmail();
    await mk(f).run();
    f.state.rateLimit = true;
    f.state.historyId = "9999";
    expect(await mk(f).run()).toEqual({ error: "rate_limit" });
    const s = await mailSyncState(t.handle());
    expect(s).toMatchObject({ historyId: "1000", full: "done", lastSyncError: "Gmail rate limit reached." });
    expect((await conn()).status).toBe("connected");
  });

  it("enqueues triage once when mail was added and not on a quiet run", async () => {
    const f = fakeGmail();
    await mk(f).run();
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(QUEUES.mailTriage, {}, { singletonKey: "mail.triage" });
    await mk(f).run();
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("prunes rows older than 90 days that left INBOX and keeps ones still in INBOX", async () => {
    const old = new Date(+NOW - 100 * 86400000);
    await t.handle().insert(mailMessages).values([
      { gmailId: "old-sent", threadId: "x", receivedAt: old, labelIds: ["SENT"] },
      { gmailId: "old-inbox", threadId: "y", receivedAt: old, labelIds: ["INBOX"] },
    ]);
    await mk(fakeGmail()).run();
    const ids = (await rows()).map((r) => r.gmailId);
    expect(ids).not.toContain("old-sent");
    expect(ids).toContain("old-inbox");
  });

  it("re-sync never overwrites triage or local state", async () => {
    const f = fakeGmail();
    await mk(f).run();
    const when = new Date("2026-10-11T00:00:00Z");
    await t.handle().update(mailMessages).set({ category: "IMPORTANT", importance: "HIGH", summary: "kept", flagged: true, archivedAt: when, triagedAt: when }).where(eq(mailMessages.gmailId, "m-plain"));
    f.state.history = [{ id: "1100", labelsRemoved: [{ message: { id: "m-plain", threadId: "t-plain" }, labelIds: ["UNREAD"] }] }];
    f.state.historyId = "1100";
    await mk(f).run();
    f.state.historyGone = true;
    await mk(f).run(); // 404 -> full re-run
    const r = (await rows()).find((x) => x.gmailId === "m-plain")!;
    expect(r).toMatchObject({ category: "IMPORTANT", importance: "HIGH", summary: "kept", flagged: true });
    expect(r.archivedAt).toEqual(when);
    expect(r.labelIds).toEqual(["INBOX"]);
  });

  it("stores the sync state under the mail.sync setting, not connections.lastSyncAt", async () => {
    await mk(fakeGmail()).run();
    const [s] = await t.handle().select().from(settings).where(eq(settings.key, MAIL_SYNC_KEY));
    expect(s).toBeDefined();
    expect((await conn()).lastSyncAt).toBeNull();
  });
});
