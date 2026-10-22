import { eq } from "drizzle-orm";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProject, deleteProject, updateProject } from "@/server/projects";
import { eventCreatePayload } from "@/lib/event-payload";
import { ProviderError } from "@/server/calendar/errors";
import { decide, executeApproved, expireDue, getApproval, listApprovals, retryApproval, saveEdit } from "@/server/agents/approvals";
import { advance, createRun, runQueued } from "@/server/agents/loop";
import { cancelRun } from "@/server/agents/runs";
import { createThread } from "@/server/agents/threads";
import { activityEvents, agentRuns, approvals, auditLog, githubRepos, notifications, projects, settings, threadMessages, toolCalls } from "@/server/db/schema";
import { saveToken } from "@/server/github/connections";
import { QUEUES } from "@/server/queue";
import user from "../fixtures/github/user.json";
import { fakeGithub } from "../helpers/fake-github";
import { scriptedLlm } from "../helpers/fake-llm";
import { setupTestDb } from "./helpers";

const key = vi.hoisted(() => Buffer.alloc(32, 7).toString("base64"));
vi.mock("@/server/env", () => ({ env: () => ({ LIFEOS_MASTER_KEY: key }) }));

const t = setupTestDb();
const h = () => t.handle();
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const created = (n = 5) => json({ number: n, html_url: `https://github.com/me/a/issues/${n}`, body: null }, 201);
const posts = (f: ReturnType<typeof fakeGithub>) => f.calls.filter((c) => c.method === "POST");

const connectWrite = async () => {
  await saveToken(h(), "github_write", "write_token_0002", {
    key: Buffer.from(key, "base64"),
    fetch: fakeGithub({ "GET /user": () => json({ ...user, login: "me" }), "GET /user/repos": () => json([{ full_name: "me/a" }]) }),
  });
  await h().insert(githubRepos).values({ id: 1, fullName: "me/a", private: true, defaultBranch: "main", htmlUrl: "u", pushedAt: new Date() }).onConflictDoNothing();
};

/** Scripted projects run suspended on create_issue. */
async function suspended() {
  await connectWrite();
  const threadId = await createThread(h(), "t");
  const r = await createRun(h(), { agentId: "projects", prompt: "file it", threadId });
  if (!r.ok) throw new Error(r.code);
  const llm = scriptedLlm([{ toolUses: [{ name: "github.create_issue", input: { repo: "me/a", title: "Bug", body: "b" } }] }, { text: "Created it" }]);
  expect(await advance(r.runId, { handle: h(), llm })).toBe("waiting_approval");
  const [ap] = await h().select().from(approvals).where(eq(approvals.runId, r.runId));
  return { runId: r.runId, id: ap!.id, llm };
}
const row = async (id: string) => (await h().select().from(approvals).where(eq(approvals.id, id)))[0]!;
const run = async (id: string) => (await h().select().from(agentRuns).where(eq(agentRuns.id, id)))[0]!;

beforeEach(async () => {
  await h().delete(agentRuns);
  await h().delete(settings);
  await h().delete(activityEvents);
  await h().delete(notifications);
  await h().delete(auditLog);
});

