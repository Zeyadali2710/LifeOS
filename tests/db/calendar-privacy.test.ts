import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { advance, createRun } from "@/server/agents/loop";
import { freeModel, resetFreeCooldown } from "@/server/agents/routing";
import { getAgent } from "@/server/agents/registry";
import { agents, agentRuns, activityEvents, calendarEvents, calendars, connections, settings, toolCalls } from "@/server/db/schema";
import { saveCalendarSecret } from "@/server/calendar/connections";
import { scriptedLlm } from "../helpers/fake-llm";
import { setupTestDb } from "./helpers";

const key = vi.hoisted(() => Buffer.alloc(32, 7).toString("base64"));
vi.mock("@/server/env", () => ({ env: () => ({ LIFEOS_MASTER_KEY: key }) }));
vi.mock("@/server/calendar/providers", () => ({ providerFor: async () => ({}) }));

const t = setupTestDb();
const h = () => t.handle();
const SONNET = "claude-sonnet-5-5";
const NOW = new Date("2026-10-08T08:44:00Z"); // Thu 19:44 AEDT
const TITLE = "Confidential oncology appointment";
const ICLOUD_PW = "icloud-app-password-SECRET";
const GOOGLE_RT = "google-refresh-token-SECRET";
const run = async (id: string) => (await h().select().from(agentRuns).where(eq(agentRuns.id, id)))[0]!;
const mk = async (agentId: string, prompt: string, extra = {}) => {
  const r = await createRun(h(), { agentId, prompt, ...extra });
  if (!r.ok) throw new Error(r.code);
  return r.runId;
};
/** Free (tier simple) organization child under an orchestrator parent. */
const freeChild = async () => mk("organization", "what is on today?", { parentRunId: await mk("orchestrator", "hi"), tier: "simple" });
const list = { name: "calendar.list_events", input: { from: "2026-10-08" } };

beforeEach(async () => {
  resetFreeCooldown();
  for (const tbl of [agentRuns, settings, activityEvents, connections, agents]) await h().delete(tbl);
  await h().insert(connections).values({ id: "openrouter", ciphertext: "x", last4: "abcd" } as never);
  await saveCalendarSecret(h(), "icloud_calendar", { password: ICLOUD_PW }, { account: "me@icloud.com" }, { key: Buffer.from(key, "base64") });
  await saveCalendarSecret(h(), "google_calendar", { refreshToken: GOOGLE_RT }, { account: "me@gmail.com" }, { key: Buffer.from(key, "base64") });
  const [cal] = await h().insert(calendars).values({ connectionId: "google_calendar", remoteId: "main", name: "main", enabled: true, category: "personal", access: "owner" }).returning();
  await h()
    .insert(calendarEvents)
    .values({ calendarId: cal!.id, remoteId: "e", title: TITLE, startAt: new Date("2026-10-08T03:00:00Z"), endAt: new Date("2026-10-08T04:00:00Z"), tz: "Australia/Sydney", raw: {} });
});

describe("organization agent privacy and clock", () => {
  it("is live and every request carries the Sydney clock line", async () => {
    expect(getAgent("organization")?.live).toBe(true);
    const id = await mk("organization", "hi");
    const llm = scriptedLlm([{ toolUses: [list] }, { text: "ok" }]);
    expect(await advance(id, { handle: h(), llm, now: () => NOW })).toBe("completed");
    for (const c of llm.calls) expect(c.system.endsWith("Current time: Thu 8 Oct 2026 19:44 AEDT (Australia/Sydney).")).toBe(true);
  });

  it("a free run that reads the calendar moves to Sonnet before the next turn; the free model never sees the title", async () => {
    const id = await freeChild();
    const llm = scriptedLlm([{ toolUses: [list] }, { text: "You have an appointment." }]);
    expect(await advance(id, { handle: h(), llm, now: () => NOW })).toBe("completed");
    expect(llm.calls.map((c) => c.model)).toEqual([freeModel(), SONNET]);
    for (const c of llm.calls.filter((x) => x.model === freeModel())) expect(JSON.stringify(c)).not.toContain(TITLE);
    const r = await run(id);
    expect(r.sawPrivate).toBe(true);
    expect(r.routeEvents.at(-1)).toMatchObject({ kind: "private", to: SONNET });
  });

  it("with free_private_ok the same run stays on the free model", async () => {
    await h().insert(settings).values({ key: "ai.free_private_ok", value: true });
    const id = await freeChild();
    const llm = scriptedLlm([{ toolUses: [list] }, { text: "You have an appointment." }]);
    expect(await advance(id, { handle: h(), llm, now: () => NOW })).toBe("completed");
    expect(new Set(llm.calls.map((c) => c.model))).toEqual(new Set([freeModel()]));
    expect((await run(id)).sawPrivate).toBe(true);
  });

  it("tool call outputs never contain connection secrets", async () => {
    const id = await mk("organization", "hi");
    const llm = scriptedLlm([{ toolUses: [list, { name: "calendar.detect_conflicts", input: { from: "2026-10-08" } }, { name: "tasks.list", input: {} }] }, { text: "ok" }]);
    expect(await advance(id, { handle: h(), llm, now: () => NOW })).toBe("completed");
    const rows = await h().select().from(toolCalls).where(eq(toolCalls.runId, id));
    expect(rows.length).toBe(3);
    const blob = JSON.stringify(rows);
    expect(blob).toContain(TITLE);
    expect(blob).not.toContain(ICLOUD_PW);
    expect(blob).not.toContain(GOOGLE_RT);
  });
});
