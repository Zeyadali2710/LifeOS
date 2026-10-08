type Route = (req: Request) => Response | Promise<Response>;
export type GithubCall = { method: string; url: string; auth: string | null; body: unknown };

// Route key "GET /user" matches method + pathname; include "?" in the key to match the query too.
export function fakeGithub(routes: Record<string, Route>) {
  const calls: GithubCall[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const u = new URL(req.url);
    const text = req.method === "GET" ? "" : await req.clone().text();
    calls.push({ method: req.method, url: req.url, auth: req.headers.get("authorization"), body: text ? JSON.parse(text) : null });
    const route = routes[`${req.method} ${u.pathname}${u.search}`] ?? routes[`${req.method} ${u.pathname}`];
    return route ? route(req) : new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
  }) as typeof fetch & { calls: GithubCall[] };
  fn.calls = calls;
  return fn;
}
