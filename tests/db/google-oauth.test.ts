import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GOOGLE_SCOPES } from "@/server/calendar/google/client";
import { completeGoogleOAuth, startGoogleOAuth } from "@/server/calendar/google/oauth";
import { auditLog, calendars, connections } from "@/server/db/schema";
import list from "../fixtures/calendar/google-calendar-list.json";
import { fakeGoogle, json } from "../helpers/fake-google";
import { setupTestDb } from "./helpers";

vi.mock("@/server/env", () => ({
  env: () => ({ BETTER_AUTH_URL: "https://lifeos.example.ts.net", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "csecret" }),
}));

const t = setupTestDb();
const key = randomBytes(32);
const RT = "refresh-token-secret";
const tokens = (scope = GOOGLE_SCOPES.join(" ")) => json({ access_token: "access-secret", expires_in: 3600, refresh_token: RT, scope });
const fake = (scope?: string) => fakeGoogle({ "POST /token": tokens(scope), "GET /calendar/v3/users/me/calendarList": json(list) });
const begin = (now = new Date()) => {
  const s = startGoogleOAuth({ now, key }) as { url: string; cookie: string };
  return { cookie: s.cookie, state: new URL(s.url).searchParams.get("state")! };
};

describe("google oauth", () => {
  it("start builds a url bound to BETTER_AUTH_URL", () => {
    const s = startGoogleOAuth({ key }) as { url: string };
    expect(new URL(s.url).searchParams.get("redirect_uri")).toBe("https://lifeos.example.ts.net/api/connections/google/callback");
  });

  it("rejects a wrong state, a stale cookie and a missing cookie, saving nothing", async () => {
    const h = t.handle();
    const { cookie } = begin();
    const f = fake();
    expect(await completeGoogleOAuth(h, { code: "c", state: "wrong", error: null, cookie, fetch: f, key })).toEqual({ ok: false, error: "state" });
    expect(await completeGoogleOAuth(h, { code: "c", state: null, error: null, cookie: null, fetch: f, key })).toEqual({ ok: false, error: "state" });
    const old = begin(new Date(Date.now() - 11 * 60_000));
    expect(await completeGoogleOAuth(h, { code: "c", state: old.state, error: null, cookie: old.cookie, fetch: f, key })).toEqual({ ok: false, error: "state" });
    expect(await h.select().from(connections)).toHaveLength(0);
    expect(f.calls).toHaveLength(0);
  });

  it("access_denied is cancelled; missing scope is rejected", async () => {
    const h = t.handle();
    const a = begin();
    expect(await completeGoogleOAuth(h, { code: null, state: a.state, error: "access_denied", cookie: a.cookie, fetch: fake(), key })).toEqual({ ok: false, error: "cancelled" });
    const b = begin();
    const r = await completeGoogleOAuth(h, { code: "c", state: b.state, error: null, cookie: b.cookie, fetch: fake(GOOGLE_SCOPES[0]), key });
    expect(r).toEqual({ ok: false, error: "scope" });
    expect(await h.select().from(connections)).toHaveLength(0);
  });

  it("stores encrypted tokens, lists calendars, audits without secrets, queues a sync", async () => {
    const h = t.handle();
    const { cookie, state } = begin();
    const enqueue = vi.fn(async () => {});
    const f = fake();
    const r = await completeGoogleOAuth(h, { code: "c", state, error: null, cookie, fetch: f, key, enqueue });
    expect(r).toEqual({ ok: true, calendars: 6 });
    const [row] = await h.select().from(connections);
    expect(row).toMatchObject({ id: "google_calendar", login: "me@gmail.com", status: "connected" });
    expect(row!.ciphertext).not.toContain(RT);
    const cals = await h.select().from(calendars);
    expect(cals.find((c) => c.remoteId === "me@gmail.com")).toMatchObject({ enabled: true });
    expect(cals.find((c) => c.kind === "holiday")).toMatchObject({ enabled: false });
    const audits = JSON.stringify(await h.select().from(auditLog));
    expect(audits).not.toContain(RT);
    expect(audits).not.toContain("access-secret");
    expect(enqueue).toHaveBeenCalledWith("calendar.sync", {}, { singletonKey: "calendar.sync" });
    expect(f.calls[0]!.body).toMatchObject({ grant_type: "authorization_code", code: "c" });
  });
});
