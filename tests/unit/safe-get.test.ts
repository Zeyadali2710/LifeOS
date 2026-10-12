import { EventEmitter } from "node:events";
import https from "node:https";
import { describe, expect, it, vi } from "vitest";
import { safeGet, SafeGetError } from "@/server/net/safe-get";

type Resp = { status: number; headers?: Record<string, string>; chunks?: string[]; hang?: boolean };
function fake(resps: Resp[]) {
  const urls: string[] = [];
  const request = ((url: string, _o: unknown, cb: (r: EventEmitter) => void) => {
    urls.push(url);
    const r = resps.shift()!;
    return Object.assign(new EventEmitter(), {
      destroy: vi.fn(),
      end() {
        if (r.hang) return;
        const res = Object.assign(new EventEmitter(), { statusCode: r.status, headers: r.headers ?? {} });
        cb(res);
        for (const c of r.chunks ?? []) res.emit("data", Buffer.from(c));
        res.emit("end");
      },
    });
  }) as never;
  return { request, urls };
}
const pub = ((_h: string, _o: unknown, cb: (...a: unknown[]) => void) => cb(null, [{ address: "93.184.216.34", family: 4 }])) as never;
const priv = ((_h: string, _o: unknown, cb: (...a: unknown[]) => void) => cb(null, [{ address: "192.168.1.5", family: 4 }])) as never;
const err = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as SafeGetError;

describe("safeGet", () => {
  it("rejects http without a request", async () => {
    const f = fake([]);
    expect((await err(safeGet("http://example.com", { request: f.request }))).code).toBe("invalid");
    expect(f.urls).toHaveLength(0);
  });
  it("rejects credentials in the URL", async () => {
    expect((await err(safeGet("https://u:p@example.com/"))).code).toBe("invalid");
  });
  it.each(["https://127.0.0.1/", "https://10.1.2.3/", "https://169.254.169.254/", "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://100.64.0.1/"])(
    "blocks literal %s without lookup",
    async (u) => {
      const lookup = vi.fn();
      const f = fake([]);
      expect((await err(safeGet(u, { lookup: lookup as never, request: f.request }))).code).toBe("blocked");
      expect(lookup).not.toHaveBeenCalled();
      expect(f.urls).toHaveLength(0);
    },
  );
  it("blocks a hostname resolving to a private IP at connect time", async () => {
    // real https.request so node itself drives the guarded lookup
    expect((await err(safeGet("https://internal.test/", { lookup: priv, request: https.request }))).code).toBe("blocked");
  });
  it("proceeds when the hostname resolves public", async () => {
    const f = fake([{ status: 200, headers: { "content-type": "text/html" }, chunks: ["hi"] }]);
    const r = await safeGet("https://example.com/a", { lookup: pub, request: f.request });
    expect(r).toMatchObject({ status: 200, body: "hi", contentType: "text/html", finalUrl: "https://example.com/a" });
  });
  it("blocks a redirect to a private host", async () => {
    const f = fake([{ status: 302, headers: { location: "https://127.0.0.1/" } }]);
    expect((await err(safeGet("https://example.com/", { request: f.request }))).code).toBe("blocked");
  });
  it("rejects a redirect to http", async () => {
    const f = fake([{ status: 302, headers: { location: "http://example.com/" } }]);
    expect((await err(safeGet("https://example.com/", { request: f.request }))).code).toBe("invalid");
  });
  it("follows up to 3 redirects, not 4", async () => {
    const hop = { status: 301, headers: { location: "/n" } };
    expect((await err(safeGet("https://example.com/", { request: fake([hop, hop, hop, hop]).request }))).code).toBe("redirects");
    const ok = await safeGet("https://example.com/", { request: fake([hop, hop, hop, { status: 200, chunks: ["x"] }]).request });
    expect(ok.body).toBe("x");
  });
  it("too_large vs truncateOk", async () => {
    const mk = () => fake([{ status: 200, chunks: ["abcd", "efgh"] }]).request;
    expect((await err(safeGet("https://example.com/", { maxBytes: 6, request: mk() }))).code).toBe("too_large");
    expect((await safeGet("https://example.com/", { maxBytes: 6, truncateOk: true, request: mk() })).body).toBe("abcdef");
  });
  it("non-2xx -> status", async () => {
    const e = await err(safeGet("https://example.com/", { request: fake([{ status: 404 }]).request }));
    expect(e).toMatchObject({ code: "status", status: 404 });
  });
  it("timeout -> unreachable; messages never contain the URL", async () => {
    const e = await err(safeGet("https://example.com/secret-token", { timeoutMs: 20, request: fake([{ status: 200, hang: true }]).request }));
    expect(e.code).toBe("unreachable");
    expect(e.message).not.toContain("secret-token");
  });
});
