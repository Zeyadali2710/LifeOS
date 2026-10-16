import { afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { approvedHash } from "@/server/agents/tools/socials";
import { encrypt } from "@/server/crypto";
import type { DB } from "@/server/db/client";
import { approvals, connections, socialVariants } from "@/server/db/schema";
import { refreshSocialToken } from "@/server/socials/connections";
import { publishVariant } from "@/server/socials/publish";

const key = vi.hoisted(() => Buffer.alloc(32, 11).toString("base64"));
const activity = vi.hoisted(() => vi.fn());
vi.mock("@/server/env", () => ({ env: () => ({ LIFEOS_MASTER_KEY: key }) }));
vi.mock("@/server/events", () => ({ notifyLive: vi.fn(), emitActivity: activity }));

const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
const now = new Date("2026-10-16T00:00:00Z");
function fixture() {
  const payload = { variantId: "11111111-1111-4111-8111-111111111111", platform: "instagram" as const,
    text: "Approved caption", imageUrl: "https://images.example.com/approved.jpg", linkUrl: null, publishAt: null,
    providerMode: "real" as const, connectionGeneration: "22222222-2222-4222-8222-222222222222" };
  const approval = { id: "33333333-3333-4333-8333-333333333333", status: "executed", originalPayload: payload, editedPayload: null };
  const variant = { id: payload.variantId, platform: payload.platform, status: "scheduled", approvalId: approval.id,
    text: payload.text, imageUrl: payload.imageUrl, linkUrl: null, approvedTextHash: approvedHash(payload),
    approvedProviderMode: "real", approvedConnectionGeneration: payload.connectionGeneration,
    remoteId: null, remoteUrl: null, containerId: null, scheduledAt: now, updatedAt: now, lastError: null };
  let connection = { id: "instagram", status: "connected", login: "owner", ciphertext: encrypt("token-A"),
    credentialGeneration: payload.connectionGeneration, expiresAt: new Date("2030-01-01"), lastError: null };
  let connectionReads = 0;
  const h = {
    select: () => ({ from: (table: unknown) => ({ where: () => {
      if (table === connections) connectionReads++;
      const rows = table === connections ? [{ ...connection }] : table === approvals ? [{ ...approval }] : [{ ...variant }];
      return Object.assign(Promise.resolve(rows), { for: async () => rows });
    } }) }),
    update: (table: unknown) => ({ set: (value: object) => ({ where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => ({ returning: async () => {
      if (table === socialVariants) { Object.assign(variant, value); return [{ id: variant.id }]; }
      const p = new PgDialect({ casing: "snake_case" }).sqlToQuery(condition).params;
      if (p[0] !== connection.id || p[1] !== connection.credentialGeneration || (p.length > 2 && p[2] !== connection.ciphertext)) return [];
      connection = { ...connection, ...value }; return [{ id: connection.id }];
    } }) }) }),
    transaction: async (fn: (handle: unknown) => unknown) => fn(h),
  } as unknown as DB;
  return { h, variant, approval, connection: () => connection, reads: () => connectionReads };
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.clearAllMocks(); });
describe("delayed Social publish authentication failure", () => {
  it.each([401, 403])("does not disable a same-generation refreshed token after an old %s response", async (status) => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
    const t = fixture(); const original = { ...t.connection() };
    const started = deferred<void>(); const response = deferred<Response>();
    const f = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: "Bearer token-A" });
      started.resolve(); return response.promise;
    });
    vi.stubGlobal("fetch", f);
    const publishing = publishVariant(t.variant.id, t.approval.id, t.h, now);
    await started.promise;
    const refreshed = await refreshSocialToken(t.h, "instagram", original, { accessToken: "token-B", expiresAt: new Date("2031-01-01") });
    expect(refreshed.ciphertext).not.toBe(original.ciphertext);
    expect(refreshed.credentialGeneration).toBe(original.credentialGeneration);
    response.resolve(Response.json({}, { status })); await publishing;
    expect(t.connection()).toMatchObject({ ciphertext: refreshed.ciphertext, credentialGeneration: original.credentialGeneration, status: "connected", lastError: null });
    expect(t.variant).toMatchObject({ status: "failed", lastError: "RECONNECT" });
    expect(t.reads()).toBe(1); expect(f).toHaveBeenCalledOnce();
    const publicOutput = JSON.stringify(activity.mock.calls);
    for (const secret of [original.ciphertext, refreshed.ciphertext, "token-A", "token-B"]) expect(publicOutput).not.toContain(secret);
  });

  it.each([401, 403])("still marks an unchanged credential RECONNECT on %s", async (status) => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
    const t = fixture(); const original = { ...t.connection() };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status })));
    await publishVariant(t.variant.id, t.approval.id, t.h, now);
    expect(t.connection()).toMatchObject({ ciphertext: original.ciphertext, credentialGeneration: original.credentialGeneration, status: "error", lastError: "RECONNECT" });
    expect(t.variant.status).toBe("failed"); expect(t.reads()).toBe(1);
  });
});
