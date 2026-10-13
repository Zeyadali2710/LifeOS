import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRun, advance } from "@/server/agents/loop";
import { createThread } from "@/server/agents/threads";
import { TOOLS } from "@/server/agents/tools";
import type { ToolContext } from "@/server/agents/types";
import { saveCalendarSecret } from "@/server/calendar/connections";
import { GMAIL_COMPOSE, GMAIL_READ } from "@/server/calendar/google/client";
import { agentRuns, approvals, auditLog, connections, mailMessages, settings, taskDependencies, tasks } from "@/server/db/schema";
import { createProject } from "@/server/projects";
import { fakeGmail } from "../helpers/fake-gmail";
import { scriptedLlm } from "../helpers/fake-llm";
import { setupTestDb } from "./helpers";

const key = vi.hoisted(() => Buffer.alloc(32, 5).toString("base64"));
vi.mock("@/server/env", () => ({ env: () => ({ LIFEOS_MASTER_KEY: key }) }));

const t = setupTestDb();
vi.mock("@/server/db/client", async (orig) => ({ ...(await orig<object>()), db: () => t.handle() }));
vi.mock("@/server/session", () => ({ requireOwner: async () => undefined }));
const capState = vi.hoisted(() => ({ reached: false }));
vi.mock("@/server/agents/spend", async (orig) => {
  const m = await orig<typeof import("@/server/agents/spend")>();
  return { ...m, capStatus: async (...a: Parameters<typeof m.capStatus>) => (capState.reached ? { mtdUsd: 10, capUsd: 5, reached: true } : m.capStatus(...a)) };
});
const enqueue = vi.fn<(...a: unknown[]) => Promise<void>>(async () => undefined);
vi.mock("@/server/queue", () => ({ enqueue: (...a: unknown[]) => enqueue(...a), QUEUES: { mailTriage: "mail.triage", mailSync: "mail.sync" } }));

import {
  addMailTaskAction,
  archiveMailAction,
  flagMailAction,
  getMailBodyAction,
  saveReplyToDraftsAction,
  syncMailNowAction,
  triageMailAction,
} from "@/server/mail-actions";

const h = () => t.handle();
const CAL = "https://www.googleapis.com/auth/calendar";
const NOW = new Date("2026-10-13T00:00:00Z");
const connect = (scopes = [CAL, GMAIL_READ, GMAIL_COMPOSE]) =>
  saveCalendarSecret(h(), "google_calendar", { refreshToken: "r", accessToken: "tok", expiresAt: "2099-01-01T00:00:00Z" }, { account: "owner@example.test", scopes }, { key: Buffer.from(key, "base64") });

let f: ReturnType<typeof fakeGmail>;
let mail: typeof mailMessages.$inferSelect;

beforeEach(async () => {
  enqueue.mockClear();
  capState.reached = false;
  for (const tbl of [agentRuns, tasks, mailMessages, connections, settings, auditLog]) await h().delete(tbl);
  await connect();
  f = fakeGmail();
  vi.stubGlobal("fetch", f);
  const [m] = await h()
    .insert(mailMessages)
    .values({
      gmailId: "m-reply",
      threadId: "t-reply",
      subject: "Agenda",
      fromName: "Lee Direct",
      fromAddress: "lee.direct@example.org",
      receivedAt: new Date("2026-10-06T00:00:00Z"),
      actionItems: [{ text: "Send the slides", due: "2026-10-20" }, { text: "Book a room", due: "not a date" }],
    })
    .returning();
  mail = m!;
});

describe("getMailBodyAction", () => {
  it("fetches the body live without storing it", async () => {
    const before = await h().select().from(mailMessages).where(eq(mailMessages.id, mail.id));
    const r = await getMailBodyAction(mail.id);
    expect(r).toMatchObject({ ok: true, threadId: "t-reply" });
    expect(f.calls.some((c) => c.method === "GET" && c.url.includes("/messages/m-reply"))).toBe(true);
    expect(await h().select().from(mailMessages).where(eq(mailMessages.id, mail.id))).toEqual(before);
  });

  it("returns not_connected without the Gmail scope", async () => {
    await h().delete(connections);
    await connect([CAL]);
    expect(await getMailBodyAction(mail.id)).toEqual({ ok: false, error: "not_connected" });
  });
});

