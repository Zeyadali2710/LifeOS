import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { activityEvents, briefings, financeBudgets, financeCategories, financeImports, financeTransactions, mailMessages, notifications, settings, tasks } from "@/server/db/schema";
import { generateBriefing, runBriefings } from "@/server/briefings";
import { loadDigest } from "@/server/digest";
import { emitActivity } from "@/server/events";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const allowed = vi.hoisted(() => ({ owner: true }));
vi.mock("@/server/session", () => ({ requireOwner: async () => { if (!allowed.owner) throw new Error("Not owner"); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/db/client", async (orig) => ({ ...(await orig<object>()), db: () => t.handle() }));
import { briefingNowAction, markBriefingReadAction, saveBriefingScheduleAction } from "@/server/briefing-actions";

const h = () => t.handle();
const NOW = new Date("2026-10-15T01:00:00Z"); // Thu 12:00 Sydney (AEDT)
const at = (hh: number) => new Date(Date.UTC(2026, 9, 14, 13 + hh)); // Sydney 15 Oct hh:00

beforeEach(async () => {
  allowed.owner = true;
  for (const table of [briefings, notifications, activityEvents, tasks, mailMessages, financeImports, financeBudgets, financeCategories]) await h().delete(table);
  await h().delete(settings).where(eq(settings.key, "briefings.schedule"));
});

describe("digest + briefings", () => {
  it("builds the digest from local data, with overdue tasks, done today, important mail, CI failures and budgets", async () => {
    await h().insert(tasks).values([
      { title: "Overdue report", dueDate: "2026-10-14", dueAt: new Date("2026-10-14T12:59:00Z"), priority: 1 },
      { title: "Done this morning", completedAt: at(9) },
      { title: "Done yesterday", completedAt: new Date("2026-10-13T23:00:00Z") },
    ]);
    await h().insert(mailMessages).values({ gmailId: "g1", threadId: "t1", subject: "Offer letter", fromName: "Recruiter", receivedAt: at(8), importance: "HIGH" });
    await emitActivity({ type: "github.ci.failed", source: "github", title: "CI failed on main" }, undefined, h());
    await h().insert(financeCategories).values({ name: "Delivery", group: "Food", kind: "expense" });
    const [imp] = await h().insert(financeImports).values({ account: "main", fileName: "x.csv", fileHash: "h", imported: 1, skipped: 0 }).returning();
    await h().insert(financeTransactions).values({ importId: imp!.id, account: "main", date: "2026-10-03", precision: "day", amount: -6000, description: "Uber eats", fingerprint: "f", category: "Delivery", categorySource: "manual" });
    await h().insert(financeBudgets).values({ category: "Delivery", month: "2026-09", cents: 5000 }); // carried into October

    const d = await loadDigest(h(), NOW);
    expect(d.today).toBe("2026-10-15");
    expect(d.tasks).toMatchObject([{ title: "Overdue report", overdue: true, priority: 1 }]);
    expect(d.doneToday).toEqual([{ title: "Done this morning" }]);
    expect(d.importantMail).toMatchObject([{ subject: "Offer letter", from: "Recruiter" }]);
    expect(d.ciFailures).toMatchObject([{ title: "CI failed on main" }]);
    expect(d.overBudget).toEqual([{ category: "Delivery", over: 1000 }]);
    expect(d.calendarConnected).toBe(false);
    expect(d.upcoming).toHaveLength(6);
  });

  it("generates each kind once per period, with a counts-only notification in the same transaction", async () => {
    await h().insert(mailMessages).values({ gmailId: "g2", threadId: "t2", subject: "Secret subject", fromName: "X", receivedAt: at(8), importance: "HIGH" });
    const id = await generateBriefing(h(), "morning", NOW);
    expect(id).toBeTruthy();
    expect(await generateBriefing(h(), "morning", NOW)).toBeNull();
    const [n] = await h().select().from(notifications);
    expect(n).toMatchObject({ category: "FYI", title: "Morning briefing", actionUrl: `/briefings/${id}` });
    expect(`${n!.title} ${n!.body}`).not.toContain("Secret subject");
    const [b] = await h().select().from(briefings).where(eq(briefings.id, id!));
    expect(JSON.stringify(b!.body)).toContain("Secret subject"); // stays on the owner-only page

    const failingEmit = (async () => null) as typeof emitActivity;
    await expect(generateBriefing(h(), "evening", NOW, failingEmit)).rejects.toThrow(/notification/);
    expect(await h().select().from(briefings).where(eq(briefings.kind, "evening"))).toHaveLength(0); // rolled back, retried next tick
  });

  it("runs only due, enabled briefings in Sydney time and respects the saved schedule", async () => {
    expect(await runBriefings(h(), new Date("2026-10-14T19:59:00Z"))).toBe(0); // 06:59 Sydney
    expect(await runBriefings(h(), new Date("2026-10-14T20:00:00Z"))).toBe(1); // 07:00 morning
    expect(await runBriefings(h(), new Date("2026-10-14T21:00:00Z"))).toBe(0); // already made
    expect(await saveBriefingScheduleAction({ morning: { on: true, time: "07:00" }, midday: { on: true, time: "12:00" }, evening: { on: false, time: "18:00" }, weekly: { on: true, time: "18:00" } })).toEqual({ ok: true });
    expect(await saveBriefingScheduleAction({ morning: { on: true, time: "7am" } })).toMatchObject({ ok: false });
    expect(await runBriefings(h(), NOW)).toBe(1); // midday at 12:00
    expect(await runBriefings(h(), new Date("2026-10-15T08:00:00Z"))).toBe(0); // 19:00, evening off, not Sunday
    expect(await runBriefings(h(), new Date("2026-10-18T08:00:00Z"))).toBe(3); // Sunday 19:00: morning, midday, weekly (new day)
    expect((await h().select().from(briefings).where(eq(briefings.kind, "weekly")))[0]?.period).toBe("2026-10-18");
  });

  it("builds now on demand, reuses the period's briefing, marks read and checks the owner", async () => {
    const a = await briefingNowAction("evening");
    const b = await briefingNowAction("evening");
    expect(a.ok && b.ok && a.id === b.id).toBe(true);
    expect(await briefingNowAction("nope")).toMatchObject({ ok: false });
    await markBriefingReadAction((a as { id: string }).id);
    expect((await h().select().from(briefings))[0]?.readAt).not.toBeNull();
    allowed.owner = false;
    for (const call of [() => briefingNowAction("morning"), () => saveBriefingScheduleAction({}), () => markBriefingReadAction("x")]) await expect(call()).rejects.toThrow("Not owner");
  });
});
