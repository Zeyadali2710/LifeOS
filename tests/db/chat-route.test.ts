import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatEvent } from "@/lib/agent-types";
import { setGlobalPause } from "@/server/agents/runs";
import { createThread } from "@/server/agents/threads";
import { threadDetail } from "@/server/agents/chat";
import { activityEvents, agentRuns, settings, threadMessages, threads } from "@/server/db/schema";
import { scriptedLlm } from "../helpers/fake-llm";
import { setupTestDb } from "./helpers";

const m = vi.hoisted(() => ({ session: true as boolean, llm: null as unknown, handle: null as unknown }));
vi.mock("@/server/auth", () => ({ auth: () => ({ api: { getSession: async () => (m.session ? { user: {} } : null) } }) }));
vi.mock("@/server/db/client", async (orig) => ({ ...(await orig<object>()), db: () => m.handle }));
vi.mock("@/server/agents/llm", () => ({ getLlm: () => m.llm }));
vi.mock("@/server/env", () => ({ env: () => ({ BETTER_AUTH_URL: "https://lifeos.example.ts.net" }) }));

import { POST } from "@/app/api/chat/route";

const t = setupTestDb();
const h = () => t.handle();
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("http://localhost/api/chat", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
const lines = async (res: Response) =>
  (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l) as ChatEvent);

beforeEach(async () => {
  m.handle = h();
  m.session = true;
  m.llm = scriptedLlm([]);
  await h().delete(agentRuns);
  await h().delete(threads);
  await h().delete(settings);
  await h().delete(activityEvents);
});

describe("POST /api/chat", () => {
  it("rejects bad requests", async () => {
    m.session = false;
    expect((await post({ prompt: "hi" })).status).toBe(401);
    m.session = true;
    expect((await POST(new Request("http://localhost/api/chat", { method: "POST", headers: { "content-type": "text/plain" }, body: "x" }))).status).toBe(415);
    expect((await post({ prompt: "hi" }, { origin: "http://evil.test" })).status).toBe(403);
    // Behind tailscale serve request.url is internal; the public origin must still pass.
    expect((await post({ prompt: "" }, { origin: "https://lifeos.example.ts.net" })).status).toBe(400);
    expect((await post({ prompt: "" })).status).toBe(400);
    expect((await post({ prompt: "x".repeat(8001) })).status).toBe(400);
  });

  it("returns 400 for an unknown thread and leaves no message behind when blocked", async () => {
    const bad = await post({ prompt: "hi", threadId: "00000000-0000-4000-8000-000000000000" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe("invalid");
    await setGlobalPause(h(), true);
    const thId = await createThread(h(), "t");
    expect((await post({ prompt: "hi", threadId: thId })).status).toBe(409);
    expect(await h().select().from(threadMessages).where(eq(threadMessages.threadId, thId))).toHaveLength(0);
  });

  it("blocks before any run is created", async () => {
    m.llm = null;
    const r = await post({ prompt: "hi" });
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("no_key");
    m.llm = scriptedLlm([]);
    await setGlobalPause(h(), true);
    expect((await (await post({ prompt: "hi" })).json()).code).toBe("paused");
    await setGlobalPause(h(), false);
    await h().insert(settings).values({ key: "ai.spend_cap_usd", value: 1 });
    await h().insert(agentRuns).values({ agentId: "orchestrator", prompt: "p", model: "m", status: "completed", costUsd: "5", startedAt: new Date(), parentRunId: null });
    const cap = await post({ prompt: "hi" });
    expect(cap.status).toBe(409);
    expect(await cap.json()).toMatchObject({ code: "cap", capUsd: 1 });
    expect(await h().select().from(agentRuns)).toHaveLength(1);
  });

  it("rate limits the 11th run in a minute", async () => {
    await h().insert(agentRuns).values(Array.from({ length: 10 }, () => ({ agentId: "orchestrator", prompt: "p", model: "m", status: "completed" as const })));
    const r = await post({ prompt: "hi" });
    expect(r.status).toBe(429);
    expect((await r.json()).code).toBe("rate_limited");
  });

  it("streams a delegating run and continues the thread", async () => {
    const llm1 = scriptedLlm([
      { toolUses: [{ name: "delegate", input: { agentId: "projects", task: "look" } }] },
      { text: "child done" },
      { text: "All good." },
    ]);
    m.llm = llm1;
    const res = await post({ prompt: "How are projects?" });
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const ev = await lines(res);
    expect(ev[0]).toMatchObject({ k: "run" });
    const threadId = (ev[0] as Extract<ChatEvent, { k: "run" }>).threadId;
    const last = ev.at(-1) as Extract<ChatEvent, { k: "done" }>;
    expect(last.k).toBe("done");
    expect(last.run.status).toBe("completed");
    expect(ev.some((e) => e.k === "step" && e.step.kind === "delegate")).toBe(true);
    expect(ev.filter((e) => e.k === "delta" && e.runId === last.run.id).map((e) => (e as { text: string }).text).join("")).toBe("All good.");

    const detail = await threadDetail(h(), threadId);
    expect(detail!.thread.title).toBe("How are projects?");
    expect(detail!.turns).toHaveLength(1);
    expect(detail!.turns[0]!.steps.length).toBeGreaterThan(0);

    const llm2 = scriptedLlm([{ text: "again" }]);
    m.llm = llm2;
    await lines(await post({ prompt: "and now?", threadId }));
    const msgs = llm2.calls[0]!.messages;
    expect(msgs.slice(0, 3).map((x) => x.role)).toEqual(["user", "assistant", "user"]); // array is mutated after the call
    expect(msgs[0]!.content).toBe("How are projects?");
  });
});
