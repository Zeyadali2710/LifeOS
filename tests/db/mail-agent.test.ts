import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { approvalKind } from "@/lib/approval-kinds";
import { decide, executeApproved, retryApproval } from "@/server/agents/approvals";
import { callTool } from "@/server/agents/gateway";
import { advance, createRun } from "@/server/agents/loop";
import { CONTENT_TOOLS } from "@/server/agents/policy";
import { TOOLS } from "@/server/agents/tools";
import { createThread } from "@/server/agents/threads";
import { saveCalendarSecret } from "@/server/calendar/connections";
import { GMAIL_COMPOSE, GMAIL_READ } from "@/server/calendar/google/client";
import { agentRuns, approvals, auditLog, connections, mailMessages, settings, toolCalls } from "@/server/db/schema";
import { saveReplyDraft } from "@/server/mail/send";
import { MAIL_SYNC_KEY } from "@/server/mail/sync";
import { FIXTURE, fakeGmail, type FakeMsg } from "../helpers/fake-gmail";
import { scriptedLlm } from "../helpers/fake-llm";
import { setupTestDb } from "./helpers";

const key = vi.hoisted(() => Buffer.alloc(32, 5).toString("base64"));
vi.mock("@/server/env", () => ({ env: () => ({ LIFEOS_MASTER_KEY: key }) }));

const t = setupTestDb();
const h = () => t.handle();
const noop = async () => {};
const CAL = "https://www.googleapis.com/auth/calendar";
const SECRET_BODY = "Friday works, see the agenda attached. SECRET-BODY-TEXT";

const connect = (scopes = [CAL, GMAIL_READ, GMAIL_COMPOSE]) =>
  saveCalendarSecret(h(), "google_calendar", { refreshToken: "r", accessToken: "tok", expiresAt: "2099-01-01T00:00:00Z" }, { account: "owner@example.test", scopes }, { key: Buffer.from(key, "base64") });

const hdr = (name: string, value: string) => ({ name, value });
const multi: FakeMsg = {
  id: "m-multi",
  threadId: "t-multi",
  labelIds: ["INBOX"],
  snippet: "s",
  internalDate: "1791248400000",
  historyId: "1000",
  payload: { mimeType: "text/plain", headers: [hdr("From", "Amy <amy@example.org>"), hdr("To", "owner@example.test, Bob <bob@example.org>, amy@example.org"), hdr("Cc", "Carol <carol@example.org>, Owner <OWNER@example.test>"), hdr("Subject", "Plans"), hdr("Message-ID", "<multi-1@example.org>")] },
};
const gmail = () => fakeGmail({ messages: [...Object.values(FIXTURE.messages), multi] });

async function mail(gmailId: string, threadId: string, subject: string) {
  const [m] = await h().insert(mailMessages).values({ gmailId, threadId, subject, fromName: "Lee List", fromAddress: "lee@example.org", receivedAt: new Date("2026-10-06T00:00:00Z") }).returning();
  return m!;
}

/** Faults on the first drafts/send: "before" = 503 without reaching Gmail, "after" = Gmail sends, then the response is lost (503). */
function flaky(f: ReturnType<typeof fakeGmail>, mode: "before" | "after") {
  let done = false;
  const w = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const isSend = new URL(new Request(input, init).url).pathname.endsWith("/drafts/send") && (init?.method ?? "GET") === "POST";
    if (isSend && !done) {
      done = true;
      if (mode === "after") await f(input, init);
      return new Response("{}", { status: 503 });
    }
    return f(input, init);
  }) as typeof fetch;
  return w;
}

async function propose(input: Record<string, unknown>, f: typeof fetch) {
  const threadId = await createThread(h(), "t");
  const r = await createRun(h(), { agentId: "outreach", prompt: "reply", threadId });
  if (!r.ok) throw new Error(r.code);
  const llm = scriptedLlm([{ toolUses: [{ name: "mail.send_reply", input }] }, { text: "Waiting for approval" }]);
  const status = await advance(r.runId, { handle: h(), llm, fetch: f });
  const [ap] = await h().select().from(approvals).where(eq(approvals.runId, r.runId));
  return { runId: r.runId, status, ap };
}
const approve = async (id: string, edited?: unknown) => {
  const d = await decide(h(), id, "approve", { enqueue: noop, edited });
  expect(d.ok).toBe(true);
};
const row = async (id: string) => (await h().select().from(approvals).where(eq(approvals.id, id)))[0]!;
const decode = (raw: string) => raw;
const counts = (f: ReturnType<typeof fakeGmail>) => ({ creates: f.calls.filter((c) => c.method === "POST" && new URL(c.url).pathname.endsWith("/drafts")).length, sent: f.sent.length });

