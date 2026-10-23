import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, calendars, connections, settings } from "@/server/db/schema";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
vi.mock("@/server/db/client", async (orig) => ({ ...(await orig<object>()), db: () => t.handle() }));
let denied = false;
vi.mock("@/server/session", () => ({
  requireOwner: async () => {
    if (denied) throw new Error("redirect");
  },
}));

import { rosterConfig } from "@/server/roster/apply";
import { saveRosterConfigAction } from "@/server/roster-actions";

let rw = "";
let ro = "";
beforeEach(async () => {
  const h = t.handle();
  denied = false;
  for (const tb of [settings, auditLog, connections]) await h.delete(tb);
  await h.insert(connections).values({ id: "google_calendar", ciphertext: "x", last4: "", login: "g@example.com" });
  const [a, b] = await h.insert(calendars).values([
    { connectionId: "google_calendar", remoteId: "w", name: "Work", access: "owner", enabled: true, category: "work" },
    { connectionId: "google_calendar", remoteId: "h", name: "Holidays", access: "reader", enabled: true, category: "events" },
  ]).returning();
  rw = a!.id;
  ro = b!.id;
});

describe("saveRosterConfigAction", () => {
  const base = { enabled: true, sender: "Rosters@Burps.com.au", branches: { "TG Warring": "TG Warringah" } };

  it("saves a valid config (sender lower-cased) and audits it", async () => {
    expect(await saveRosterConfigAction({ ...base, calendarId: rw })).toEqual({ ok: true });
    expect(await rosterConfig(t.handle())).toEqual({ ...base, sender: "rosters@burps.com.au", calendarId: rw });
    expect((await t.handle().select().from(auditLog)).map((a) => a.action)).toEqual(["roster.config"]);
  });

  it("defaults to off with the known sender", async () => {
    expect(await rosterConfig(t.handle())).toEqual({ enabled: false, calendarId: null, sender: "rosters@burps.com.au", branches: {} });
  });

  it("refuses to turn on without a writable calendar, or with a bad sender", async () => {
    expect(await saveRosterConfigAction({ ...base, calendarId: null })).toEqual({ ok: false, error: "Choose a calendar LifeOS can write to." });
    expect(await saveRosterConfigAction({ ...base, calendarId: ro })).toEqual({ ok: false, error: "Choose a calendar LifeOS can write to." });
    expect(await saveRosterConfigAction({ ...base, calendarId: rw, sender: "nope" })).toEqual({ ok: false, error: "Enter the sender's email address." });
    expect(await saveRosterConfigAction({ ...base, enabled: false, calendarId: null })).toEqual({ ok: true });
  });

  it("is owner-only", async () => {
    denied = true;
    await expect(saveRosterConfigAction({ ...base, calendarId: rw })).rejects.toThrow("redirect");
  });
});