describe("decide", () => {
  it("approve is compare-and-set and enqueues once", async () => {
    const { id, runId } = await suspended();
    const enqueue = vi.fn(async () => {});
    const [a, b] = await Promise.all([decide(h(), id, "approve", { enqueue }), decide(h(), id, "approve", { enqueue })]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(await decide(h(), id, "approve", { enqueue })).toEqual({ ok: false, reason: "not_pending" });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(QUEUES.resume, { runId, approvalId: id }, { singletonKey: `resume:${id}` });
    expect(await row(id)).toMatchObject({ status: "approved" });
    expect((await row(id)).decidedAt).not.toBeNull();
  });

  it("refuses an expired approval", async () => {
    const { id } = await suspended();
    await h().update(approvals).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await decide(h(), id, "approve", { enqueue: async () => {} })).toEqual({ ok: false, reason: "not_pending" });
  });

  it("edit validates, stores and audits both versions", async () => {
    const { id } = await suspended();
    expect(await saveEdit(h(), id, { repo: "me/a", title: "", body: "", labels: [] })).toEqual({ ok: false, errors: { title: "Title is required." } });
    expect(await saveEdit(h(), id, { repo: "me/a", title: "Better", body: "", labels: [] })).toEqual({ ok: true });
    expect((await row(id)).editedPayload).toMatchObject({ title: "Better" });
    const [a] = await h().select().from(auditLog).where(eq(auditLog.action, "approval.edit"));
    expect(a!.metadata).toMatchObject({ original: { title: "Bug" }, edited: { title: "Better" } });
    await h().update(approvals).set({ status: "rejected" });
    expect(await saveEdit(h(), id, { repo: "me/a", title: "x", body: "", labels: [] })).toMatchObject({ ok: false });
  });

  it("reject cancels the run and never posts", async () => {
    const { id, runId } = await suspended();
    expect(await decide(h(), id, "reject")).toEqual({ ok: true });
    expect((await row(id)).status).toBe("rejected");
    expect((await run(runId)).status).toBe("cancelled");
    expect((await h().select().from(toolCalls).where(eq(toolCalls.runId, runId)))[0]!.status).toBe("cancelled");
    const f = fakeGithub({ "POST /repos/me/a/issues": () => created() });
    expect(await executeApproved(h(), id, { fetch: f })).toEqual({ status: "skipped" });
    expect(posts(f)).toHaveLength(0);
  });
});

describe("executeApproved", () => {
  it("executes once with the edited payload, then resumes the run", async () => {
    const { id, runId, llm } = await suspended();
    await decide(h(), id, "approve", { edited: { repo: "me/a", title: "Edited", body: "b", labels: [] }, enqueue: async () => {} });
    const f = fakeGithub({ "POST /repos/me/a/issues": () => created(7) });
    const out = await executeApproved(h(), id, { fetch: f });
    expect(out).toEqual({ status: "executed", result: { number: 7, url: "https://github.com/me/a/issues/7" } });
    expect(await executeApproved(h(), id, { fetch: f })).toEqual(out);
    expect(posts(f)).toHaveLength(1);
    expect((posts(f)[0]!.body as { title: string }).title).toBe("Edited");
    expect((await h().select().from(toolCalls).where(eq(toolCalls.runId, runId)))[0]).toMatchObject({ status: "done", output: { number: 7 } });
    expect(await runQueued(h(), runId, { llm })).toBe("completed");
    const r = await run(runId);
    expect(r.answer).toBe("Created it");
    expect((await h().select().from(threadMessages).where(eq(threadMessages.threadId, r.threadId!))).some((m) => m.content === "Created it")).toBe(true);
  });

  it("definite failure stays waiting; retry reuses the approval id", async () => {
    const { id, runId } = await suspended();
    await decide(h(), id, "approve", { enqueue: async () => {} });
    const bad = fakeGithub({ "POST /repos/me/a/issues": () => json({ message: "Validation Failed" }, 422) });
    const out = await executeApproved(h(), id, { fetch: bad });
    expect(out).toMatchObject({ status: "failed", ambiguous: false });
    expect(await row(id)).toMatchObject({ status: "failed", ambiguous: false, error: expect.stringContaining("GitHub rejected it:") });
    expect((await run(runId)).status).toBe("waiting_approval");
    const enqueue = vi.fn(async () => {});
    expect(await retryApproval(h(), id, { enqueue })).toEqual({ ok: true });
    expect(enqueue).toHaveBeenCalledTimes(1);
    const ok = fakeGithub({ "POST /repos/me/a/issues": () => created() });
    expect((await executeApproved(h(), id, { fetch: ok })).status).toBe("executed");
  });

  it("network failure is ambiguous and the retry adopts", async () => {
    const { id } = await suspended();
    await decide(h(), id, "approve", { enqueue: async () => {} });
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await executeApproved(h(), id, { fetch: down })).toMatchObject({ status: "failed", ambiguous: true });
    await retryApproval(h(), id, { enqueue: async () => {} });
    const adopt = fakeGithub({ "GET /repos/me/a/issues": () => json([]), "POST /repos/me/a/issues": () => created(9) });
    expect((await executeApproved(h(), id, { fetch: adopt })).status).toBe("executed");
    expect(adopt.calls[0]!.method).toBe("GET");
  });
});

