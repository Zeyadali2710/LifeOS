// DB injection: "@/server/db/client" is mocked so db() returns the throwaway handle from setupTestDb().
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifications } from "@/server/db/schema";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
vi.mock("@/server/db/client", async (orig) => ({ ...(await orig<object>()), db: () => t.handle() }));
let denied = false;
vi.mock("@/server/session", () => ({
  requireOwner: async () => {
    if (denied) throw new Error("redirect");
  },
}));

import { dismiss, markAllRead, markRead, snooze } from "@/server/notification-actions";

const row = async (id: string) => (await t.handle().select().from(notifications).where(eq(notifications.id, id)))[0]!;
const mk = async () =>
  (await t.handle().insert(notifications).values({ category: "FYI", title: "x", source: "t" }).returning({ id: notifications.id }))[0]!.id;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const H = 3_600_000;

beforeEach(() => {
  denied = false;
});

describe("notification actions", () => {
  it("reject without owner and leave row unchanged", async () => {
    denied = true;
    const id = await mk();
    expect(await markRead(id, true).then(() => "ok", (e: Error) => e.message)).toBe("redirect");
    expect(await markAllRead().then(() => "ok", (e: Error) => e.message)).toBe("redirect");
    expect(await snooze(id, iso(H)).then(() => "ok", (e: Error) => e.message)).toBe("redirect");
    expect(await dismiss(id).then(() => "ok", (e: Error) => e.message)).toBe("redirect");
    const r = await row(id);
    expect([r.readAt, r.snoozedUntil, r.dismissedAt]).toEqual([null, null, null]);
  });

  it("validates input and applies changes", async () => {
    const id = await mk();
    expect(await markRead("not-a-uuid", true)).toEqual({ ok: false });
    expect(await markRead(id, true)).toEqual({ ok: true });
    expect((await row(id)).readAt).not.toBeNull();
    expect(await snooze(id, iso(-H))).toEqual({ ok: false });
    expect(await snooze(id, iso(31 * 24 * H))).toEqual({ ok: false });
    expect(await snooze(id, "garbage")).toEqual({ ok: false });
    expect(await snooze(id, iso(H))).toEqual({ ok: true });
    expect((await row(id)).snoozedUntil).not.toBeNull();
    expect(await markAllRead()).toEqual({ ok: true });
    expect(await dismiss(id)).toEqual({ ok: true });
    expect((await row(id)).dismissedAt).not.toBeNull();
    expect(await dismiss("00000000-0000-4000-8000-000000000000")).toEqual({ ok: false });
  });
});
