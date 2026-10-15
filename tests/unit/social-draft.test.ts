import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { saveDraft as tool } from "@/server/agents/tools/socials";
import { socialPosts, socialVariants, toolCalls } from "@/server/db/schema";
import type { DB } from "@/server/db/client";
import { TERMINAL_CONTAINER_ERROR } from "@/server/socials/drafts";
vi.mock("@/server/events", () => ({ notifyLive: vi.fn() }));

const id = "11111111-1111-4111-8111-111111111111";
describe("agent source provenance", () => {
  it.each([false, true])("redrafts only resolved failed containers (resolved=%s)", async (resolved) => {
    let changed: Record<string, unknown> | null = null;
    const existing = { id, status: "failed", remoteId: null, containerId: "old", approvedTextHash: "hash", approvalId: id, lastError: resolved ? TERMINAL_CONTAINER_ERROR : "may have posted", updatedAt: new Date() };
    const tx = {
      select: () => ({ from: (table: unknown) => ({ where: () => table === toolCalls ? { limit: async () => [] } : table === socialPosts ? { for: async () => [{ id }] } : Promise.resolve([existing]) }) }),
      update: (table: unknown) => ({ set: (value: Record<string, unknown>) => ({ where: () => {
        if (table !== socialVariants) return Promise.resolve();
        changed = value; return { returning: async () => [{ id }] };
      } }) }),
    };
    const h = { transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } as unknown as DB;
    const saving = tool.handler(tool.input.parse({ postId: id, title: "Post", body: "Body", variants: [{ platform: "instagram", text: "New caption", imageUrl: "https://example.com/new.jpg" }] }), { handle: h, runId: id, agentId: "social", toolUseId: "save", now: () => new Date() });
    if (resolved) {
      await saving;
      expect(changed).toMatchObject({ containerId: null, remoteId: null, approvedTextHash: null, approvalId: null, text: "New caption" });
    } else { await expect(saving).rejects.toThrow("owner must reconcile"); expect(changed).toBeNull(); }
  });
  it("rejects a lost variant update race so the surrounding transaction rolls back", async () => {
    let predicate: { sql: string; params: unknown[] } | undefined;
    const stamp = new Date("2026-10-15T00:00:00Z");
    const tx = {
      select: () => ({ from: (table: unknown) => ({ where: () => table === toolCalls ? { limit: async () => [] } : table === socialPosts ? { for: async () => [{ id }] } : Promise.resolve([{ id, status: "draft", approvalId: null, updatedAt: stamp }]) }) }),
      update: (table: unknown) => ({ set: () => ({ where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        if (table === socialVariants) predicate = new PgDialect({ casing: "snake_case" }).sqlToQuery(condition);
        return table === socialVariants ? { returning: async () => [] } : Promise.resolve();
      } }) }),
    };
    const h = { transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } as unknown as DB;
    await expect(tool.handler(tool.input.parse({ postId: id, title: "Post", body: "Body", variants: [{ platform: "linkedin", text: "Changed" }] }), { handle: h, runId: id, agentId: "social", toolUseId: "save", now: () => stamp })).rejects.toThrow("changed");
    expect(predicate!.sql).toContain('"status"'); expect(predicate!.sql).toContain('"updated_at"');
    expect(predicate!.sql).toContain("is not distinct from"); expect(predicate!.params).toContain("draft");
  });
  it.each([false, true])("derives new draft taint from recorded content reads (%s)", async (read) => {
    let saved: Record<string, unknown> = {};
    const tx = {
      select: () => ({ from: (table: unknown) => ({ where: () => table === toolCalls ? { limit: async () => read ? [{ id }] : [] } : Promise.resolve([]) }) }),
      insert: (table: unknown) => ({ values: (value: Record<string, unknown>) => {
        if (table === socialPosts) saved = value;
        return table === socialVariants ? Promise.resolve() : { returning: async () => [{ id }] };
      } }),
    };
    const h = { transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } as unknown as DB;
    await tool.handler(tool.input.parse({ title: "Post", body: "Source text", variants: [{ platform: "linkedin", text: "Caption" }] }), { handle: h, runId: id, agentId: "social", toolUseId: "draft", now: () => new Date() });
    expect(saved.draftedFromContent).toBe(read);
  });

  it("preserves existing taint when the current run has no content read", async () => {
    let saved: Record<string, unknown> = {};
    const tx = {
      select: () => ({ from: (table: unknown) => ({ where: () => table === toolCalls ? { limit: async () => [] } : table === socialPosts ? { for: async () => [{ id }] } : Promise.resolve([]) }) }),
      update: () => ({ set: (value: Record<string, unknown>) => { saved = value; return { where: async () => undefined }; } }),
      insert: () => ({ values: async () => undefined }),
    };
    const h = { transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } as unknown as DB;
    await tool.handler(tool.input.parse({ postId: id, title: "Post", body: "Revised", variants: [{ platform: "linkedin", text: "Caption" }] }), { handle: h, runId: id, agentId: "social", toolUseId: "draft", now: () => new Date() });
    const query = new PgDialect({ casing: "snake_case" }).sqlToQuery(saved.draftedFromContent as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(query.sql).toContain('"social_posts"."drafted_from_content" or');
    expect(query.params).toEqual([false]);
  });
});
