import { expect, it, vi } from "vitest";
import type { DB } from "@/server/db/client";
import { connections, socialAccountSnapshots } from "@/server/db/schema";
import { saveTikTokTokens, removeSocialConnection } from "@/server/socials/connections";
vi.mock("@/server/events", () => ({ notifyLive: vi.fn() }));

it("keeps same-account history and clears it on identity changes and disconnect", async () => {
  let login: string | null = "A";
  let snapshots = [12];
  const deleted: unknown[] = [];
  const h = {
    select: () => ({ from: () => ({ where: () => ({ for: async () => login ? [{ login }] : [] }) }) }),
    insert: (table: unknown) => ({ values: (value: { login?: string }) => ({ onConflictDoUpdate: async () => { if (table === connections) login = value.login!; } }) }),
    delete: (table: unknown) => ({ where: async () => { deleted.push(table); if (table === socialAccountSnapshots) snapshots = []; } }),
    transaction: async (fn: (handle: unknown) => unknown) => fn(h),
  } as unknown as DB;
  const tokens = { accessToken: "access", refreshToken: "refresh", openId: "A", scopes: [], expiresAt: new Date("2030-01-01"), refreshExpiresAt: new Date("2031-01-01") };
  const opts = { key: Buffer.alloc(32, 7) };
  await saveTikTokTokens(h, tokens, opts); expect(snapshots).toEqual([12]);
  await saveTikTokTokens(h, { ...tokens, openId: "B" }, opts); expect(snapshots).toEqual([]);
  snapshots = [7]; await removeSocialConnection(h, "tiktok_app"); expect(snapshots).toEqual([]);
  expect(deleted).toContain(connections);
});