let m1: Awaited<ReturnType<typeof mail>>;
beforeEach(async () => {
  await h().delete(agentRuns);
  await h().delete(mailMessages);
  await h().delete(connections);
  await h().delete(settings);
  await h().delete(auditLog);
  await connect();
  await h().insert(settings).values({ key: MAIL_SYNC_KEY, value: { email: "owner@example.test" } });
  m1 = await mail("m-reply", "t-reply", "Agenda");
});

describe("mail.send_reply contract", () => {
  it("is APPROVE tier, in CONTENT_TOOLS, and maps to mail_reply", () => {
    expect(TOOLS["mail.send_reply"]).toMatchObject({ tier: "APPROVE", sideEffect: true, private: true });
    expect(CONTENT_TOOLS).toContain("mail.send_reply");
    expect(approvalKind("mail.send_reply")).toBe("mail_reply");
  });

  it("toApproval never throws on arbitrary model data", () => {
    const tool = TOOLS["mail.send_reply"]!;
    for (const bad of [{}, { to: "x", cc: 5, body: null }, { reason: 3 }, null as unknown as object]) {
      expect(() => tool.toApproval!((bad ?? {}) as never)).not.toThrow();
    }
  });
});

describe("recipients are server-filled", () => {
  it("never lets a model-supplied to/cc/threadId reach the approval or the sent MIME", async () => {
    const f = gmail();
    const evil = [{ name: "Eve", address: "attacker@evil.test" }];
    const { status, ap } = await propose({ messageId: m1.id, subject: "Re: Agenda", body: "Sure.", to: evil, cc: evil, threadId: "evil", inReplyTo: "<evil@evil.test>", references: "<evil@evil.test>" }, f);
    expect(status).toBe("waiting_approval");
    expect(ap).toMatchObject({ tool: "mail.send_reply" });
    expect(ap!.originalPayload).toMatchObject({ to: [{ name: "Lee Direct", address: "lee.direct@example.org" }], cc: [], threadId: "t-reply", inReplyTo: "<reply-1@example.org>", originalSubject: "Agenda", from: { name: "Lee List", address: "lee@example.org" } });
    expect(JSON.stringify(ap!.originalPayload)).not.toContain("evil");
    const [tc] = await h().select().from(toolCalls).where(eq(toolCalls.id, ap!.toolCallId));
    expect(tc!.tier).toBe("APPROVE");

    await approve(ap!.id);
    expect(await executeApproved(h(), ap!.id, { fetch: f })).toMatchObject({ status: "executed" });
    expect(f.sent).toHaveLength(1);
    const raw = f.sent[0]!.raw;
    expect(raw).not.toContain("evil");
    expect(raw).toMatch(/^To: "Lee Direct" <lee\.direct@example\.org>$/m);
    expect(raw).not.toMatch(/^Cc:/m);
    expect(f.sent[0]!.threadId).toBe("t-reply");
  });

  it("replyAll copies original To and Cc minus the owner and the recipient", async () => {
    const f = gmail();
    const m = await mail("m-multi", "t-multi", "Plans");
    const { ap } = await propose({ messageId: m.id, subject: "Re: Plans", body: "ok", replyAll: true }, f);
    const p = ap!.originalPayload as { to: { address: string }[]; cc: { address: string }[] };
    expect(p.to.map((a) => a.address)).toEqual(["amy@example.org"]);
    expect(p.cc.map((a) => a.address)).toEqual(["bob@example.org", "carol@example.org"]);
  });

  it("fails the call for an unknown message, an empty subject, and a missing compose scope", async () => {
    const f = gmail();
    const run = async () => (await h().insert(agentRuns).values({ agentId: "outreach", prompt: "p", model: "m" }).returning())[0]!.id;
    const call = async (input: unknown) => callTool({ handle: h(), runId: await run(), agentId: "outreach", tools: TOOLS, fetch: f }, "mail.send_reply", input, `tu_${Math.random()}`);
    expect(await call({ messageId: crypto.randomUUID(), subject: "s", body: "b" })).toMatchObject({ status: "error", error: "Unknown message." });
    expect(await call({ messageId: m1.id, subject: " ", body: "b" })).toMatchObject({ status: "error", error: "Add a subject." });
    await h().delete(connections);
    await connect([CAL, GMAIL_READ]);
    expect(await call({ messageId: m1.id, subject: "s", body: "b" })).toMatchObject({ status: "error", error: expect.stringContaining("Reconnect Google") });
  });
});