describe("expireDue and lists", () => {
  it("expires after 7 days, notifies, and blocks later decisions", async () => {
    const { id, runId } = await suspended();
    const now = new Date(Date.now() + 8 * 86_400_000);
    expect(await expireDue(h(), now, { enqueue: async () => {} })).toBe(1);
    expect((await row(id)).status).toBe("expired");
    expect((await run(runId)).status).toBe("expired");
    const [n] = await h().select().from(notifications).where(eq(notifications.title, "Approval expired"));
    expect(n).toMatchObject({
      category: "FYI",
      body: 'The issue "Bug" was not created. Nothing ran after the request expired.',
      actionUrl: `/agents?view=approvals&id=${id}`,
    });
    expect(await decide(h(), id, "approve", { enqueue: async () => {} })).toEqual({ ok: false, reason: "not_pending" });
  });

  it("re-enqueues approvals stuck in approved", async () => {
    const { id } = await suspended();
    await decide(h(), id, "approve", { enqueue: async () => {} });
    const enqueue = vi.fn(async () => {});
    await expireDue(h(), new Date(Date.now() + 3 * 60_000), { enqueue });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("recovers approvals stuck in executing as failed+ambiguous", async () => {
    const { id } = await suspended();
    await decide(h(), id, "approve", { enqueue: async () => {} });
    await h().update(approvals).set({ status: "executing" }).where(eq(approvals.id, id));
    await expireDue(h(), new Date(Date.now() + 3 * 60_000), { enqueue: async () => {} });
    expect(await row(id)).toMatchObject({ status: "failed", ambiguous: true });
    expect(await retryApproval(h(), id, { enqueue: async () => {} })).toEqual({ ok: true });
  });

  it("cancelling the run cancels an approved approval and nothing is posted", async () => {
    const { id, runId } = await suspended();
    await decide(h(), id, "approve", { enqueue: async () => {} });
    expect(await cancelRun(h(), runId)).toBe(true);
    expect((await row(id)).status).toBe("cancelled");
    const f = fakeGithub({ "POST /repos/me/a/issues": () => created() });
    expect(await executeApproved(h(), id, { fetch: f })).toEqual({ status: "skipped" });
    expect(posts(f)).toHaveLength(0);
  });

  it("refuses to execute for a cancelled run even if the approval is still approved", async () => {
    const { id, runId } = await suspended();
    await decide(h(), id, "approve", { enqueue: async () => {} });
    await h().update(agentRuns).set({ status: "cancelled" }).where(eq(agentRuns.id, runId));
    const f = fakeGithub({ "POST /repos/me/a/issues": () => created() });
    expect(await executeApproved(h(), id, { fetch: f })).toEqual({ status: "skipped" });
    expect(posts(f)).toHaveLength(0);
  });

  it("lists and gets DTOs with repoPrivate", async () => {
    const { id } = await suspended();
    expect((await listApprovals(h(), "pending")).map((a) => a.id)).toEqual([id]);
    expect(await listApprovals(h(), "resolved")).toEqual([]);
    expect(await getApproval(h(), id)).toMatchObject({ id, repoPrivate: true });
    expect(await getApproval(h(), "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("calendar kind", () => {
  const ev = {
    calendarId: "11111111-1111-4111-8111-111111111111",
    calendarLabel: "Personal",
    provider: "google",
    title: "Lunch",
    start: "2026-10-12T01:00:00Z",
    end: "2026-10-12T02:00:00Z",
  };

  it("validates, locks, maps ProviderError and expires per kind", async () => {
    const { id } = await suspended();
    await h().update(approvals).set({ tool: "calendar.create_event", originalPayload: ev, editedPayload: null }).where(eq(approvals.id, id));
    let n = 0;
    const tools = {
      "calendar.create_event": {
        name: "calendar.create_event",
        label: "create calendar event",
        description: "x",
        input: eventCreatePayload,
        output: z.unknown(),
        tier: "APPROVE",
        sideEffect: true,
        handler: async () => {
          if (n++ === 0) throw new ProviderError("google", "client", 400, "Invalid time");
          return { eventId: "e1" };
        },
      },
    } as never;
    const enqueue = async () => {};
    expect(await decide(h(), id, "approve", { enqueue, edited: { ...ev, calendarId: "22222222-2222-4222-8222-222222222222" } })).toMatchObject({
      ok: false,
      errors: { calendarId: "Calendar can't be changed." },
    });
    expect(await decide(h(), id, "approve", { enqueue, edited: { ...ev, title: "Brunch" } })).toMatchObject({ ok: true });
    // calendar edits audit field names only, never event text (WR-A06)
    const [edit] = await h().select().from(auditLog).where(eq(auditLog.action, "approval.edit"));
    expect((edit!.metadata as { changed: string[] }).changed).toContain("title");
    expect(JSON.stringify(edit!.metadata)).not.toMatch(/Lunch|Brunch/);
    expect(await executeApproved(h(), id, { tools })).toEqual({ status: "failed", error: "Google rejected it: Invalid time", ambiguous: false });
    expect(await retryApproval(h(), id, { enqueue })).toEqual({ ok: true });
    expect(await executeApproved(h(), id, { tools })).toEqual({ status: "executed", result: { eventId: "e1" } });

    const s2 = await suspended();
    await h().update(approvals).set({ tool: "calendar.create_event", originalPayload: ev, expiresAt: new Date(Date.now() - 1000) }).where(eq(approvals.id, s2.id));
    await expireDue(h());
    const [note] = await h().select().from(notifications).where(eq(notifications.title, "Approval expired"));
    expect(note!.body).toContain("Nothing was created.");
  });
});

describe("project kinds", () => {
  const draft = { name: "Studio", description: "", context: "", category: "personal", priority: 2, targetDate: null, milestones: [], tasks: [{ ref: "t", title: "T" }], links: [{ kind: "url", label: "Docs", url: "https://a.example" }], sources: ["s"] };

  async function projUpdate() {
    const { id } = await suspended();
    const res = await createProject(h(), { name: "Old" }, new Date());
    if (!res.ok) throw new Error("project");
    const [p] = await h().select().from(projects).where(eq(projects.id, res.project.id));
    const payload = {
      projectId: p!.id,
      before: { name: p!.name, updatedAt: p!.updatedAt.toISOString(), fields: { name: p!.name, description: "", context: "", category: p!.category, priority: p!.priority, targetDate: null }, milestones: [], tasks: [] },
      changes: { name: "New" },
      milestones: [],
      tasks: [],
      links: [],
      sources: [],
    };
    await h().update(approvals).set({ tool: "projects.update", originalPayload: payload, editedPayload: null }).where(eq(approvals.id, id));
    return { id, pid: p!.id };
  }

  it("flags a project_update whose project changed or vanished", async () => {
    const { id, pid } = await projUpdate();
    expect((await getApproval(h(), id))?.targetChanged).toBe(false);
    await updateProject(h(), pid, { name: "Touched" }, new Date(Date.now() + 5000));
    expect((await getApproval(h(), id))?.targetChanged).toBe(true);
    await deleteProject(h(), pid, true);
    expect((await getApproval(h(), id))?.targetChanged).toBe(true);
  });

  it("expiry copy says nothing was created", async () => {
    const { id } = await suspended();
    await h().update(approvals).set({ tool: "projects.create", originalPayload: draft, expiresAt: new Date(Date.now() - 1000) }).where(eq(approvals.id, id));
    await expireDue(h());
    const [n] = await h().select().from(notifications).where(eq(notifications.title, "Approval expired"));
    expect(n!.body).toBe('The project request "Studio" expired. Nothing was created. Nothing ran after the request expired.');
  });

  it("approve re-validates edits: links only removable, sources locked", async () => {
    const { id } = await suspended();
    await h().update(approvals).set({ tool: "projects.create", originalPayload: draft, editedPayload: null }).where(eq(approvals.id, id));
    const enqueue = async () => {};
    const more = [...draft.links, { kind: "url", label: "New", url: "https://b.example" }];
    expect(await decide(h(), id, "approve", { enqueue, edited: { ...draft, links: more } })).toMatchObject({ ok: false, errors: { links: "Links can only be removed." } });
    expect(await decide(h(), id, "approve", { enqueue, edited: { ...draft, sources: [] } })).toMatchObject({ ok: false, errors: { sources: "This can't be changed." } });
    expect((await row(id)).status).toBe("pending");
  });
});
