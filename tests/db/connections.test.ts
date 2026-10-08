import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt } from "@/server/crypto";
import { connections, githubEtags } from "@/server/db/schema";
import { getConnections, readToken, removeToken, saveToken, writeToken } from "@/server/github/connections";
import repos from "../fixtures/github/repos.json";
import user from "../fixtures/github/user.json";
import { fakeGithub } from "../helpers/fake-github";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const key = randomBytes(32);
const json = (b: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(b), init);
const ok = () => fakeGithub({ "GET /user": () => json(user), "GET /user/repos": () => json(repos) });
const TOKEN = "github_pat_SECRETVALUE1234";

describe("github connections", () => {
  it("verifies, encrypts, never leaks, separates read/write, rotates, removes", async () => {
    const h = t.handle();
    expect(await saveToken(h, "github_read", `  ${TOKEN} `, { fetch: ok(), key })).toMatchObject({ ok: true, login: "owner-test", repos: 3 });
    const [row] = await h.select().from(connections);
    expect(row!.ciphertext).not.toBe(TOKEN);
    expect(decrypt(row!.ciphertext, key)).toBe(TOKEN);
    expect(row!.last4).toBe("1234");

    const dto = await getConnections(h);
    expect(dto.map((c) => c.status)).toEqual(["connected", "none"]);
    const s = JSON.stringify(dto);
    expect(s).not.toContain("SECRETVALUE");
    expect(s).not.toContain("v1.");

    expect(await readToken(h, key)).toBe(TOKEN);
    expect(await writeToken(h, key)).toBeNull();
    await saveToken(h, "github_write", "write_token_0000", { fetch: ok(), key });
    expect(await writeToken(h, key)).toBe("write_token_0000");
    expect(await readToken(h, key)).toBe(TOKEN);

    await saveToken(h, "github_read", "rotated_token_9999", { fetch: ok(), key });
    expect(await readToken(h, key)).toBe("rotated_token_9999");

    await removeToken(h, "github_read");
    expect(await readToken(h, key)).toBeNull();
  });

  it("clears sync ETags when the read token is replaced or removed", async () => {
    const h = t.handle();
    const seed = () => h.insert(githubEtags).values({ url: "/user/repos?per_page=100&sort=pushed", etag: '"e"' }).onConflictDoNothing();
    await seed();
    await saveToken(h, "github_read", "other_account_1111", { fetch: ok(), key });
    expect(await h.select().from(githubEtags)).toHaveLength(0);
    await seed();
    await removeToken(h, "github_read");
    expect(await h.select().from(githubEtags)).toHaveLength(0);
  });

  it("failure modes write nothing", async () => {
    const h = t.handle();
    await h.delete(connections);
    const f = (routes: Parameters<typeof fakeGithub>[0]) => fakeGithub(routes);
    expect(await saveToken(h, "github_read", "x", { fetch: f({ "GET /user": () => json({ message: "Bad" }, { status: 401 }) }), key })).toEqual({ ok: false, error: "rejected" });
    expect(await saveToken(h, "github_read", "x", { fetch: f({ "GET /user": () => json(user), "GET /user/repos": () => json([]) }), key })).toEqual({ ok: false, error: "no_repos" });
    const down = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    expect(await saveToken(h, "github_read", "x", { fetch: down, key })).toEqual({ ok: false, error: "unreachable" });
    expect(await saveToken(h, "github_read", "   ", { fetch: ok(), key })).toEqual({ ok: false, error: "invalid" });
    expect(await h.select().from(connections)).toHaveLength(0);
  });
});
