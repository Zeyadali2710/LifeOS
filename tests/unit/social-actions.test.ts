import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({ handle: null as unknown, logError: vi.fn() }));
vi.mock("@/server/session", () => ({ requireOwner: async () => ({ user: { id: "owner" } }) }));
vi.mock("@/server/db/client", () => ({ db: () => state.handle }));
vi.mock("@/server/log", () => ({ log: { error: state.logError } }));

import { markPosted } from "@/server/socials-actions";

describe("social owner action guards", () => {
  const id = "11111111-1111-4111-8111-111111111111";

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