describe("archive and flag", () => {
  it("are local-only and reversible", async () => {
    const n = f.calls.length;
    expect(await archiveMailAction(mail.id, true)).toEqual({ ok: true });
    expect((await h().select().from(mailMessages))[0]!.archivedAt).not.toBeNull();
    expect(await archiveMailAction(mail.id, false)).toEqual({ ok: true });
    expect((await h().select().from(mailMessages))[0]!.archivedAt).toBeNull();
    expect(await flagMailAction(mail.id, true)).toEqual({ ok: true });
    expect((await h().select().from(mailMessages))[0]!.flaggedAt).not.toBeNull();
    expect(await flagMailAction(mail.id, false)).toEqual({ ok: true });
    expect((await h().select().from(mailMessages))[0]!.flaggedAt).toBeNull();
    expect(f.calls.length).toBe(n);
  });
});

describe("addMailTaskAction", () => {
  it("creates a linked task with subject and sender in the notes", async () => {
    const r = await addMailTaskAction(mail.id, 0);
    expect(r).toMatchObject({ ok: true, existed: false });
    const [tk] = await h().select().from(tasks);
    expect(tk).toMatchObject({ title: "Send the slides", dueDate: "2026-10-20", mailMessageId: mail.id });
    expect(tk!.notes).toContain("Agenda");
    expect(tk!.notes).toContain("Lee Direct");
  });

  it("keeps the task when the model date is unusable", async () => {
    expect(await addMailTaskAction(mail.id, 1)).toMatchObject({ ok: true });
    expect((await h().select().from(tasks))[0]).toMatchObject({ title: "Book a room", dueDate: null });
  });

  it("rejects an out-of-range item and returns the open task on repeat", async () => {
    expect(await addMailTaskAction(mail.id, 4)).toEqual({ ok: false, error: "not_found" });
    const a = await addMailTaskAction(mail.id, 0);
    const b = await addMailTaskAction(mail.id, 0);
    expect(b).toMatchObject({ ok: true, existed: true, taskId: (a as { taskId: string }).taskId });
    expect(await h().select().from(tasks)).toHaveLength(1);
  });
});

