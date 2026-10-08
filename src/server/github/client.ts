import { z } from "zod";

const BASE = "https://api.github.com";

export type GithubErrorKind = "auth" | "rate_limit" | "not_found" | "server" | "network" | "client";

export class GithubError extends Error {
  constructor(
    public kind: GithubErrorKind,
    public status: number,
    message: string,
    public retryAfterSec?: number,
  ) {
    super(message);
    this.name = "GithubError";
  }
}

export const tokenExpiry = (h: Headers): Date | null => {
  const v = h.get("github-authentication-token-expiration");
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

function checkPath(path: string) {
  if (!path.startsWith("/") || path.includes("://")) throw new Error("Invalid GitHub path");
}

export function createGithub({ token, fetch = globalThis.fetch, timeoutMs = 15000 }: { token: string; fetch?: typeof globalThis.fetch; timeoutMs?: number }) {
  async function call(url: string, init: RequestInit = {}, etag?: string): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "LifeOS",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (etag) headers["If-None-Match"] = etag;
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new GithubError("network", 0, "GitHub unreachable");
    }
    if (res.ok || res.status === 304) return res;
    const msg = ((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? `GitHub error ${res.status}`;
    const retry = res.headers.get("retry-after");
    if (res.status === 401) throw new GithubError("auth", 401, msg);
    if ((res.status === 403 || res.status === 429) && (res.headers.get("x-ratelimit-remaining") === "0" || retry)) {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      const sec = retry ? Number(retry) : reset ? Math.max(0, reset - Math.floor(Date.now() / 1000)) : 60;
      throw new GithubError("rate_limit", res.status, msg, sec);
    }
    if (res.status === 404) throw new GithubError("not_found", 404, msg);
    if (res.status >= 500) throw new GithubError("server", res.status, msg);
    throw new GithubError("client", res.status, msg);
  }

  async function get<T>(path: string, schema: z.ZodType<T>, opts: { etag?: string } = {}) {
    checkPath(path);
    const res = await call(BASE + path, {}, opts.etag);
    if (res.status === 304) return { status: 304 as const };
    return { status: 200 as const, data: schema.parse(await res.json()), etag: res.headers.get("etag"), headers: res.headers };
  }

  async function paginate<T>(path: string, itemSchema: z.ZodType<T>, maxPages = 3): Promise<T[]> {
    checkPath(path);
    const out: T[] = [];
    let url: string | null = BASE + path;
    for (let i = 0; url && i < maxPages; i++) {
      const res: Response = await call(url);
      out.push(...z.array(itemSchema).parse(await res.json()));
      const next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get("link") ?? "")?.[1];
      url = next && next.startsWith(`${BASE}/`) ? next : null;
    }
    return out;
  }

  async function post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    checkPath(path);
    const res = await call(BASE + path, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
    return schema.parse(await res.json());
  }

  return { get, paginate, post, tokenExpiry };
}
