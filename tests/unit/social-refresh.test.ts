import { afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DB } from "@/server/db/client";
import { connections } from "@/server/db/schema";
import { decrypt, encrypt } from "@/server/crypto";
import { syncSocials } from "@/server/socials/sync";
const key = vi.hoisted(() => Buffer.alloc(32, 11).toString("base64"));
vi.mock("@/server/env", () => ({ env: () => ({ LIFEOS_MASTER_KEY: key }) }));
vi.mock("@/server/events", () => ({ notifyLive: vi.fn(), emitActivity: vi.fn() }));
vi.mock("@/server/socials/publish", () => ({ runScheduled: vi.fn() }));
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
const now = new Date("2026-10-15T02:00:00Z");
function fixture() {
  let row = { id: "tiktok", status: "connected", login: "A", scopes: ["user.info.basic", "user.info.stats"], credentialGeneration: "generation-A", expiresAt: new Date("2026-10-15T03:00:00Z"), updatedAt: now,
    ciphertext: encrypt(JSON.stringify({ accessToken: "access-A", refreshToken: "refresh-A", refreshExpiresAt: "2030-01-01T00:00:00Z" })), lastSyncError: null };
  const snapshots: unknown[] = [];
  const matches = (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
    const p = new PgDialect({ casing: "snake_case" }).sqlToQuery(condition).params;
    return p[0] === row.id && (p.length === 1 || (p[1] === row.credentialGeneration && (p.length < 3 || p[2] === row.ciphertext)));
  };
  const h = {
    select: () => ({ from: () => ({ where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      const p = new PgDialect({ casing: "snake_case" }).sqlToQuery(condition).params;
      const result = p[0] === "tiktok_app" ? [{ ciphertext: encrypt(JSON.stringify({ clientKey: "key", clientSecret: "secret" })) }] : matches(condition) ? [{ ...row }] : [];
      return Object.assign(Promise.resolve(result), { for: async () => result });
    } }) }),
    update: () => ({ set: (value: object) => ({ where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      const apply = () => { if (!matches(condition)) return []; row = { ...row, ...value }; return [{ id: row.id }]; };
      return { returning: async () => apply(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(apply()).then(resolve) };
    } }) }),
    insert: (table: unknown) => ({ values: (value: unknown) => ({ onConflictDoUpdate: async () => { if (table !== connections) snapshots.push(value); } }) }),
    transaction: async (fn: (handle: unknown) => unknown) => fn(h),
  } as unknown as DB;
  return { h, snapshots, current: () => row, replace: () => { row = { ...row, login: "B", credentialGeneration: "generation-B", ciphertext: encrypt("replacement"), expiresAt: new Date("2030-01-01") }; } };
}
const refreshed = (token: string) => Response.json({ access_token: token, refresh_token: `refresh-${token}`, open_id: "A", scope: "user.info.basic,user.info.stats", expires_in: 86400, refresh_expires_in: 31536000 });
afterEach(() => vi.useRealTimers());
describe("in-flight Social credential replacement", () => {
  it.each([200, 401])("discards an old refresh response after reconnect (status %s)", async (status) => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
    const t = fixture(); const started = deferred<void>(); const response = deferred<Response>();
    const f = vi.fn(async () => { started.resolve(); return response.promise; }) as typeof fetch;
    const running = syncSocials(t.h, now, f);
    await started.promise; t.replace(); const expected = t.current().ciphertext;
    response.resolve(status === 401 ? Response.json({}, { status }) : refreshed("late-A"));
    await running;
    expect(t.current()).toMatchObject({ login: "B", credentialGeneration: "generation-B", ciphertext: expected, status: "connected", lastSyncError: null });
    expect(t.snapshots).toEqual([]);
    expect(decrypt(expected)).toBe("replacement");
  });
  it("allows only one of two refreshes from the same original ciphertext to win", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
    const t = fixture(); const started = deferred<void>(); const responses = [deferred<Response>(), deferred<Response>()]; let count = 0;
    const f = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/oauth/token/")) {
        const index = count++; if (count === 2) started.resolve();
        return responses[index]!.promise;
      }
      return Response.json({ error: { code: "ok" }, data: { user: { follower_count: 12 } } });
    }) as typeof fetch;
    const first = syncSocials(t.h, now, f); const second = syncSocials(t.h, now, f);
    await started.promise;
    responses[1]!.resolve(refreshed("winner")); await second;
    responses[0]!.resolve(refreshed("late")); await first;
    expect(JSON.parse(decrypt(t.current().ciphertext)).accessToken).toBe("winner");
    expect(t.current().lastSyncError).toBeNull();
    expect(t.snapshots).toHaveLength(1);
  });
});
