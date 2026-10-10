import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { connectIcloud } from "@/server/calendar/caldav/provider";
import { ProviderError } from "@/server/calendar/errors";
import { auditLog, calendars, connections } from "@/server/db/schema";
import { fakeDav } from "../helpers/fake-dav";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const key = randomBytes(32);
const PW = "abcd-efgh-ijkl-mnop";
const factory = (f = fakeDav()) => async () => f.dav;

describe("connectIcloud", () => {
  it("trims, validates, stores encrypted, lists calendars, audits without the password", async () => {
    const h = t.handle();
    const r = await connectIcloud(h, " me@icloud.com ", PW, { davFactory: factory(), key });
    expect(r).toEqual({ ok: true, calendars: 1 });
    const [row] = await h.select().from(connections);
    expect(row!.login).toBe("me@icloud.com");
    expect(row!.ciphertext).not.toContain(PW);
    const [c] = await h.select().from(calendars);
    expect(c).toMatchObject({ enabled: true, category: "personal" });
    const audits = await h.select().from(auditLog);
    expect(JSON.stringify(audits)).not.toContain(PW);
    expect(audits.at(-1)!.metadata).toEqual({ id: "icloud_calendar", account: "me@icloud.com" });
    expect(JSON.stringify(r)).not.toContain(PW);
  });

  it("validates input", async () => {
    const h = t.handle();
    expect(await connectIcloud(h, "me@icloud.com", "  ", { davFactory: factory(), key })).toEqual({ ok: false, error: "empty" });
    expect(await connectIcloud(h, "not-an-email", PW, { davFactory: factory(), key })).toEqual({ ok: false, error: "invalid" });
    expect(await connectIcloud(h, "me@icloud.com", "x".repeat(65), { davFactory: factory(), key })).toEqual({ ok: false, error: "invalid" });
  });

  it("rejected and unreachable store nothing", async () => {
    const h = t.handle();
    const bad = async () => {
      throw new ProviderError("icloud", "auth", 401, "Access was rejected.");
    };
    const down = async () => {
      throw new ProviderError("icloud", "unavailable", 0, "iCloud didn't respond.");
    };
    expect(await connectIcloud(h, "me@icloud.com", PW, { davFactory: bad, key })).toEqual({ ok: false, error: "rejected" });
    expect(await connectIcloud(h, "me@icloud.com", PW, { davFactory: down, key })).toEqual({ ok: false, error: "unreachable" });
    expect(await h.select().from(connections)).toHaveLength(0);
  });
});
