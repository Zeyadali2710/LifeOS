import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { MAIL_SYNC_KEY } from "@/server/mail/sync";
import { TRIAGE_PAUSED_KEY } from "@/server/mail/triage";
import { agentRuns, approvals, connections, mailMessages, outreachEvents, settings, tasks, toolCalls } from "@/server/db/schema";
import { followUpCount, listFollowUps, loadMailView, mailStatus, pendingReplyFor } from "@/server/mail/queries";
import { setupTestDb } from "./helpers";

process.env.LIFEOS_MASTER_KEY ??= randomBytes(32).toString("base64");
process.env.DATABASE_URL ??= "postgres://unused/unused";
process.env.BETTER_AUTH_SECRET ??= "x".repeat(32);
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const t = setupTestDb();
const h = () => t.handle();
const READ = "https://www.googleapis.com/auth/gmail.readonly";
const conn = (o: Partial<typeof connections.$inferInsert> = {}) =>
  h().insert(connections).values({ id: "google_calendar", ciphertext: "x", last4: "1234", scopes: [READ], status: "connected", ...o });
let n = 0;
const mail = async (o: Partial<typeof mailMessages.$inferInsert> = {}) =>
  (await h().insert(mailMessages).values({ gmailId: `g${++n}`, threadId: "t1", subject: "S", receivedAt: new Date(2026, 9, 1, 0, n), labelIds: ["INBOX"], ...o }).returning())[0]!;

beforeEach(async () => {
  for (const tbl of [agentRuns, tasks, mailMessages, outreachEvents, connections, settings]) await h().delete(tbl);
});

describe("mailStatus", () => {
  it("walks not_connected, scope_missing, reconnect, first_sync, ok", async () => {
    expect((await mailStatus(h())).state).toBe("not_connected");
    await conn({ scopes: ["calendar"] });
    expect((await mailStatus(h())).state).toBe("scope_missing");
    await h().update(connections).set({ scopes: [READ], status: "error" });
    expect((await mailStatus(h())).state).toBe("reconnect");
    await h().update(connections).set({ status: "connected" });
    expect((await mailStatus(h())).state).toBe("first_sync");
    await mail();
    expect((await mailStatus(h())).state).toBe("ok");
  });

  it("reports sync error and triage pause", async () => {
    await conn();
    await mail();
    await h().insert(settings).values([{ key: MAIL_SYNC_KEY, value: { full: "done", lastSyncAt: "2026-10-13T00:00:00Z", lastSyncError: "boom" } }, { key: TRIAGE_PAUSED_KEY, value: true }]);
    expect(await mailStatus(h())).toEqual({ state: "ok", lastSyncAt: "2026-10-13T00:00:00Z", lastSyncError: "Gmail: boom", triagePaused: true });
  });
});

describe("loadMailView", () => {
  it("counts categories, untriaged and archived; lists newest first without archived", async () => {
    const a = await mail({ category: "IMPORTANT", subject: "old" });
    const b = await mail({ category: "IMPORTANT", subject: "new" });
    await mail({ category: "OTHER" });
    await mail({});
    await mail({ category: "IMPORTANT", archivedAt: new Date() });
    await mail({ category: "OTHER", labelIds: ["SENT"] });
    const v = await loadMailView(h(), { cat: "important" });
    expect(v.items.map((i) => i.subject)).toEqual(["new", "old"]);
    expect(v.items[0]).not.toHaveProperty("gmailId");
    expect(v.items[0]!.from).toBeDefined();
    expect(v.counts).toMatchObject({ IMPORTANT: 2, OTHER: 1, EVENTS: 0, UNTRIAGED: 1, ARCHIVED: 1 });
    expect(v.inboxCount).toBe(4);
    expect([a.id, b.id]).toContain(v.items[1]!.id);
    expect((await loadMailView(h(), { cat: "archived" })).items).toHaveLength(1);
    expect((await loadMailView(h(), { cat: "untriaged" })).items).toHaveLength(1);
  });
});

describe("pendingReplyFor", () => {
  const seed = async (mailId: string, status: "pending" | "rejected", age = 0) => {
    const [run] = await h().insert(agentRuns).values({ agentId: "outreach", prompt: "p", model: "m", status: "waiting_approval" }).returning();
    const [tc] = await h().insert(toolCalls).values({ runId: run!.id, toolUseId: `u${++n}`, seq: 1, tool: "mail.send_reply", tier: "APPROVE", status: "waiting_approval" }).returning();
    const payload = { messageId: mailId, threadId: "t1", to: [{ name: "A", address: "a@example.test" }], cc: [], inReplyTo: null, references: null, originalSubject: "S", subject: "Re: S", body: "Hi" };
    const [a] = await h()
      .insert(approvals)
      .values({ runId: run!.id, toolCallId: tc!.id, agentId: "outreach", tool: "mail.send_reply", status, originalPayload: payload, payloadHash: `h${n}`, expiresAt: new Date(Date.now() + 864e5), createdAt: new Date(Date.now() - age), updatedAt: new Date(Date.now() - age) })
      .returning();
    return a!;
  };
  it("returns the newest pending or recently resolved approval for that message only", async () => {
    const m = await mail();
    const other = await mail();
    expect(await pendingReplyFor(h(), m.id)).toBeNull();
    await seed(other.id, "pending");
    await seed(m.id, "rejected", 3 * 864e5);
    expect(await pendingReplyFor(h(), m.id)).toBeNull();
    const a = await seed(m.id, "pending");
    expect((await pendingReplyFor(h(), m.id))?.id).toBe(a.id);
    await h().update(approvals).set({ status: "rejected" });
    expect((await pendingReplyFor(h(), m.id))?.id).toBe(a.id);
  });
});

describe("listFollowUps", () => {
  it("lists open linked tasks by due date, undated last, with context", async () => {
    const m = await mail({ subject: "Agenda", fromName: "Lee" });
    const [e] = await h().insert(outreachEvents).values({ title: "Meetup", titleKey: "meetup", startAt: new Date(), isMock: false }).returning();
    await h().insert(tasks).values([
      { title: "undated", mailMessageId: m.id },
      { title: "late", outreachEventId: e!.id, dueDate: "2026-11-02" },
      { title: "soon", mailMessageId: m.id, dueDate: "2026-10-20" },
      { title: "done", mailMessageId: m.id, completedAt: new Date() },
      { title: "unlinked", dueDate: "2026-10-01" },
    ]);
    const r = await listFollowUps(h());
    expect(r.map((x) => x.title)).toEqual(["soon", "late", "undated"]);
    expect(r[0]!.context).toEqual({ kind: "email", id: m.id, subject: "Agenda", sender: "Lee" });
    expect(r[1]!.context).toEqual({ kind: "event", id: e!.id, title: "Meetup" });
    expect(await followUpCount(h())).toBe(3);
  });
});

describe("loadMailView empty", () => {
  it("returns zero counts and no items on an empty inbox", async () => {
    const v = await loadMailView(h(), { cat: "important" });
    expect(v).toMatchObject({ items: [], inboxCount: 0, counts: { IMPORTANT: 0, UNTRIAGED: 0, ARCHIVED: 0 } });
  });
});
