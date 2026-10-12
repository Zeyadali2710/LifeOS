import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ProviderError } from "@/server/calendar/errors";
import { CALENDAR_SCOPES, GMAIL_BASE, GMAIL_READ, createGoogle } from "@/server/calendar/google/client";
import { createGmail, gmailAllowed } from "@/server/mail/client";
import { fakeGoogle, json } from "../helpers/fake-google";

const P = "/gmail/v1/users/me";
const gm = (f: typeof fetch) => createGmail({ getToken: async () => "tok", fetch: f });
const kind = (p: Promise<unknown>) => p.then(() => "ok", (e: ProviderError) => `${e.kind}:${e.status}`);
const perm = { error: { errors: [{ reason: "insufficientPermissions" }] } };

describe("gmail client", () => {
  it("calls only the fixed Gmail host and rejects odd paths", async () => {
    const f = fakeGoogle({ [`GET ${P}/profile`]: json({ emailAddress: "me@x.com", historyId: "9" }) });
    expect(await gm(f).profile()).toEqual({ emailAddress: "me@x.com", historyId: "9" });
    expect(f.calls[0]!.url.startsWith(`${GMAIL_BASE}/profile`)).toBe(true);
    const g = createGoogle({ base: GMAIL_BASE, getToken: async () => "t", fetch: f });
    await expect(g.call("GET", "//evil", z.unknown())).rejects.toThrow();
    await expect(g.call("GET", "/a://b", z.unknown())).rejects.toThrow();
    expect(() => createGoogle({ base: "https://evil.example" as typeof GMAIL_BASE, getToken: async () => "t" })).toThrow();
  });

  it("403 insufficientPermissions is scope on Gmail, auth on Calendar", async () => {
    expect(await kind(gm(fakeGoogle({ [`GET ${P}/profile`]: json(perm, 403) })).profile())).toBe("scope:403");
    const cal = createGoogle({ getToken: async () => "t", fetch: fakeGoogle({ "GET /calendar/v3/x": json(perm, 403) }) });
    expect(await kind(cal.call("GET", "/x", z.unknown()))).toBe("auth:403");
  });

  it("maps 404 history, 429 and network failure", async () => {
    expect(await kind(gm(fakeGoogle({ [`GET ${P}/history`]: json({}, 404) })).history("1"))).toBe("not_found:404");
    expect(await kind(gm(fakeGoogle({ [`GET ${P}/profile`]: json({}, 429) })).profile())).toBe("rate_limit:429");
    const down = (async () => {
      throw new Error("net");
    }) as unknown as typeof fetch;
    expect(await kind(gm(down).profile())).toBe("unavailable:0");
  });

  it("listMessages pages and reports truncation", async () => {
    const page = (n: number, next?: string) => json({ messages: [{ id: `m${n}`, threadId: `t${n}` }], nextPageToken: next });
    const f = fakeGoogle({ [`GET ${P}/messages`]: [page(1, "a"), page(2, "b"), page(3)] });
    expect(await gm(f).listMessages({ q: "newer_than:30d", labelIds: ["INBOX"], maxPages: 5 })).toEqual({
      ids: [1, 2, 3].map((n) => ({ id: `m${n}`, threadId: `t${n}` })),
      truncated: false,
    });
    expect(f.calls[0]!.url).toContain("labelIds=INBOX");
    const f2 = fakeGoogle({ [`GET ${P}/messages`]: [page(1, "a"), page(2, "b")] });
    const r = await gm(f2).listMessages({ maxPages: 2 });
    expect(r.ids).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });

  it("history pages until done; metadata repeats metadataHeaders; findSent and drafts", async () => {
    const f = fakeGoogle({
      [`GET ${P}/history`]: [json({ history: [{ id: "1" }], nextPageToken: "n" }), json({ history: [{ id: "2" }], historyId: "50" })],
      [`GET ${P}/messages/m1`]: json({ id: "m1", threadId: "t1" }),
      [`GET ${P}/messages`]: json({ messages: [{ id: "s1", threadId: "t" }] }),
      [`POST ${P}/drafts`]: json({ id: "d1", message: { id: "x", threadId: "t" } }),
      [`POST ${P}/drafts/send`]: json({ id: "sent1", threadId: "t" }),
      [`DELETE ${P}/drafts/d1`]: () => new Response(null, { status: 204 }),
    });
    const g = gm(f);
    expect(await g.history("10")).toEqual({ history: [{ id: "1" }, { id: "2" }], historyId: "50" });
    await g.getMetadata("m1", ["From", "Subject"]);
    expect(f.calls.find((c) => c.url.includes("/messages/m1"))!.url).toContain("metadataHeaders=From&metadataHeaders=Subject");
    expect(await g.findSent("<approval-1@lifeos.local>")).toBe("s1");
    expect((await g.createDraft("raw", "t")).id).toBe("d1");
    expect(f.calls.find((c) => c.url.endsWith("/drafts"))!.body).toEqual({ message: { raw: "raw", threadId: "t" } });
    expect(await g.sendDraft("d1")).toEqual({ id: "sent1", threadId: "t" });
    await g.deleteDraft("d1");
  });

  it("gmailAllowed checks granted scopes", () => {
    expect(gmailAllowed([...CALENDAR_SCOPES, GMAIL_READ], "read")).toBe(true);
    expect(gmailAllowed(CALENDAR_SCOPES, "compose")).toBe(false);
  });
});
