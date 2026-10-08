import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCap } from "@/server/agents/spend";
import { connections } from "@/server/db/schema";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
vi.mock("@/server/db/client", async (orig) => ({ ...(await orig<object>()), db: () => t.handle() }));
let denied = false;
vi.mock("@/server/session", () => ({
  requireOwner: async () => {
    if (denied) throw new Error("redirect");
  },
}));
const enqueue = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/server/queue", () => ({ enqueue: (...a: unknown[]) => enqueue(...a), QUEUES: { githubSync: "github.sync" } }));
const saveToken = vi.fn();
vi.mock("@/server/github/connections", async (orig) => ({ ...(await orig<object>()), saveToken: (...a: unknown[]) => saveToken(...a) }));

import { removeTokenAction, saveTokenAction, setSpendCapAction, syncNowAction } from "@/server/settings-actions";

const seed = (id: "github_read" | "github_write") =>
  t.handle().insert(connections).values({ id, ciphertext: "x", last4: "abcd", login: "me", status: "connected", repos: ["a/b"] });

beforeEach(async () => {
  denied = false;
  enqueue.mockClear();
  saveToken.mockReset();
  await t.handle().delete(connections);
});

describe("settings actions", () => {
  it("reject without owner", async () => {
    denied = true;
    const rej = (p: Promise<unknown>) => p.then(() => "ok", (e: Error) => e.message);
    expect(await rej(saveTokenAction("github_read", "tok"))).toBe("redirect");
    expect(await rej(removeTokenAction("github_read"))).toBe("redirect");
    expect(await rej(syncNowAction())).toBe("redirect");
    expect(await rej(setSpendCapAction(40))).toBe("redirect");
    expect(saveToken).not.toHaveBeenCalled();
    expect(await getCap(t.handle())).toBe(20);
  });

  it("validates token input and never returns the token", async () => {
    expect(await saveTokenAction("github_read", "")).toEqual({ ok: false, error: "empty" });
    expect(await saveTokenAction("nope", "tok")).toEqual({ ok: false, error: "invalid" });
    saveToken.mockResolvedValue({ ok: true, login: "me", repos: 3, expiresAt: null });
    const r = await saveTokenAction("github_read", "ghp_secret");
    expect(r).toEqual({ ok: true, login: "me", repos: 3 });
    expect(JSON.stringify(r)).not.toContain("ghp_secret");
  });

  it("validates cap", async () => {
    for (const n of [0, 1001, 12.5]) expect((await setSpendCapAction(n)).ok).toBe(false);
    expect(await setSpendCapAction(40)).toEqual({ ok: true });
    expect(await getCap(t.handle())).toBe(40);
  });

  it("sync enqueues only with a read connection; remove works", async () => {
    expect((await syncNowAction()).ok).toBe(false);
    await seed("github_read");
    expect((await syncNowAction()).ok).toBe(true);
    expect(enqueue).toHaveBeenCalledWith("github.sync", {}, { singletonKey: "github.sync" });
    await seed("github_write");
    expect(await removeTokenAction("github_write")).toEqual({ ok: true });
  });
});
