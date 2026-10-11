import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { saveCalendarSecret } from "@/server/calendar/connections";
import { providerFor } from "@/server/calendar/providers";
import { createCalendarSync } from "@/server/calendar/sync";
import { calendarEvents, calendars } from "@/server/db/schema";
import events from "../fixtures/calendar/google-events.json";
import list from "../fixtures/calendar/google-calendar-list.json";
import { fakeGoogle, json } from "../helpers/fake-google";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const key = randomBytes(32);
const NOW = new Date("2026-10-08T00:00:00Z");
const EV = "/calendar/v3/calendars/me%40gmail.com/events";
const emit = (async () => null) as never;

describe("calendar sync over the Google provider", () => {
  it("first sync, incremental delete, then 410 full refetch", async () => {
    const h = t.handle();
    await saveCalendarSecret(h, "google_calendar", { refreshToken: "r", accessToken: "tok", expiresAt: "2099-01-01T00:00:00Z" }, { account: "me@gmail.com" }, { key });
    const f = fakeGoogle({
      "GET /calendar/v3/users/me/calendarList": json(list),
      // Owned calendars start ticked too (UI-SPEC D-01); Family is empty here.
      "GET /calendar/v3/calendars/family123%40group.calendar.google.com/events": json({ nextSyncToken: "F1", items: [] }),
      [`GET ${EV}`]: [
        json(events.pages[0]),
        json(events.pages[1]),
        json({ nextSyncToken: "SYNC2", items: [{ id: "single1", status: "cancelled" }] }),
        json({}, 410),
        json(events.pages[1]),
      ],
    });
    const s = createCalendarSync({ handle: h, providerFor: (id, hh) => providerFor(id, hh, { fetch: f, key }), emit, now: () => NOW });
    const rows = async () => (await h.select({ r: calendarEvents.remoteId }).from(calendarEvents)).map((x) => x.r).sort();
    const cursor = async () => (await h.select().from(calendars).where(eq(calendars.remoteId, "me@gmail.com")))[0]!.syncCursor;

    expect((await s.run()).google_calendar).toMatchObject({ ok: true });
    expect(await rows()).toEqual(["allday1", "declined1", "free1", "single1", "weekly1", "weekly1_20261019T223000Z", "weekly1_20261026T223000Z"]);
    expect(await cursor()).toBe("SYNC1");
    const [ad] = await h.select().from(calendarEvents).where(eq(calendarEvents.remoteId, "allday1"));
    expect(ad).toMatchObject({ allDay: true, startDate: "2026-11-02", endDate: "2026-11-04" });

    await s.run();
    expect(f.calls.some((c) => c.url.includes("syncToken=SYNC1"))).toBe(true);
    expect(await rows()).not.toContain("single1");
    expect(await cursor()).toBe("SYNC2");

    // 410: the provider refetches everything; rows the full set does not return are removed.
    await s.run();
    expect(await rows()).toEqual(["allday1", "declined1", "free1", "weekly1_20261026T223000Z"]);
    expect(await cursor()).toBe("SYNC1");
  });
});
