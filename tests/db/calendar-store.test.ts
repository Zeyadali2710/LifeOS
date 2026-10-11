import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { calendarById, refreshCalendarList, setCalendarCategory, setCalendarEnabled, setDefaultCalendar, setLastUsedCalendar } from "@/server/calendar/calendars";
import {
  getCalendarConnections,
  markCalendarError,
  readCalendarSecret,
  recordCalendarSync,
  removeCalendarConnection,
  saveCalendarSecret,
} from "@/server/calendar/connections";
import type { RemoteCalendar } from "@/server/calendar/types";
import { decrypt } from "@/server/crypto";
import { auditLog, calendarEvents, calendars, connections, settings } from "@/server/db/schema";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const key = randomBytes(32);
const PW = "abcd-efgh-SECRETPW";
const primary: RemoteCalendar = { remoteId: "p", name: "Me", access: "owner", kind: "primary" };
const holiday: RemoteCalendar = { remoteId: "h", name: "Holidays", access: "reader", kind: "holiday" };
const subscribed: RemoteCalendar = { remoteId: "s", name: "Sub", access: "reader", kind: "subscribed" };

describe("calendar connections", () => {
  it("encrypts, never leaks, audits ids only", async () => {
    const h = t.handle();
    await saveCalendarSecret(h, "icloud_calendar", { appleId: "me@x", password: PW }, { account: "me@x" }, { key });
    const [row] = await h.select().from(connections).where(eq(connections.id, "icloud_calendar"));
    expect(row!.ciphertext).not.toContain(PW);
    expect(JSON.parse(decrypt(row!.ciphertext, key))).toEqual({ appleId: "me@x", password: PW });
    expect(row!.last4).toBe("");
    const dto = await getCalendarConnections(h, { googleConfigured: false });
    expect(dto.map((c) => [c.id, c.status, c.configured])).toEqual([["google_calendar", "none", false], ["icloud_calendar", "connected", true]]);
    expect(dto[1]!.account).toBe("me@x");
    const s = JSON.stringify(dto);
    expect(s).not.toContain(PW);
    expect(s).not.toContain(row!.ciphertext);
    const [a] = await h.select().from(auditLog).where(eq(auditLog.action, "connection.save"));
    expect(a!.metadata).toEqual({ id: "icloud_calendar", account: "me@x" });
  });

  it("rotation overwrites the stored secret", async () => {
    const h = t.handle();
    await saveCalendarSecret(h, "google_calendar", { refreshToken: "OLD-REFRESH" }, { account: "g@x" }, { key });
    await markCalendarError(h, "google_calendar", "Access was rejected.");
    let dto = (await getCalendarConnections(h, { googleConfigured: true }))[0]!;
    expect(dto).toMatchObject({ status: "error", lastSyncError: null });
    await saveCalendarSecret(h, "google_calendar", { refreshToken: "NEW-REFRESH" }, { account: "g@x" }, { key });
    const rows = await h.select().from(connections).where(eq(connections.id, "google_calendar"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lastError).toBeNull();
    expect(rows[0]!.status).toBe("connected");
    expect(rows[0]!.ciphertext).not.toContain("OLD-REFRESH");
    expect(decrypt(rows[0]!.ciphertext, key)).not.toContain("OLD-REFRESH");
    expect(await readCalendarSecret(h, "google_calendar", key)).toEqual({ refreshToken: "NEW-REFRESH" });
    dto = (await getCalendarConnections(h, { googleConfigured: true }))[0]!;
    expect(dto.status).toBe("connected");
  });

  it("records sync and removes with cascade", async () => {
    const h = t.handle();
    const at = new Date("2026-01-01T00:00:00Z");
    await recordCalendarSync(h, "google_calendar", { at, error: null });
    expect((await getCalendarConnections(h, { googleConfigured: true }))[0]!.lastSyncAt).toBe(at.toISOString());
    await refreshCalendarList(h, "google_calendar", [primary], "g@x");
    await removeCalendarConnection(h, "google_calendar");
    expect(await h.select().from(connections).where(eq(connections.id, "google_calendar"))).toHaveLength(0);
    expect((await h.select().from(calendars)).filter((c) => c.connectionId === "google_calendar")).toHaveLength(0);
    expect(await h.select().from(auditLog).where(eq(auditLog.action, "connection.remove"))).toHaveLength(1);
  });
});

describe("calendar list store", () => {
  it("defaults, refresh keeps choices, enable/category/default/last-used", async () => {
    const h = t.handle();
    await saveCalendarSecret(h, "google_calendar", { refreshToken: "r" }, { account: "me@x" }, { key });
    await refreshCalendarList(h, "google_calendar", [primary, holiday, subscribed], "me@x");
    let rows = (await h.select().from(calendars).where(eq(calendars.connectionId, "google_calendar"))).sort((a, b) => a.remoteId.localeCompare(b.remoteId));
    expect(rows.map((r) => [r.remoteId, r.enabled, r.category, r.isDefault])).toEqual([
      ["h", false, null, false],
      ["p", true, "personal", true],
      ["s", false, null, false],
    ]);
    const p = rows.find((r) => r.remoteId === "p")!;
    const s = rows.find((r) => r.remoteId === "s")!;

    expect(await setCalendarCategory(h, p.id, "work")).toEqual({ ok: true });
    expect(await setCalendarCategory(h, p.id, "bogus")).toEqual({ ok: false, error: "category" });

    await refreshCalendarList(h, "google_calendar", [primary, subscribed], "me@x");
    rows = await h.select().from(calendars).where(eq(calendars.connectionId, "google_calendar"));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.remoteId === "p")).toMatchObject({ enabled: true, category: "work" });

    // an empty list from the provider never wipes calendars or their settings (WR-A03)
    await refreshCalendarList(h, "google_calendar", [], "me@x");
    rows = await h.select().from(calendars).where(eq(calendars.connectionId, "google_calendar"));
    expect(rows.find((r) => r.remoteId === "p")).toMatchObject({ enabled: true, category: "work" });
    expect(rows).toHaveLength(2);

    // read-only / disabled cannot be default
    expect(await setDefaultCalendar(h, s.id)).toEqual({ ok: false, error: "not_writable" });
    await setCalendarEnabled(h, s.id, true);
    expect((await calendarById(h, s.id))!.category).toBeNull();
    expect(await setDefaultCalendar(h, s.id)).toEqual({ ok: false, error: "not_writable" }); // still reader

    // untick clears events and cursor
    await h.update(calendars).set({ syncCursor: "c", ctag: "t" }).where(eq(calendars.id, p.id));
    await h.insert(calendarEvents).values({ calendarId: p.id, remoteId: "e1", raw: {} });
    await setCalendarEnabled(h, p.id, false);
    expect(await h.select().from(calendarEvents)).toHaveLength(0);
    expect(await calendarById(h, p.id)).toMatchObject({ enabled: false, syncCursor: null, ctag: null, category: "work" });

    await setCalendarEnabled(h, p.id, true);
    expect(await setDefaultCalendar(h, p.id)).toEqual({ ok: true });
    expect((await h.select().from(calendars)).filter((c) => c.isDefault)).toHaveLength(1);

    await setLastUsedCalendar(h, p.id);
    await setLastUsedCalendar(h, s.id);
    const [st] = await h.select().from(settings).where(eq(settings.key, "calendar.last_used"));
    expect(st!.value).toBe(s.id);
  });
});
