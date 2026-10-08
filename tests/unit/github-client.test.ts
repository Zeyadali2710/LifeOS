import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createGithub, type GithubError } from "@/server/github/client";
import repos from "../fixtures/github/repos.json";
import user from "../fixtures/github/user.json";
import { fakeGithub } from "../helpers/fake-github";

const json = (b: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(b), init);
const U = z.object({ login: z.string() });
const R = z.object({ id: z.number() });
const err = async (p: Promise<unknown>) => (await p.catch((e) => e)) as GithubError;

describe("github client", () => {
  it("sends auth headers, etag, 304, and exposes expiry", async () => {
    let seen: Request | undefined;
    const f = fakeGithub({
      "GET /user": (r) => {
        seen = r;
        return r.headers.get("if-none-match")
          ? new Response(null, { status: 304 })
          : json(user, { headers: { etag: '"x"', "github-authentication-token-expiration": "2030-01-01 00:00:00 UTC" } });
      },
    });
    const gh = createGithub({ token: "tok", fetch: f });
    const r = await gh.get("/user", U);
    expect(r).toMatchObject({ status: 200, data: { login: "owner-test" }, etag: '"x"' });
    expect(gh.tokenExpiry((r as { headers: Headers }).headers)?.getUTCFullYear()).toBe(2030);
    expect(seen!.headers.get("authorization")).toBe("Bearer tok");
    expect(seen!.headers.get("x-github-api-version")).toBe("2022-11-28");
    expect(await gh.get("/user", U, { etag: '"x"' })).toEqual({ status: 304 });
  });

  it("paginates, bounded, same-origin only", async () => {
    const f = fakeGithub({
      "GET /user/repos": (r) => {
        const p = new URL(r.url).searchParams.get("page");
        const next = p === "2" ? "https://evil.example/x" : "https://api.github.com/user/repos?page=2";
        return json(repos.slice(0, p === "2" ? 2 : 1), { headers: { link: `<${next}>; rel="next"` } });
      },
    });
    expect(await createGithub({ token: "t", fetch: f }).paginate("/user/repos", R)).toHaveLength(3);
    expect(f.calls).toHaveLength(2);
    expect(await createGithub({ token: "t", fetch: f }).paginate("/user/repos", R, 1)).toHaveLength(1);
  });

  it("maps errors", async () => {
    const st = (status: number, headers: Record<string, string> = {}) =>
      createGithub({ token: "t", fetch: fakeGithub({ "GET /x": () => json({ message: "m" }, { status, headers }) }) }).get("/x", U);
    expect((await err(st(401))).kind).toBe("auth");
    const rl = await err(st(403, { "x-ratelimit-remaining": "0", "retry-after": "30" }));
    expect([rl.kind, rl.retryAfterSec]).toEqual(["rate_limit", 30]);
    expect((await err(st(404))).kind).toBe("not_found");
    expect((await err(st(502))).kind).toBe("server");
    const c = await err(st(422));
    expect([c.kind, c.message]).toEqual(["client", "m"]);
    const down = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    expect((await err(createGithub({ token: "t", fetch: down }).get("/x", U))).kind).toBe("network");
  });

  it("rejects non-relative paths", async () => {
    const gh = createGithub({ token: "t", fetch: fakeGithub({}) });
    await expect(gh.get("user", U)).rejects.toThrow();
    await expect(gh.get("/x?u=http://evil", U)).rejects.toThrow();
  });
});