describe("triage and sync", () => {
  it("enqueues a deduped single-mail triage job", async () => {
    expect(await triageMailAction(mail.id)).toEqual({ ok: true });
    expect(enqueue).toHaveBeenCalledWith("mail.triage", { ids: [mail.id] }, { singletonKey: `mail.triage.one:${mail.id}` });
  });

  it("is paused at the spend cap and enqueues nothing", async () => {
    capState.reached = true;
    expect(await triageMailAction(mail.id)).toEqual({ ok: false, error: "paused" });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("syncs now with the shared singleton key", async () => {
    expect(await syncMailNowAction()).toEqual({ ok: true });
    expect(enqueue).toHaveBeenCalledWith("mail.sync", {}, { singletonKey: "mail.sync" });
  });
});

describe("agent-facing redaction (D-28)", () => {
  it("shows mail-linked tasks as private in tasks.list and projects.get", async () => {
    const p = await createProject(h(), { name: "Alpha" }, NOW);
    if (!p.ok) throw new Error("project");
    const [linked] = await h().insert(tasks).values({ title: "Wire $5000 to Eve", projectId: p.project.id, mailMessageId: mail.id }).returning();
    const [plain] = await h().insert(tasks).values({ title: "Plain task", projectId: p.project.id }).returning();
    const [other] = await h().insert(tasks).values({ title: "Other task", projectId: p.project.id }).returning();
    // blocker labels quote both titles, in either direction (WR-S04)
    await h().insert(taskDependencies).values([{ taskId: plain!.id, blockedByTaskId: linked!.id }, { taskId: linked!.id, blockedByTaskId: other!.id }]);
    const ctx = { handle: h(), runId: "r", agentId: "organization", toolUseId: "x", now: () => NOW } as ToolContext;

    const list = (await TOOLS["tasks.list"]!.handler({ which: "open", limit: 20 }, ctx)) as { items: { id: string; title: string }[] };
    expect(list.items.find((i) => i.id === linked!.id)!.title).toBe("Email follow-up (private)");
    expect(list.items.find((i) => i.title === "Plain task")).toBeTruthy();

    const get = (await TOOLS["projects.get"]!.handler({ project: p.project.id }, ctx)) as { tasks: { title: string }[] };
    expect(get.tasks.map((x) => x.title).sort()).toEqual(["Email follow-up (private)", "Other task", "Plain task"]);
    expect(JSON.stringify(get)).not.toContain("Eve");
    expect((get as unknown as { blockers: { label: string }[] }).blockers.map((b) => b.label).sort()).toEqual([
      'Task "Email follow-up (private)" is blocked by "Other task"',
      'Task "Plain task" is blocked by "Email follow-up (private)"',
    ]);

    const pl = (await TOOLS["projects.list"]!.handler({ limit: 20 }, ctx)) as { items: { nextTask: { title: string } | null }[] };
    expect(JSON.stringify(pl)).not.toContain("Eve");
  });
});

describe("saveReplyToDraftsAction", () => {
  async function pending(): Promise<string> {
    const threadId = await createThread(h(), "t");
    const r = await createRun(h(), { agentId: "outreach", prompt: "reply", threadId });
    if (!r.ok) throw new Error(r.code);
    const llm = scriptedLlm([{ toolUses: [{ name: "mail.send_reply", input: { messageId: mail.id, subject: "Re: Agenda", body: "Friday works." } }] }, { text: "Waiting" }]);
    expect(await advance(r.runId, { handle: h(), llm, fetch: f })).toBe("waiting_approval");
    return (await h().select().from(approvals).where(eq(approvals.runId, r.runId)))[0]!.id;
  }

  it("creates one threaded Gmail draft and rejects the approval with the draft id", async () => {
    const id = await pending();
    const r = await saveReplyToDraftsAction(id);
    expect(r).toMatchObject({ ok: true });
    expect(f.drafts.size).toBe(1);
    const [ap] = await h().select().from(approvals).where(eq(approvals.id, id));
    expect(ap).toMatchObject({ status: "rejected", result: { gmailDraftId: (r as { gmailDraftId: string }).gmailDraftId } });
    const [run] = await h().select().from(agentRuns).where(eq(agentRuns.id, ap!.runId));
    expect(run!.status).toBe("cancelled");
    const [a] = await h().select().from(auditLog).where(and(eq(auditLog.action, "approval.reject"), eq(auditLog.target, id)));
    expect(a!.metadata).toEqual({ approvalId: id, edited: false, movedToDrafts: true });
    expect(JSON.stringify(a!.metadata)).not.toContain("Friday");
  });

  it("deletes the draft and reports not_pending when the approval was decided meanwhile", async () => {
    const id = await pending();
    const racing = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await f(input, init);
      if ((init?.method ?? "GET") === "POST" && new URL(new Request(input, init).url).pathname.endsWith("/drafts")) {
        await h().update(approvals).set({ status: "approved" }).where(eq(approvals.id, id));
      }
      return res;
    }) as typeof fetch;
    vi.stubGlobal("fetch", racing);
    expect(await saveReplyToDraftsAction(id)).toEqual({ ok: false, error: "not_pending" });
    expect(f.drafts.size).toBe(0);
    expect(f.calls.some((c) => c.method === "DELETE")).toBe(true);
  });

  it("rejects an approval that is not pending before touching Gmail", async () => {
    const id = await pending();
    await h().update(approvals).set({ status: "approved" }).where(eq(approvals.id, id));
    const n = f.calls.length;
    expect(await saveReplyToDraftsAction(id)).toEqual({ ok: false, error: "not_pending" });
    expect(f.calls.length).toBe(n);
  });
});
