import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callTool } from "@/server/agents/gateway";
import { mailTools } from "@/server/agents/tools/mail";
import { outreachTools } from "@/server/agents/tools/outreach";
import { TOOLS } from "@/server/agents/tools";
import { saveCalendarSecret } from "@/server/calendar/connections";
import { GMAIL_READ } from "@/server/calendar/google/client";
import { agentRuns, connections, mailMessages, outreachEvents, permissions, toolCalls } from "@/server/db/schema";
import { fakeTools } from "../helpers/fake-tools";
import { fakeGmail } from "../helpers/fake-gmail";
import { setupTestDb } from "./helpers";

const key = vi.hoisted(() => Buffer.alloc(32, 9).toString("base64"));
vi.mock("@/server/env", () => ({ env: () => ({ LIFEOS_MASTER_KEY: key }) }));
const ft = fakeTools();
const names = [...Object.keys(outreachTools), ...Object.keys(mailTools), "test.exec"];
vi.mock("@/server/agents/registry", async (orig) => ({
  ...(await orig<object>()),
  getAgent: () => ({ id: "outreach", name: "Outreach", live: true, tools: names }),
}));

const t = setupTestDb();
const h = () => t.handle();
const NOW = new Date("2026-10-13T00:00:00Z");
const tools = { ...outreachTools, ...mailTools, "test.exec": ft.tools["test.exec"]! };
let runId = "";
const call = (name: string, input: unknown, fetch?: typeof globalThis.fetch) =>
  callTool({ handle: h(), runId, agentId: "outreach", tools, now: () => NOW, fetch }, name, input, `tu_${Math.random()}`);
const output = (r: Awaited<ReturnType<typeof call>>) => (r as { output: Record<string, unknown> }).output;
const items = (r: Awaited<ReturnType<typeof call>>) => output(r).items as Record<string, unknown>[];

async function event(title: string, o: Partial<typeof outreachEvents.$inferInsert> = {}) {
  const [e] = await h()
    .insert(outreachEvents)
    .values({ title, titleKey: title.toLowerCase(), startAt: new Date("2026-10-25T08:00:00Z"), isMock: false, description: "d".repeat(5000), ...o })
    .returning();
  return e!;
}
async function mail(gmailId: string, o: Partial<typeof mailMessages.$inferInsert> = {}) {
  const [m] = await h().insert(mailMessages).values({ gmailId, threadId: `t-${gmailId}`, receivedAt: NOW, labelIds: ["INBOX"], ...o }).returning();
  return m!;
}
const connect = (scopes: string[]) =>
  saveCalendarSecret(h(), "google_calendar", { refreshToken: "r", accessToken: "tok", expiresAt: "2099-01-01T00:00:00Z" }, { account: "owner@example.test", scopes });

beforeEach(async () => {
  await h().delete(outreachEvents);
  await h().delete(mailMessages);
  await h().delete(connections);
  await h().delete(permissions);
  await h().delete(agentRuns);
  const [r] = await h().insert(agentRuns).values({ agentId: "outreach", prompt: "p", model: "m" }).returning();
  runId = r!.id;
});

describe("tool contracts", () => {
  it("are READ and side-effect free; mail is private, outreach is not; all four are registered", () => {
    for (const n of Object.keys(outreachTools)) expect(TOOLS[n]).toMatchObject({ tier: "READ", sideEffect: false, private: false });
    for (const n of Object.keys(mailTools).filter((x) => x !== "mail.send_reply")) expect(TOOLS[n]).toMatchObject({ tier: "READ", sideEffect: false, private: true });
    expect(Object.keys(outreachTools).sort()).toEqual(["outreach.get_event", "outreach.list_events"]);
    expect(Object.keys(mailTools).sort()).toEqual(["mail.get_message", "mail.list", "mail.send_reply"]); // send_reply is APPROVE: covered in mail-agent.test.ts
  });
});

describe("outreach tools", () => {
  it("list_events filters by stage, minScore and dates, excludes dismissed, omits descriptions", async () => {
    await event("Saved one", { stage: "SAVED", score: 80 });
    await event("Fresh", { score: 20, startAt: new Date("2026-11-20T08:00:00Z") });
    await event("Gone", { dismissedAt: NOW });
    expect(items(await call("outreach.list_events", {})).map((e) => e.title)).toEqual(["Saved one", "Fresh"]);
    expect(items(await call("outreach.list_events", { stage: "SAVED" })).map((e) => e.title)).toEqual(["Saved one"]);
    expect(items(await call("outreach.list_events", { stage: "discovered" })).map((e) => e.title)).toEqual(["Fresh"]);
    expect(items(await call("outreach.list_events", { minScore: 50 })).map((e) => e.title)).toEqual(["Saved one"]);
    expect(items(await call("outreach.list_events", { from: "2026-11-01" })).map((e) => e.title)).toEqual(["Fresh"]);
    expect(items(await call("outreach.list_events", { to: "2026-10-25" })).map((e) => e.title)).toEqual(["Saved one"]);
    const first = items(await call("outreach.list_events", {}))[0]!;
    expect(Object.keys(first)).toEqual(["id", "title", "start", "location", "score", "why", "stage", "isMock", "url"]);
    expect(JSON.stringify(first)).not.toContain("dddd");
  });

  it("get_event cuts the description at 2000 chars, is untrusted, and unknown ids are not_found", async () => {
    const e = await event("Big");
    const o = output(await call("outreach.get_event", { id: e.id }));
    expect((o.description as string).length).toBe(2000);
    expect(o).toMatchObject({ untrusted: true, title: "Big" });
    expect(await call("outreach.get_event", { id: "00000000-0000-4000-8000-000000000000" })).toHaveProperty("error");
  });
});