describe("approve, send and idempotency", () => {
  it("sends the edited body once as a threaded draft with deterministic headers; recipients stay locked", async () => {
    const f = gmail();
    const { ap } = await propose({ messageId: m1.id, subject: "Re: Agenda", body: "Original" }, f);
    const orig = ap!.originalPayload as Record<string, unknown>;
    expect(await decide(h(), ap!.id, "approve", { enqueue: noop, edited: { ...orig, to: [{ name: "", address: "x@example.org" }] } })).toMatchObject({ ok: false });
    await approve(ap!.id, { ...orig, body: SECRET_BODY });
    const out = await executeApproved(h(), ap!.id, { fetch: f });
    expect(counts(f)).toEqual({ creates: 1, sent: 1 });
    const d = f.sent[0]!;
    expect(d.threadId).toBe("t-reply");
    expect(d.raw).toMatch(/^In-Reply-To: <reply-1@example\.org>$/m);
    expect(d.raw).toMatch(/^References: <earlier-1@example\.org> <reply-1@example\.org>$/m);
    expect(d.raw).toContain(`Message-ID: <approval-${ap!.id}@lifeos.local>`);
    expect(Buffer.from(d.raw.split("\r\n\r\n")[1]!.replace(/\s/g, ""), "base64").toString()).toBe(SECRET_BODY);
    expect(out).toMatchObject({ status: "executed", result: { messageId: expect.any(String), threadId: "t-reply" } });
    expect((await row(ap!.id)).status).toBe("executed");
    // audit rows hold key names, never body text
    const audits = JSON.stringify(await h().select().from(auditLog));
    expect(audits).not.toContain("SECRET-BODY-TEXT");
    expect(audits).not.toContain("Original");
  });

  async function ambiguous(mode: "before" | "after", opts: { newId?: boolean } = {}) {
    const f = gmail();
    f.state.newIdOnSend = !!opts.newId;
    const { ap } = await propose({ messageId: m1.id, subject: "Re: Agenda", body: "Hello" }, f);
    await approve(ap!.id);
    const first = await executeApproved(h(), ap!.id, { fetch: flaky(f, mode) });
    expect(first).toMatchObject({ status: "failed", ambiguous: true });
    expect(await retryApproval(h(), ap!.id, { enqueue: noop })).toEqual({ ok: true });
    return { f, id: ap!.id };
  }

  it("adopt: the draft still exists -> sends it once", async () => {
    const { f, id } = await ambiguous("before");
    expect(await executeApproved(h(), id, { fetch: f })).toMatchObject({ status: "executed" });
    expect(counts(f)).toEqual({ creates: 1, sent: 1 });
  });

  it("adopt: the send landed (checkpointed message has SENT) -> no second send", async () => {
    const { f, id } = await ambiguous("after");
    expect(f.drafts.size).toBe(0);
    expect(await executeApproved(h(), id, { fetch: f })).toMatchObject({ status: "executed", result: { threadId: "t-reply" } });
    expect(counts(f)).toEqual({ creates: 1, sent: 1 });
  });

  it("adopt: the sent copy got a new id -> found by rfc822msgid, no second send", async () => {
    const { f, id } = await ambiguous("after", { newId: true });
    const out = await executeApproved(h(), id, { fetch: f });
    expect(out).toMatchObject({ status: "executed" });
    expect((out as { result: { messageId: string } }).result.messageId).toBe(f.sent[0]!.id);
    expect(counts(f)).toEqual({ creates: 1, sent: 1 });
  });

  it("adopt: nothing found -> builds and sends a new reply exactly once", async () => {
    const { f, id } = await ambiguous("before");
    f.drafts.clear(); // the draft vanished and nothing was sent
    expect(await executeApproved(h(), id, { fetch: f })).toMatchObject({ status: "executed" });
    expect(counts(f)).toEqual({ creates: 2, sent: 1 });
  });

  it("adopt: Gmail rewrote Message-ID and search lags -> the thread's SENT copy since the checkpoint is adopted (WR-S02)", async () => {
    const { f, id } = await ambiguous("after", { newId: true });
    f.state.searchBlind = true;
    const out = await executeApproved(h(), id, { fetch: f });
    expect(out).toMatchObject({ status: "executed", result: { messageId: f.sent[0]!.id, threadId: "t-reply" } });
    expect(counts(f)).toEqual({ creates: 1, sent: 1 });
  });

  it("a definite send failure deletes its draft; the retry sends exactly once and leaves no orphan (WR-S03)", async () => {
    const f = gmail();
    const { ap } = await propose({ messageId: m1.id, subject: "Re: Agenda", body: "Hello" }, f);
    await approve(ap!.id);
    f.state.rejectSend = true;
    expect(await executeApproved(h(), ap!.id, { fetch: f })).toMatchObject({ status: "failed", ambiguous: false });
    expect(f.drafts.size).toBe(0);
    f.state.rejectSend = false;
    expect(await retryApproval(h(), ap!.id, { enqueue: noop })).toEqual({ ok: true });
    expect(await executeApproved(h(), ap!.id, { fetch: f })).toMatchObject({ status: "executed" });
    expect(counts(f)).toEqual({ creates: 2, sent: 1 });
    expect(f.drafts.size).toBe(0);
  });

  it("a definite retry reuses a checkpointed draft that still exists instead of creating another (WR-S03)", async () => {
    const f = gmail();
    const { ap } = await propose({ messageId: m1.id, subject: "Re: Agenda", body: "Hello" }, f);
    await approve(ap!.id);
    // 400 on send and on the cleanup delete: the draft survives.
    const w = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const r = new Request(input, init);
      if (new URL(r.url).pathname.endsWith("/drafts/send") || r.method === "DELETE") return new Response(JSON.stringify({ error: { code: 400 } }), { status: 400 });
      return f(input, init);
    }) as typeof fetch;
    expect(await executeApproved(h(), ap!.id, { fetch: w })).toMatchObject({ status: "failed", ambiguous: false });
    expect(f.drafts.size).toBe(1);
    expect(await retryApproval(h(), ap!.id, { enqueue: noop })).toEqual({ ok: true });
    expect(await executeApproved(h(), ap!.id, { fetch: f })).toMatchObject({ status: "executed" });
    expect(counts(f)).toEqual({ creates: 1, sent: 1 });
    expect(f.drafts.size).toBe(0);
  });

  it("a 401 during send marks the Google connection errored and fails the approval definitively", async () => {
    const f = gmail();
    const { ap } = await propose({ messageId: m1.id, subject: "Re: Agenda", body: "Hello" }, f);
    await approve(ap!.id);
    f.state.unauthorized = true;
    expect(await executeApproved(h(), ap!.id, { fetch: f })).toMatchObject({ status: "failed", ambiguous: false });
    const [c] = await h().select().from(connections).where(eq(connections.id, "google_calendar"));
    expect(c!.status).toBe("error");
    expect(f.sent).toHaveLength(0);
  });
});

describe("saveReplyDraft", () => {
  it("creates a Gmail draft without the deterministic Message-ID and returns its id", async () => {
    const f = gmail();
    const r = await saveReplyDraft(h(), { messageId: m1.id, threadId: "t-reply", to: [{ name: "Lee", address: "lee@example.org" }], cc: [], inReplyTo: "<reply-1@example.org>", references: null, originalSubject: "Agenda", subject: "Re: Agenda", body: "Hi" }, { fetch: f });
    const d = f.drafts.get(r.draftId)!;
    expect(d.threadId).toBe("t-reply");
    expect(decode(Buffer.from(d.raw, "base64url").toString())).not.toMatch(/^Message-ID:/m);
    expect(f.sent).toHaveLength(0);
  });
});
