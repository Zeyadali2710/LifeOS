import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { socialTools } from "@/server/agents/tools/socials";
import { socialPosts, socialVariants, toolCalls } from "@/server/db/schema";
import type { DB } from "@/server/db/client";
vi.mock("@/server/events", () => ({ notifyLive: vi.fn() }));

const id = "11111111-1111-4111-8111-111111111111";
const tool = socialTools["socials.save_draft"]!;
describe("agent source provenance", () => {
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
      select: () => ({ from: (table: unknown) => ({ where: () => table === toolCalls ? { limit: async () => [] } : Promise.resolve(table === socialPosts ? [{ id }] : []) }) }),
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