describe("mail tools", () => {
  it("list filters by category, importance, sender and escaped text; hides archived by default; caps limit", async () => {
    await mail("a", { fromName: "Ann", fromAddress: "ann@x.test", subject: "Invoice 100%", category: "IMPORTANT", importance: "HIGH" });
    await mail("b", { fromName: "Bob", fromAddress: "bob@y.test", subject: "Hello", category: "OTHER", importance: "LOW", summary: "lunch plans" });
    await mail("c", { subject: "Old", archivedAt: NOW });
    await mail("d", { subject: "Archived in Gmail", labelIds: [] });
    const subj = async (i: object) => items(await call("mail.list", i)).map((m) => m.subject).sort();
    expect(output(await call("mail.list", {}))).toMatchObject({ untrusted: true });
    expect(await subj({})).toEqual(["Hello", "Invoice 100%"]);
    expect(await subj({ includeArchived: true })).toEqual(["Archived in Gmail", "Hello", "Invoice 100%", "Old"]);
    expect(await subj({ category: "IMPORTANT" })).toEqual(["Invoice 100%"]);
    expect(await subj({ importance: "LOW" })).toEqual(["Hello"]);
    expect(await subj({ sender: "bob@y" })).toEqual(["Hello"]);
    expect(await subj({ text: "lunch" })).toEqual(["Hello"]);
    expect(await subj({ text: "%" })).toEqual(["Invoice 100%"]); // LIKE wildcard is escaped
    expect(await call("mail.list", { limit: 51 })).toHaveProperty("error");
  });

  it("get_message fetches the body live as plain text, never stores it", async () => {
    await connect([GMAIL_READ]);
    const m = await mail("m-html");
    const before = JSON.stringify(await h().select().from(mailMessages));
    const f = fakeGmail();
    const o = output(await call("mail.get_message", { id: m.id }, f));
    expect(o).toMatchObject({ connected: true, untrusted: true, htmlOnly: true, truncated: false, subject: "Welcome" });
    expect(o.body).toContain("Welcome!");
    expect(o.body as string).not.toContain("<img");
    expect(f.calls.some((c) => c.url.includes("format=full"))).toBe(true);
    expect(JSON.stringify(await h().select().from(mailMessages))).toBe(before);
  });

  it("get_message returns a not-connected result without any Gmail call when gmail.readonly is missing", async () => {
    await connect(["https://www.googleapis.com/auth/calendar"]);
    const m = await mail("m-html");
    const f = fakeGmail();
    const r = await call("mail.get_message", { id: m.id }, f);
    expect(output(r)).toMatchObject({ connected: false, untrusted: true, message: "Gmail isn't allowed. Reconnect Google in Settings → Connections." });
    expect(f.calls).toHaveLength(0);
  });

  it("get_message truncates at 16 KB", async () => {
    await connect([GMAIL_READ]);
    const m = await mail("m-big");
    const f = fakeGmail({
      messages: [
        {
          id: "m-big", threadId: "t", labelIds: ["INBOX"], snippet: "", internalDate: "1", historyId: "1",
          payload: { mimeType: "text/plain", headers: [{ name: "Subject", value: "Big" }], body: { data: Buffer.from("x".repeat(40_000)).toString("base64url") } },
        },
      ],
    });
    const o = output(await call("mail.get_message", { id: m.id }, f));
    expect(o.truncated).toBe(true);
    expect(Buffer.byteLength(o.body as string)).toBeLessThanOrEqual(16_384);
  });
});

describe("content floor (D-19, D-29)", () => {
  const seen = (tool: string) =>
    h().insert(toolCalls).values({ runId, toolUseId: `c_${Math.random()}`, kind: "tool", tool, tier: "READ", status: "done", seq: 1 });
  it.each(["outreach.list_events", "outreach.get_event", "mail.list", "mail.get_message"])("after %s, a side-effect tool needs approval", async (tool) => {
    await h().insert(permissions).values({ agentId: "outreach", tool: "test.exec", tier: "EXECUTE" });
    expect((await call("test.exec", { text: "go" })).status).toBe("ok");
    await seen(tool);
    expect((await call("test.exec", { text: "go" })).status).toBe("waiting_approval");
  });
});
