import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { saveCalendarSecret } from "@/server/calendar/connections";
import { providerFor } from "@/server/calendar/providers";
import { createCalendarSync } from "@/server/calendar/sync";
import { calendarEvents } from "@/server/db/schema";
import { CAL, fakeDav } from "../helpers/fake-dav";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const key = randomBytes(32);
const NOW = new Date("2026-10-08T00:00:00Z");
const fx = (n: string) => readFileSync(`tests/fixtures/calendar/${n}.ics`, "utf8");
const emit = (async () => null) as never;

describe("calendar sync over the iCloud provider", () => {
  it("skips on unchanged ctag, deletes removed resources, keeps X-APPLE props", async () => {
    const h = t.handle();
    await saveCalendarSecret(h, "icloud_calendar", { appleId: "me@icloud.com", password: "abcd-efgh-ijkl-mnop" }, { account: "me@icloud.com" }, { key });
    const f = fakeDav({ objects: { [`${CAL}rec1.ics`]: fx("icloud-recurring"), [`${CAL}day1.ics`]: fx("icloud-allday") } });
    const s = createCalendarSync({ handle: h, providerFor: (id, hh) => providerFor(id, hh, { davFactory: async () => f.dav, key }), emit, now: () => NOW });
    const count = async () => (await h.select().from(calendarEvents)).length;
    const fetched = () => f.calls.filter((c) => c === "objects").length;

    expect((await s.run()).icloud_calendar).toMatchObject({ ok: true });
    expect(await count()).toBe(2);
    expect(fetched()).toBe(1);
    const rows = await h.select().from(calendarEvents);
    expect(rows.some((r) => JSON.stringify(r.raw).includes("X-APPLE-TRAVEL-ADVISORY-BEHAVIOR"))).toBe(true);

    await s.run(); // same ctag: nothing fetched
    expect(fetched()).toBe(1);
    expect(await count()).toBe(2);

    f.calendars[0]!.ctag = "c2";
    f.store.delete(`${CAL}day1.ics`);
    await s.run();
    expect(fetched()).toBe(2);
    expect(await count()).toBe(1);
  });
});
