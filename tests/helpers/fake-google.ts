type Route = (req: Request) => Response | Promise<Response>;
export type GoogleCall = { method: string; url: string; headers: Headers; body: unknown };
const HOSTS = new Set(["accounts.google.com", "oauth2.googleapis.com", "www.googleapis.com", "gmail.googleapis.com"]);

// Route key "GET /calendar/v3/calendars/x/events" matches method + pathname; include "?" to match the query too.
// A route may be an array: responses are served in order (the last repeats).
export function fakeGoogle(routes: Record<string, Route | Route[]>) {
  const calls: GoogleCall[] = [];
  const idx: Record<string, number> = {};
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const u = new URL(req.url);
    if (!HOSTS.has(u.hostname)) throw new Error(`fake google: unexpected host ${u.hostname}`);
    const text = req.method === "GET" ? "" : await req.clone().text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = Object.fromEntries(new URLSearchParams(text));
      }
    }
    calls.push({ method: req.method, url: req.url, headers: req.headers, body });
    const k = [`${req.method} ${u.pathname}${u.search}`, `${req.method} ${u.pathname}`].find((x) => x in routes);
    if (!k) return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 });
    const r = routes[k]!;
    if (!Array.isArray(r)) return r(req);
    const i = idx[k] ?? 0;
    idx[k] = i + 1;
    return r[Math.min(i, r.length - 1)]!(req);
  }) as typeof fetch & { calls: GoogleCall[] };
  fn.calls = calls;
  return fn;
}

export const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => () => new Response(JSON.stringify(b), { status, headers });
