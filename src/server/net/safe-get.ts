import dns from "node:dns";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { isSafeUrl } from "@/lib/safe-url";

type Code = "invalid" | "blocked" | "unreachable" | "too_large" | "redirects" | "status";
const MSG: Record<Code, string> = {
  invalid: "Enter a full https:// address.",
  blocked: "That address isn't allowed. Use a public https link.",
  unreachable: "Couldn't reach that address.",
  too_large: "That page is too large to read.",
  redirects: "Too many redirects.",
  status: "That site refused the request.",
};

/** Fixed messages only: URLs (which may carry feed tokens) never appear in errors. */
export class SafeGetError extends Error {
  constructor(
    public code: Code,
    public status?: number,
  ) {
    super(MSG[code]);
    this.name = "SafeGetError";
  }
}

const deny = new BlockList();
for (const [n, p] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  deny.addSubnet(n, p, "ipv4");
deny.addAddress("::", "ipv6");
deny.addAddress("::1", "ipv6");
for (const [n, p] of [
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96], // NAT64 can embed any IPv4, including private ones (IN-S01)
  ["64:ff9b:1::", 48],
  ["2002::", 16], // 6to4 embeds an IPv4 (e.g. 2002:0a00:0001:: = 10.0.0.1)
] as const)
  deny.addSubnet(n, p, "ipv6");

const isBlocked = (ip: string) => {
  const v = isIP(ip);
  return v === 0 || deny.check(ip, v === 6 ? "ipv6" : "ipv4");
};

export type SafeGetOpts = {
  maxBytes?: number;
  timeoutMs?: number;
  accept?: string;
  truncateOk?: boolean;
  lookup?: typeof dns.lookup;
  request?: typeof https.request;
};
export type SafeGetResult = { status: number; contentType: string; body: string; finalUrl: string };

export async function safeGet(url: string, opts: SafeGetOpts = {}): Promise<SafeGetResult> {
  const maxBytes = opts.maxBytes ?? 2_000_000;
  const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
  let cur = url;
  for (let hop = 0; hop <= 3; hop++) {
    if (!isSafeUrl(cur)) throw new SafeGetError("invalid");
    const res = await once(cur, opts, maxBytes, deadline);
    if ([301, 302, 303, 307, 308].includes(res.status) && res.location) {
      try {
        cur = new URL(res.location, cur).toString();
      } catch {
        throw new SafeGetError("invalid");
      }
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new SafeGetError("status", res.status);
    return { status: res.status, contentType: res.contentType, body: res.body, finalUrl: cur };
  }
  throw new SafeGetError("redirects");
}

type Once = { status: number; contentType: string; body: string; location?: string };

function once(url: string, o: SafeGetOpts, maxBytes: number, deadline: number): Promise<Once> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isBlocked(host)) return Promise.reject(new SafeGetError("blocked"));
  const resolve = o.lookup ?? dns.lookup;
  // The connect uses the vetted IP, so a DNS answer can't change between check and connect (rebinding).
  const guardedLookup = ((h: string, opt: dns.LookupOptions | undefined, cb: (...a: unknown[]) => void) => {
    resolve(h, { all: true }, ((err: unknown, list: dns.LookupAddress[] | undefined) => {
      const l = list ?? [];
      if (err || !l.length) return cb(new SafeGetError("unreachable"));
      if (l.some((a) => isBlocked(a.address))) return cb(new SafeGetError("blocked"));
      if (opt?.all) cb(null, l);
      else cb(null, l[0]!.address, l[0]!.family);
    }) as never);
  }) as unknown as typeof dns.lookup;

  return new Promise<Once>((ok, fail) => {
    let done = false;
    const end = (f: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      f();
    };
    const req = (o.request ?? https.request)(
      url,
      { method: "GET", lookup: guardedLookup, headers: { "user-agent": "LifeOS/1 (+personal)", ...(o.accept ? { accept: o.accept } : {}) } },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : undefined;
        const contentType = String(res.headers["content-type"] ?? "");
        const chunks: Buffer[] = [];
        let n = 0;
        const finish = () => ok({ status, contentType, location, body: Buffer.concat(chunks).toString("utf8") });
        res.on("data", (c: Buffer) => {
          if (done) return;
          n += c.length;
          if (n <= maxBytes) return void chunks.push(c);
          if (!o.truncateOk) return end(() => (req.destroy(), fail(new SafeGetError("too_large"))));
          chunks.push(c.subarray(0, c.length - (n - maxBytes)));
          end(() => (req.destroy(), finish()));
        });
        res.on("end", () => end(finish));
        res.on("error", () => end(() => fail(new SafeGetError("unreachable"))));
      },
    );
    const timer = setTimeout(() => end(() => (req.destroy(), fail(new SafeGetError("unreachable")))), Math.max(1, deadline - Date.now()));
    req.on("error", (e) => end(() => fail(e instanceof SafeGetError ? e : new SafeGetError("unreachable"))));
    req.end();
  });
}
