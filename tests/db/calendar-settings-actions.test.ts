import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, calendars, connections } from "@/server/db/schema";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
vi.mock("@/server/db/client", async (orig) => ({ ...(await orig<object>()), db: () => t.handle() }));
let denied = false;
vi.mock("@/server/session", () => ({
  requireOwner: async () => {
    if (denied) throw new Error("redirect");
  },
}));
const enqueue = vi.fn<(...a: unknown[]) => Promise<void>>(async () => undefined);
vi.mock("@/server/queue", () => ({ enqueue: (...a: unknown[]) => enqueue(...a), QUEUES: { calendarSync: "calendar.sync" } }));
const connectIcloud = vi.fn();
vi.mock("@/server/calendar/caldav/provider", () => ({ connectIcloud: (...a: unknown[]) => connectIcloud(...a) }));

import {
  connectIcloudAction,
  disconnectCalendarAction,
  setCalendarCategoryAction,
  setCalendarSyncAction,
  setDefaultCalendarAction,
} from "@/server/calendar-settings-actions";

async function seed(access: string) {
  await t.handle().insert(connections).values({ id: "icloud_calendar", ciphertext: "x", last4: "", login: "a@b.co", status: "connected", repos: [] });
  const [c] = await t
    .handle()
    .insert(calendars)
    .values({ connectionId: "icloud_calendar", remoteId: "r1", name: "Home", access, kind: "owned", account: "a@b.co", enabled: true, category: "personal", isDefault: false })
    .returning();
  return c!.id;
}

beforeEach(async () => {
  denied = false;
  enqueue.mockClear();
  connectIcloud.mockReset();
  await t.handle().delete(connections);
});

describe("calendar settings actions", () => {
  it("reject without owner", async () => {
    denied = true;
    const rej = (p: Promise<unknown>) => p.then(() => "ok", (e: Error) => e.message);
    expect(await rej(connectIcloudAction("a@b.co", "pw"))).toBe("redirect");
    expect(await rej(disconnectCalendarAction("icloud_calendar"))).toBe("redirect");
    expect(await rej(setCalendarSyncAction("x", true))).toBe("redirect");
    expect(await rej(setCalendarCategoryAction("x", "work"))).toBe("redirect");
    expect(await rej(setDefaultCalendarAction("x"))).toBe("redirect");
    expect(connectIcloud).not.toHaveBeenCalled();
  });

  it("connectIcloud maps results and enqueues on success", async () => {
    connectIcloud.mockResolvedValueOnce({ ok: false, error: "rejected" });
    expect(await connectIcloudAction("a@b.co", "pw")).toEqual({ ok: false, error: "rejected" });
    expect(enqueue).not.toHaveBeenCalled();
    connectIcloud.mockResolvedValueOnce({ ok: true, calendars: 2 });
    expect(await connectIcloudAction("a@b.co", "pw")).toEqual({ ok: true, calendars: 2 });
    expect(enqueue).toHaveBeenCalledTimes(1);
    connectIcloud.mockRejectedValueOnce(new Error("boom"));
    expect(await connectIcloudAction("a@b.co", "pw")).toEqual({ ok: false, error: "failed" });
  });

  it("disconnect removes cascade; invalid id rejected", async () => {
    const id = await seed("owner");
    expect(await disconnectCalendarAction("github_read")).toEqual({ ok: false, error: "invalid" });
    expect(await disconnectCalendarAction("icloud_calendar")).toEqual({ ok: true });
    expect(await t.handle().select().from(calendars).where(eq(calendars.id, id))).toHaveLength(0);
  });

  it("sync, category and default", async () => {
    const id = await seed("owner");
    expect(await setCalendarSyncAction(id, false)).toEqual({ ok: true });
    expect(await setCalendarSyncAction(id, true)).toEqual({ ok: true });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(await setCalendarCategoryAction(id, "work")).toEqual({ ok: true });
    expect(await setCalendarCategoryAction(id, "nope")).toEqual({ ok: false, error: "category" });
    expect(await setCalendarCategoryAction("not-a-uuid", "work")).toEqual({ ok: false, error: "invalid" });
    expect(await setDefaultCalendarAction(id)).toEqual({ ok: true });
    // every settings write is audited with ids/enums only (WR-A07)
    const a = await t.handle().select().from(auditLog).where(eq(auditLog.action, "calendar.settings"));
    expect(a.filter((x) => x.target === id).map((x) => (x.metadata as { field: string; value: unknown }))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "enabled", value: false }),
        expect.objectContaining({ field: "enabled", value: true }),
        expect.objectContaining({ field: "category", value: "work" }),
        expect.objectContaining({ field: "isDefault", value: true }),
      ]),
    );
  });

  it("default on a read-only calendar is refused", async () => {
    const id = await seed("reader");
    expect(await setDefaultCalendarAction(id)).toEqual({ ok: false, error: "not_writable" });
  });
});
