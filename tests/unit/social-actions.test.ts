import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({ handle: null as unknown, logError: vi.fn() }));
vi.mock("@/server/session", () => ({ requireOwner: async () => ({ user: { id: "owner" } }) }));
vi.mock("@/server/db/client", () => ({ db: () => state.handle }));
vi.mock("@/server/log", () => ({ log: { error: state.logError } }));
vi.mock("@/server/events", () => ({ notifyLive: vi.fn() }));

import { confirmInstagramSmoke, markPosted, retryVariant, saveVariant, socialReviewFacts } from "@/server/socials-actions";
import { TERMINAL_CONTAINER_ERROR } from "@/server/socials/drafts";

describe("social owner action guards", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("clears every resolved prior publication field on an owner redraft", async () => {
    const v = { id, platform: "instagram", status: "failed", remoteId: null, containerId: "old", approvedTextHash: "hash", approvalId: id, lastError: TERMINAL_CONTAINER_ERROR, updatedAt: new Date() };
    let changed: Record<string, unknown> = {};
    state.handle = {
      select: () => ({ from: () => ({ where: async () => [v] }) }),
      update: () => ({ set: (value: Record<string, unknown>) => { changed = value; return { where: () => ({ returning: async () => [{ id }] }) }; } }),
      insert: () => ({ values: async () => undefined }),
      transaction: async (fn: (handle: unknown) => unknown) => fn(state.handle),
    };
    expect(await saveVariant({ id, text: "New caption", imageUrl: "https://example.com/new.jpg" })).toMatchObject({ ok: true });
    expect(changed).toMatchObject({ text: "New caption", containerId: null, remoteId: null, remoteUrl: null, publishedAt: null, metrics: null, isMock: false, approvalId: null });
  });

  it.each([false, true])("requires explicit owner acknowledgement before discarding an uncertain attempt (%s)", async (acknowledged) => {
    const updatedAt = new Date();
    let changed: Record<string, unknown> | null = null;
    state.handle = {
      select: () => ({ from: () => ({ where: async () => [{ id, platform: "linkedin", status: "failed", remoteId: null, containerId: null, approvedTextHash: "hash", approvalId: id, lastError: "may have posted", updatedAt }] }) }),
      update: () => ({ set: (value: Record<string, unknown>) => { changed = value; return { where: () => ({ returning: async () => [{ id }] }) }; } }),
      insert: () => ({ values: async () => undefined }),
      transaction: async (fn: (handle: unknown) => unknown) => fn(state.handle),
    };
    const result = await retryVariant(id, updatedAt.toISOString(), acknowledged);
    expect(result.ok).toBe(acknowledged);
    if (acknowledged) expect(changed).toMatchObject({ status: "draft", approvedTextHash: null });
    else expect(changed).toBeNull();
  });

  it("reconciles a stored remote ID as published without redrafting it", async () => {
    const updatedAt = new Date(); let changed: Record<string, unknown> = {};
    state.handle = {
      select: () => ({ from: () => ({ where: async () => [{ id, platform: "instagram", status: "failed", remoteId: "published-old", containerId: "container-old", approvalId: id, approvedProviderMode: "real", updatedAt }] }) }),
      update: () => ({ set: (value: Record<string, unknown>) => { changed = value; return { where: () => ({ returning: async () => [{ id }] }) }; } }),
      insert: () => ({ values: async () => undefined }),
      transaction: async (fn: (handle: unknown) => unknown) => fn(state.handle),
    };
    expect(await retryVariant(id, updatedAt.toISOString(), false)).toEqual({ ok: true, published: true });
    expect(changed).toMatchObject({ status: "published", remoteId: "published-old" });
    expect(changed).not.toHaveProperty("text"); expect(changed).not.toHaveProperty("containerId");
  });

  it("rejects a stale Instagram attestation atomically without auditing success", async () => {
    let predicate: { sql: string; params: unknown[] } | undefined;
    const insert = vi.fn();
    state.handle = { insert, update: () => ({ set: () => ({ where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      predicate = new PgDialect({ casing: "snake_case" }).sqlToQuery(condition);
      return { returning: async () => [] };
    } }) }) };
    expect(await confirmInstagramSmoke(id)).toEqual({ ok: false, error: "not_allowed" });
    expect(predicate!.sql).toContain('"credential_generation"');
    expect(predicate!.params).toEqual(["instagram", id, "verification_pending"]);
    expect(insert).not.toHaveBeenCalled();
  });

  it("projects current publish status, rejects unsafe external links and detects a removed real binding", async () => {
    const payload = { variantId: id, platform: "linkedin", text: "Approved", imageUrl: null, linkUrl: null, publishAt: null, providerMode: "real", connectionGeneration: id };
    const rows = [[{ tool: "socials.publish", originalPayload: payload, editedPayload: null }], [{ postId: id, approvalId: id, status: "published", scheduledAt: null, remoteUrl: "https://linkedin.com.evil.test/post", isMock: false, lastError: null, draftedFromContent: true }], []];
    const chain = { from: () => chain, innerJoin: () => chain, where: async () => rows.shift() };
    state.handle = { select: () => chain };
    expect(await socialReviewFacts(id)).toMatchObject({ status: "published", remoteUrl: null, bindingMatches: false, destination: "Account binding changed · request a new approval" });
  });

  it("does not mark a variant posted if it changed state after the read", async () => {
    let whereSql = "";
    state.handle = {
      select: () => ({ from: () => ({ where: async () => [{ id, platform: "tiktok", status: "draft" }] }) }),
      update: () => ({ set: () => ({ where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        whereSql = new PgDialect({ casing: "snake_case" }).sqlToQuery(condition).sql;
        return { returning: async () => [] };
      } }) }),
    };
    expect(await markPosted(id, "https://www.tiktok.com/@owner/video/123456")).toEqual({ ok: false, error: "not_allowed" });
    expect(whereSql).toContain('"social_variants"."status"');
    expect(whereSql).toContain(" in ");
  });

  it("never logs token-bearing error details", async () => {
    const secret = "secret-social-token";
    state.logError.mockClear();
    state.handle = { select: () => { throw new Error(secret); } };
    expect(await markPosted(id)).toEqual({ ok: false, error: "failed" });
    expect(JSON.stringify(state.logError.mock.calls)).not.toContain(secret);
  });
});
