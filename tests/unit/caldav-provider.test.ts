import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertIcloudUrl, createCaldavProvider, readOnlyFrom, statusError, transportError } from "@/server/calendar/caldav/provider";
import { ProviderError } from "@/server/calendar/errors";
import type { CalendarRef, EventWrite, StoredEvent } from "@/server/calendar/types";
import { CAL, fakeDav } from "../helpers/fake-dav";

const fx = (n: string) => readFileSync(`tests/fixtures/calendar/${n}.ics`, "utf8");
const URL1 = `${CAL}rec1.ics`;
const cal = (o: Partial<CalendarRef> = {}): CalendarRef => ({ id: "c", connectionId: "icloud_calendar", remoteId: CAL, access: "owner", syncCursor: null, ctag: null, ...o });
const win = { from: new Date("2026-09-01"), to: new Date("2027-01-01") };
const input: EventWrite = {
  title: "Renamed", start: "2026-10-22T00:00:00.000Z", end: "2026-10-22T01:00:00.000Z", allDay: false, timeZone: "Australia/Sydney",
  location: "", description: "", showAs: "busy", repeat: "keep", marker: null,
};

async function seeded() {
  const f = fakeDav({ objects: { [URL1]: fx("icloud-recurring") } });
  const p = createCaldavProvider({ dav: f.dav });
  const r = await p.sync(cal(), win);
  return { f, p, ev: { ...r.upserts[0]!, id: "e", calendarId: "c" } as StoredEvent, r };
}

