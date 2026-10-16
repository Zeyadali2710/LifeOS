import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mailSyncKey } from "@/lib/google-accounts";
import { removeCalendarConnection, saveCalendarSecret } from "@/server/calendar/connections";
import { GMAIL_COMPOSE, GMAIL_READ } from "@/server/calendar/google/client";
import { connections, mailMessages, settings } from "@/server/db/schema";
import { loadMailView, mailStatus } from "@/server/mail/queries";
import { saveReplyDraft } from "@/server/mail/send";
import { createMailSync, mailSyncState, syncMailAccounts } from "@/server/mail/sync";
import { FIXTURE, fakeGmail } from "../helpers/fake-gmail";
import { setupTestDb } from "./helpers";

const key = vi.hoisted(() => Buffer.alloc(32, 12));
vi.mock("@/server/env", () => ({ env: () => ({ LIFEOS_MASTER_KEY: key.toString("base64") }) }));
const t = setupTestDb();
const second = `google_mail:${createHash("sha256").update("second@example.test").digest("hex")}`;
const now = new Date("2026-10-16T00:00:00Z");
const enqueue = vi.fn(async () => {});
const connect = (id: string, token: string) => saveCalendarSecret(t.handle(), id,
  { accessToken: token, refreshToken: "refresh", expiresAt: "2099-01-01T00:00:00Z" },
  { account: id === second ? "second@example.test" : "owner@example.test", scopes: [GMAIL_READ, GMAIL_COMPOSE] }, { key });

beforeEach(async () => {
  for (const table of [mailMessages, connections, settings]) await t.handle().delete(table);
  await connect("google_calendar", "primary-token");
  await connect(second, "secondary-token");
});

describe("multiple Gmail accounts", () => {
  it("syncs colliding Gmail IDs independently and does not change another inbox's labels", async () => {
    const h = t.handle();
    const f = fakeGmail();
    const sync = createMailSync({ handle: h, fetch: f, key, now: () => now, enqueue });
    expect(await sync.run()).toMatchObject({ ok: true });
    expect(await sync.run(second)).toMatchObject({ ok: true });
    const rows = await h.select().from(mailMessages);
    const count = rows.filter((m) => m.connectionId === second).length;
    expect(count).toBeGreaterThan(0);
    expect(rows).toHaveLength(count * 2);
    expect(await mailSyncState(h, second)).toMatchObject({ full: "done", historyId: FIXTURE.profile.historyId });
    await h.delete(settings).where(eq(settings.key, mailSyncKey(second)));
    await createMailSync({ handle: h, fetch: fakeGmail({ messages: [] }), key, now: () => now, enqueue }).run(second);
    expect((await h.select().from(mailMessages).where(eq(mailMessages.connectionId, "google_calendar"))).every((m) => m.labelIds.includes("INBOX"))).toBe(true);
    expect((await h.select().from(mailMessages).where(eq(mailMessages.connectionId, second))).every((m) => !m.labelIds.includes("INBOX"))).toBe(true);
  });

  it("keeps syncing a healthy account when another rejects access", async () => {
    const good = fakeGmail();
    const bad = fakeGmail(); bad.state.unauthorized = true;
    const f: typeof fetch = (input, init) => new Headers(init?.headers).get("Authorization") === "Bearer secondary-token" ? bad(input, init) : good(input, init);
    const results = await syncMailAccounts({ handle: t.handle(), fetch: f, key, now: () => now, enqueue });
    expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ ok: true }), { error: "auth" }]));
    const status = await mailStatus(t.handle());
    expect(status.state).toBe("ok");
    expect(status.lastSyncError).toContain("second@example.test");
    expect((await t.handle().select().from(connections).where(eq(connections.id, "google_calendar")))[0]!.status).toBe("connected");
  });

  it("disconnects only the selected account and leaves its sibling's history intact", async () => {
    const h = t.handle();
    const sync = createMailSync({ handle: h, fetch: fakeGmail(), key, now: () => now, enqueue });
    await sync.run(); await sync.run(second);
    const before = await mailSyncState(h);
    await removeCalendarConnection(h, second, { key, fetch: async () => new Response(null, { status: 200 }) });
    expect(await mailSyncState(h)).toEqual(before);
    const remaining = await h.select().from(mailMessages);
    expect(remaining.length).toBeGreaterThan(0);
    expect(remaining.every((m) => m.connectionId === "google_calendar")).toBe(true);
    expect(await h.select().from(settings).where(eq(settings.key, mailSyncKey(second)))).toHaveLength(0);
  });

  it("does not recreate mail or sync state when an account disconnects during a fetch", async () => {
    const h = t.handle();
    const f = fakeGmail();
    let disconnected = false;
    const fetcher: typeof fetch = async (input, init) => {
      const result = await f(input, init);
      if (!disconnected && String(input).includes("/messages/")) {
        disconnected = true;
        await removeCalendarConnection(h, second, { key, fetch: async () => new Response(null, { status: 200 }) });
      }
      return result;
    };
    await createMailSync({ handle: h, key, fetch: fetcher, now: () => now, enqueue }).run(second);
    expect(disconnected).toBe(true);
    expect(await h.select().from(mailMessages).where(eq(mailMessages.connectionId, second))).toHaveLength(0);
    expect(await h.select().from(settings).where(eq(settings.key, mailSyncKey(second)))).toHaveLength(0);
  });

  it("routes draft creation to the message mailbox and refuses a retargeted payload", async () => {
    const h = t.handle();
    const [m] = await h.insert(mailMessages).values({ connectionId: second, gmailId: "m-reply", threadId: "t-reply", receivedAt: now, labelIds: ["INBOX"] }).returning();
    const f = fakeGmail();
    const fetcher: typeof fetch = (input, init) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer secondary-token");
      return f(input, init);
    };
    const payload = { messageId: m!.id, connectionId: second, threadId: "t-reply", to: [{ name: "Lee", address: "lee@example.test" }], cc: [], inReplyTo: null, references: null, originalSubject: "Agenda", subject: "Re: Agenda", body: "Yes" };
    expect(await saveReplyDraft(h, payload, { key, fetch: fetcher })).toHaveProperty("draftId");
    const calls = f.calls.length;
    await expect(saveReplyDraft(h, { ...payload, connectionId: "google_calendar" }, { key, fetch: fetcher })).rejects.toThrow("original mailbox");
    expect(f.calls).toHaveLength(calls);
    const view = await loadMailView(h, { cat: "untriaged" });
    expect(view.items[0]!.mailbox).toBe("second@example.test");
    expect(await h.select().from(mailMessages).where(and(eq(mailMessages.connectionId, second), eq(mailMessages.gmailId, "m-reply")))).toHaveLength(1);
  });
});
