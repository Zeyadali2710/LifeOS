import { count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { calendarEvents, calendars, connections, tasks } from "@/server/db/schema";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const h = () => t.handle();

async function seedCalendar(remoteId = "primary") {
  await h().insert(connections).values({ id: "google_calendar", ciphertext: "x", last4: "abcd" }).onConflictDoNothing();
  const [cal] = await h().insert(calendars).values({ connectionId: "google_calendar", remoteId, name: "Main" }).returning();
  return cal!;
}

describe("phase 4 schema", () => {
  it("allows only one default calendar across all connections", async () => {
    const a = await seedCalendar("d1");
    const b = await seedCalendar("d2");
    await h().update(calendars).set({ isDefault: true }).where(eq(calendars.id, a.id));
    await expect(h().update(calendars).set({ isDefault: true }).where(eq(calendars.id, b.id))).rejects.toThrow();
    await h().update(calendars).set({ isDefault: false }).where(eq(calendars.id, a.id));
  });

  it("upserts events idempotently on (calendarId, remoteId)", async () => {
    const cal = await seedCalendar("c1");
    const row = { calendarId: cal.id, remoteId: "e1", raw: {} };
    await h().insert(calendarEvents).values({ ...row, title: "a" });
    await h()
      .insert(calendarEvents)
      .values({ ...row, title: "b" })
      .onConflictDoUpdate({ target: [calendarEvents.calendarId, calendarEvents.remoteId], set: { title: "b" } });
    const rows = await h().select().from(calendarEvents).where(eq(calendarEvents.calendarId, cal.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("b");
  });

  it("cascades connection delete to calendars and events", async () => {
    const cal = await seedCalendar("c2");
    await h().insert(calendarEvents).values({ calendarId: cal.id, remoteId: "e2", raw: {} });
    await h().delete(connections).where(eq(connections.id, "google_calendar"));
    const [c] = await h().select({ n: count() }).from(calendars).where(eq(calendars.id, cal.id));
    const [e] = await h().select({ n: count() }).from(calendarEvents).where(eq(calendarEvents.calendarId, cal.id));
    expect([c!.n, e!.n]).toEqual([0, 0]);
  });

  it("tasks defaults", async () => {
    const [r] = await h().insert(tasks).values({ title: "x" }).returning();
    expect(r!.notes).toBe("");
    expect([r!.priority, r!.dueAt, r!.completedAt, r!.remindedAt]).toEqual([null, null, null, null]);
  });

  it("rejects duplicate (connectionId, remoteId) calendars", async () => {
    await seedCalendar("c4");
    await expect(
      h().insert(calendars).values({ connectionId: "google_calendar", remoteId: "c4", name: "dup" }),
    ).rejects.toThrow();
  });
});