describe("caldav provider", () => {
  it("lists only VEVENT calendars", async () => {
    const f = fakeDav({
      calendars: [
        { url: CAL, name: "Home", components: ["VEVENT"], ctag: "1", readOnly: false },
        { url: `${CAL}r/`, name: "Todo", components: ["VTODO"], ctag: "1", readOnly: false },
        { url: `${CAL}ro/`, name: "Shared", components: ["VEVENT"], ctag: "1", readOnly: true },
        { url: `${CAL}u/`, name: "Unknown", components: [], ctag: "1", readOnly: false },
      ],
    });
    const l = await createCaldavProvider({ dav: f.dav }).listCalendars();
    expect(l.map((c) => [c.name, c.access])).toEqual([["Home", "owner"], ["Shared", "reader"], ["Unknown", "owner"]]);
  });

  it("short-circuits on equal ctag, resets on change", async () => {
    const { f, r } = await seeded();
    expect(r.reset).toBe(true);
    expect(r.ctag).toBe("c1");
    expect(r.upserts[0]).toMatchObject({ remoteId: "rec1@icloud", title: "Standup", transparency: "opaque" });
    expect(r.upserts[0]!.recurrence?.[0]).toMatch(/^RRULE:FREQ=WEEKLY/);
    f.calls.length = 0;
    expect(r.cursor).toBe("2026-09-01");
    const again = await createCaldavProvider({ dav: f.dav }).sync(cal({ ctag: "c1", syncCursor: r.cursor }), win);
    expect(again).toMatchObject({ reset: false, upserts: [] });
    expect(f.calls).not.toContain("objects");
    // a new window day forces a full fetch even with the same ctag (WR-A08)
    const next = { from: new Date("2026-09-02"), to: new Date("2027-01-02") };
    const later = await createCaldavProvider({ dav: f.dav }).sync(cal({ ctag: "c1", syncCursor: r.cursor }), next);
    expect(later).toMatchObject({ reset: true, cursor: "2026-09-02" });
  });

  it("skips oversized and malformed resources", async () => {
    const f = fakeDav({ objects: { [URL1]: fx("icloud-recurring"), [`${CAL}bad.ics`]: "garbage", [`${CAL}big.ics`]: "x".repeat(300 * 1024) } });
    const r = await createCaldavProvider({ dav: f.dav }).sync(cal(), win);
    expect(r.upserts).toHaveLength(1);
    expect(r.keepUrls?.sort()).toEqual([`${CAL}bad.ics`, `${CAL}big.ics`]);
  });

  it("rejects non-icloud and non-https urls", () => {
    expect(() => assertIcloudUrl("http://p1.icloud.com/x")).toThrow(ProviderError);
    expect(() => assertIcloudUrl("https://evil.example.com/x")).toThrow(ProviderError);
    expect(() => assertIcloudUrl("https://p1.icloud.com.evil.com/x")).toThrow(ProviderError);
    expect(assertIcloudUrl("https://p01-caldav.icloud.com/x").hostname).toBe("p01-caldav.icloud.com");
  });

  it("creates, and adopts on 412 with a deterministic uid", async () => {
    const f = fakeDav();
    const p = createCaldavProvider({ dav: f.dav });
    const a = await p.create(cal(), input, { remoteId: "fixed@lifeos" });
    const b = await p.create(cal(), input, { remoteId: "fixed@lifeos" });
    expect(a.upserts[0]!.remoteId).toBe("fixed@lifeos");
    expect(b.upserts[0]!.remoteId).toBe("fixed@lifeos");
    expect(f.store.size).toBe(1);
  });

  it("all-update keeps X- props and VALARM; stale etag conflicts", async () => {
    const { f, p, ev } = await seeded();
    const stale = { ...ev };
    const out = await p.update(cal(), ev, input, "all", null);
    expect(out.upserts[0]!.title).toBe("Renamed");
    const ics = f.store.get(URL1)!.data;
    expect(ics).toContain("X-APPLE-TRAVEL-ADVISORY-BEHAVIOR");
    expect(ics).toContain("BEGIN:VALARM");
    await expect(p.update(cal(), stale, input, "all", null)).rejects.toMatchObject({ kind: "conflict", status: 412 });
  });

  it("following-update splits into a second resource; delete all removes and tolerates 404", async () => {
    const { f, p, ev } = await seeded();
    const out = await p.update(cal(), ev, input, "following", "2026-10-21T22:00:00.000Z");
    expect(out.upserts).toHaveLength(2);
    expect(f.store.size).toBe(2);
    const fresh = out.upserts.find((u) => u.remoteId === ev.remoteId)!;
    const del = await p.remove(cal(), { ...fresh, id: "e", calendarId: "c" }, "all", null);
    expect(del.deletes).toEqual([ev.remoteId]);
    await expect(p.remove(cal(), { ...fresh, id: "e", calendarId: "c" }, "all", null)).resolves.toMatchObject({ deletes: [ev.remoteId] });
  });

  it("following split creates the new series first and removes it again if the master write fails (CR-A02)", async () => {
    const { f, p, ev } = await seeded();
    const stale = { ...ev, etag: '"stale"' };
    await expect(p.update(cal(), stale, { ...input, marker: "appr-1" }, "following", "2026-10-21T22:00:00.000Z")).rejects.toMatchObject({ kind: "conflict" });
    expect(f.calls.filter((c) => c !== "object")).toEqual(["calendars", "objects", "create", "update", "remove"]);
    expect([...f.store.keys()]).toEqual([URL1]);
    const out = await p.update(cal(), ev, { ...input, marker: "appr-1" }, "following", "2026-10-21T22:00:00.000Z");
    expect(out.upserts.map((u) => u.remoteId)).toContain("appr-1-f@lifeos");
  });

  it("403 is a per-resource refusal, never a connection-pausing auth error (CR-A03)", async () => {
    expect(statusError(401).kind).toBe("auth");
    expect(statusError(403).kind).toBe("client");
    expect(transportError(new Error("403 Forbidden")).kind).toBe("client");
    expect(transportError(new Error("401 Unauthorized")).kind).toBe("auth");
    const { f, p, ev } = await seeded();
    f.dav.update = async () => 403;
    await expect(p.update(cal(), ev, input, "all", null)).rejects.toMatchObject({ kind: "client", status: 403 });
  });

  it("detects read-only calendars from DAV:current-user-privilege-set (CR-A03)", () => {
    expect(readOnlyFrom({ currentUserPrivilegeSet: { privilege: [{ read: {} }, { readCurrentUserPrivilegeSet: {} }] } })).toBe(true);
    expect(readOnlyFrom({ currentUserPrivilegeSet: { privilege: [{ read: {} }, { write: {} }] } })).toBe(false);
    expect(readOnlyFrom({ currentUserPrivilegeSet: { privilege: { all: {} } } })).toBe(false);
    expect(readOnlyFrom(undefined)).toBe(false);
  });

  it("maps auth failures without leaking provider text", async () => {
    const f = fakeDav({ failWith: new Error("401 Unauthorized for secret-pw") });
    const e = await createCaldavProvider({ dav: f.dav }).listCalendars().catch((x: ProviderError) => x);
    expect(e).toMatchObject({ kind: "auth", message: "Access was rejected." });
  });
});
