import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { advance, createRun } from "@/server/agents/loop";
import { agentRuns, approvals, githubRepos } from "@/server/db/schema";
import { saveToken } from "@/server/github/connections";
import user from "../fixtures/github/user.json";
import { fakeGithub } from "../helpers/fake-github";
import { scriptedLlm } from "../helpers/fake-llm";
import { setupTestDb } from "./helpers";

const key = vi.hoisted(() => Buffer.alloc(32, 7).toString("base64"));
vi.mock("@/server/env", () => ({ env: () => ({ LIFEOS_MASTER_KEY: key }) }));
const t = setupTestDb();
vi.mock("@/server/db/client", async (orig) => ({ ...(await orig<object>()), db: () => t.handle() }));
vi.mock("@/server/queue", async (orig) => ({ ...(await orig<object>()), enqueue: async () => {} }));
let denied = false;
vi.mock("@/server/session", () => ({
  requireOwner: async () => {
    if (denied) throw new Error("redirect");
  },
}));
let llm: ReturnType<typeof scriptedLlm> | null = null;
vi.mock("@/server/agents/llm", () => ({ getLlm: () => llm }));

import { approveAction, rejectAction, retryApprovalAction, saveEditAction } from "@/server/approval-actions";
import { handleExpire, handleResume } from "@/worker/jobs/agents";

const h = () => t.handle();
const json = (b: unknown) => new Response(JSON.stringify(b));
const edit = { repo: "me/a", title: "Edited", body: "", labels: [] };

async function suspended() {
  await saveToken(h(), "github_write", "write_token_0002", {
    key: Buffer.from(key, "base64"),
    fetch: fakeGithub({ "GET /user": () => json({ ...user, login: "me" }), "GET /user/repos": () => json([{ full_name: "me/a" }]) }),
  });
  await h().insert(githubRepos).values({ id: 1, fullName: "me/a", private: false, defaultBranch: "main", htmlUrl: "u", pushedAt: new Date() }).onConflictDoNothing();
  const r = await createRun(h(), { agentId: "projects", prompt: "go" });
  if (!r.ok) throw new Error(r.code);
  const script = scriptedLlm([{ toolUses: [{ name: "github.create_issue", input: { repo: "me/a", title: "Bug" } }] }, { text: "ok" }]);
  await advance(r.runId, { handle: h(), llm: script });
  llm = script;
  const [ap] = await h().select().from(approvals).where(eq(approvals.runId, r.runId));
  return { runId: r.runId, id: ap!.id };
}
const status = async (id: string) => (await h().select().from(approvals).where(eq(approvals.id, id)))[0]!.status;

beforeEach(async () => {
  denied = false;
  await h().delete(agentRuns);
});

describe("approval actions", () => {
  it("require the owner and change nothing otherwise", async () => {
    const { id } = await suspended();
    denied = true;
    for (const f of [() => approveAction(id), () => rejectAction(id), () => saveEditAction(id, edit), () => retryApprovalAction(id)]) {
      expect(await f().then(() => "ok", (e: Error) => e.message)).toBe("redirect");
    }
    expect(await status(id)).toBe("pending");
  });

  it("validates ids and edited payloads", async () => {
    const { id } = await suspended();
    expect(await approveAction("not-a-uuid")).toEqual({ ok: false });
    const r = await approveAction(id, { ...edit, title: "x".repeat(300) });
    expect(r.ok).toBe(false);
    expect(r.errors?.title).toBeTruthy();
    expect(await status(id)).toBe("pending");
  });

  it("saves edits, approves and rejects", async () => {
    const a = await suspended();
    expect(await saveEditAction(a.id, edit)).toMatchObject({ ok: true, approval: { edited: { title: "Edited" } } });
    expect(await approveAction(a.id)).toMatchObject({ ok: true, approval: { status: "approved" } });
    expect(await approveAction(a.id)).toMatchObject({ ok: false });
    const b = await suspended();
    expect(await rejectAction(b.id)).toMatchObject({ ok: true, approval: { status: "rejected" } });
  });
});

describe("worker handlers", () => {
  it("handleResume executes the approval and finishes the run", async () => {
    const { id, runId } = await suspended();
    await approveAction(id);
    const f = fakeGithub({ "POST /repos/me/a/issues": () => json({ number: 3, html_url: "https://github.com/me/a/issues/3", body: null }) });
    vi.stubGlobal("fetch", f);
    await handleResume({ runId, approvalId: id });
    vi.unstubAllGlobals();
    expect(await status(id)).toBe("executed");
    expect((await h().select().from(agentRuns).where(eq(agentRuns.id, runId)))[0]).toMatchObject({ status: "completed", answer: "ok" });
  });

  it("handleResume fails the run without an API key and swallows bad input", async () => {
    const { id, runId } = await suspended();
    await rejectAction(id); // nothing executes
    const r2 = await suspended();
    llm = null;
    await handleResume({ runId: r2.runId });
    expect((await h().select().from(agentRuns).where(eq(agentRuns.id, r2.runId)))[0]).toMatchObject({ status: "failed", errorKind: "llm" });
    await expect(handleResume({ nope: 1 })).resolves.toBeUndefined();
    expect(runId).toBeTruthy();
  });

  it("handleExpire expires due approvals", async () => {
    const { id } = await suspended();
    await h().update(approvals).set({ expiresAt: new Date(Date.now() - 1000) });
    await handleExpire();
    expect(await status(id)).toBe("expired");
  });
});
