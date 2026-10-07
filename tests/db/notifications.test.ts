import { describe, expect, it } from "vitest";
import { activityEvents, notifications } from "@/server/db/schema";
import {
  dismissOne, inbox, nextWake, readAll, setRead, snapshot, snoozeUntil, unreadCount, unreadImportantCount,
} from "@/server/notifications";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const mk = async (category: "URGENT" | "FYI" | "IMPORTANT", title: string) => {
  const [r] = await t.handle().insert(notifications).values({ category, title, source: "test" }).returning({ id: notifications.id });
  return r!.id;
};
const H = 3_600_000;

describe("notifications", () => {
  it("inbox/unread/important/snooze/dismiss/wake semantics", async () => {
    const h = t.handle();
    const now = new Date();
    const a = await mk("URGENT", "a");
    const b = await mk("FYI", "b");
    const c = await mk("IMPORTANT", "c");
    expect((await inbox(h, now)).length).toBe(3);
    expect(await unreadCount(h, now)).toBe(3);
    expect(await unreadImportantCount(h, now)).toBe(2);

    expect(await setRead(h, a, true, now)).toBe(true);
    expect(await unreadImportantCount(h, now)).toBe(1);
    expect(await setRead(h, a, false, now)).toBe(true);
    expect(await setRead(h, "00000000-0000-4000-8000-000000000000", true)).toBe(false);

    const until = new Date(now.getTime() + H);
    await snoozeUntil(h, b, until);
    expect((await inbox(h, now)).map((i) => i.id)).not.toContain(b);
    expect(await nextWake(h, now)).toBe(until.toISOString());
    const later = new Date(now.getTime() + 2 * H);
    expect((await inbox(h, later)).map((i) => i.id)).toContain(b);
    expect(await nextWake(h, later)).toBeNull();

    expect(await dismissOne(h, c, now)).toBe(true);
    const snap = await snapshot(h, now);
    expect(snap.items.map((i) => i.id)).toEqual([a]);
    expect(snap.unread).toBe(1);
    expect(snap.nextWake).toBe(until.toISOString());

    await readAll(h, now);
    expect(await unreadCount(h, now)).toBe(0);
    const ev = await h.select().from(activityEvents);
    expect(ev.length).toBe(0);
  });
});
