import { describe, expect, it } from "vitest";
import { emitAuthEvent } from "@/server/auth-events";
import { activityEvents, notifications } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const acts = (type: string) => t.handle().select().from(activityEvents).where(eq(activityEvents.type, type));

describe("emitAuthEvent", () => {
  it("sign_in and sign_out emit activity only", async () => {
    await emitAuthEvent("sign_in", t.handle());
    await emitAuthEvent("sign_out", t.handle());
    expect((await acts("auth.sign_in"))[0]).toMatchObject({ title: "Signed in", source: "auth" });
    expect((await acts("auth.sign_out"))[0]?.title).toBe("Signed out");
    expect(await t.handle().select().from(notifications)).toHaveLength(0);
  });

  it("failed sign-in throttles notification, re-notifies after dismissal, leaks nothing", async () => {
    const now = new Date();
    await emitAuthEvent("sign_in_failed", t.handle(), now);
    await emitAuthEvent("sign_in_failed", t.handle(), now);
    expect(await acts("auth.sign_in_failed")).toHaveLength(2);
    const ns = await t.handle().select().from(notifications);
    expect(ns).toHaveLength(1);
    expect(ns[0]).toMatchObject({ category: "URGENT", title: "Failed sign-in attempt" });
    expect(ns[0]?.body).toMatch(/^Someone entered the wrong credentials at \d\d:\d\d\. If it wasn't you, change your password\.$/);

    await t.handle().update(notifications).set({ dismissedAt: new Date() });
    await emitAuthEvent("sign_in_failed", t.handle(), now);
    expect(await t.handle().select().from(notifications)).toHaveLength(2);

    const text = JSON.stringify([await t.handle().select().from(activityEvents), await t.handle().select().from(notifications)]);
    expect(text).not.toMatch(/@|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
  });
});
