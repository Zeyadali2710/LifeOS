import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ProviderError } from "@/server/calendar/errors";
import { createGoogle, exchangeCode, GOOGLE_SCOPES, googleAuthUrl, refreshAccessToken } from "@/server/calendar/google/client";
import { fakeGoogle, json } from "../helpers/fake-google";

const any = z.unknown();
const g = (f: typeof fetch) => createGoogle({ getToken: async () => "tok", fetch: f });
const kind = (p: Promise<unknown>) => p.then(() => "ok", (e: ProviderError) => `${e.kind}:${e.status}`);

describe("google client", () => {
  it("builds the auth url", () => {
    const u = new URL(googleAuthUrl({ clientId: "c", redirectUri: "https://x/cb", state: "s", challenge: "ch" }));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const q = u.searchParams;
    expect([q.get("response_type"), q.get("access_type"), q.get("prompt"), q.get("code_challenge_method")]).toEqual(["code", "offline", "consent", "S256"]);
    expect(q.get("scope")).toBe("https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events");
  });

  it("exchanges a code, and rejects a missing refresh token", async () => {
    const ok = fakeGoogle({ "POST /token": json({ access_token: "a", expires_in: 3600, refresh_token: "r", scope: GOOGLE_SCOPES.join(" ") }) });
    const r = await exchangeCode({ code: "c", verifier: "v", redirectUri: "u", clientId: "i", clientSecret: "s", fetch: ok });
    expect(r).toMatchObject({ refreshToken: "r", accessToken: "a", scopes: GOOGLE_SCOPES });
    expect(ok.calls[0]!.body).toMatchObject({ code_verifier: "v", grant_type: "authorization_code" });
    const none = fakeGoogle({ "POST /token": json({ access_token: "a", expires_in: 3600 }) });
    await expect(exchangeCode({ code: "c", verifier: "v", redirectUri: "u", clientId: "i", clientSecret: "s", fetch: none })).rejects.toThrow("Google didn't return offline access.");
  });

  it("maps invalid_grant on refresh to auth", async () => {
    const f = fakeGoogle({ "POST /token": json({ error: "invalid_grant" }, 400) });
    const e = await refreshAccessToken({ refreshToken: "r", clientId: "i", clientSecret: "s", fetch: f }).catch((x) => x as ProviderError);
    expect(e).toMatchObject({ kind: "auth", status: 400, message: "Access was rejected." });
  });

  it("maps statuses", async () => {
    const run = (status: number, body: unknown = {}, h: Record<string, string> = {}) => kind(g(fakeGoogle({ "GET /calendar/v3/x": json(body, status, h) })).call("GET", "/x", any));
    expect(await run(401)).toBe("auth:401");
    expect(await run(429, {}, { "retry-after": "7" })).toBe("rate_limit:429");
    expect(await run(403, { error: { errors: [{ reason: "userRateLimitExceeded" }] } })).toBe("rate_limit:403");
    expect(await run(403)).toBe("client:403");
    expect(await run(403, { error: { errors: [{ reason: "forbidden" }] } })).toBe("client:403");
    expect(await run(403, { error: { errors: [{ reason: "insufficientPermissions" }] } })).toBe("auth:403"); // IN-A07
    expect(await run(404)).toBe("not_found:404");
    expect(await run(409)).toBe("conflict:409");
    expect(await run(412)).toBe("conflict:412");
    expect(await run(410)).toBe("gone:410");
    expect(await run(503)).toBe("unavailable:503");
    const down = (async () => {
      throw new Error("net");
    }) as unknown as typeof fetch;
    expect(await kind(g(down).call("GET", "/x", any))).toBe("unavailable:0");
  });

  it("rejects bad paths before fetching", async () => {
    const f = fakeGoogle({});
    for (const p of ["x", "//evil.com/x", "/a://b"]) await expect(g(f).call("GET", p, any)).rejects.toThrow("Invalid Google path");
    expect(f.calls).toHaveLength(0);
  });

  it("sends bearer + If-Match and returns null on 204", async () => {
    const f = fakeGoogle({ "DELETE /calendar/v3/x": () => new Response(null, { status: 204 }) });
    expect(await g(f).call("DELETE", "/x", any, { ifMatch: '"e1"' })).toBeNull();
    expect(f.calls[0]!.headers.get("authorization")).toBe("Bearer tok");
    expect(f.calls[0]!.headers.get("if-match")).toBe('"e1"');
  });

  it("paginates and returns the sync token", async () => {
    const f = fakeGoogle({ "GET /calendar/v3/e": [json({ items: [1], nextPageToken: "p2" }), json({ items: [2], nextSyncToken: "S" })] });
    expect(await g(f).paginate("/e?a=1", z.number())).toEqual({ items: [1, 2], nextSyncToken: "S", truncated: false });
    expect(f.calls[1]!.url).toContain("pageToken=p2");
  });
});
