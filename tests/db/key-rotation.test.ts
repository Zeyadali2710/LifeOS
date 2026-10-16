import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/server/crypto";
import { auditLog, connections, eventSources } from "@/server/db/schema";
import { parseKey, rotateMasterKey } from "@/server/key-rotation";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const h = () => t.handle();
const oldKey = randomBytes(32), newKey = randomBytes(32);

beforeEach(async () => {
  await h().delete(connections);
  await h().delete(eventSources);
  await h().insert(connections).values([
    { id: "github_read", ciphertext: encrypt("ghp_secret", oldKey), last4: "cret", status: "connected" },
    { id: "openrouter", ciphertext: encrypt("sk-or-123", oldKey), last4: "-123", status: "connected" },
  ]);
  await h().insert(eventSources).values({ kind: "ics", label: "Luma", urlCiphertext: encrypt("https://luma.example/ics?token=abc", oldKey), host: "luma.example" });
});

describe("master key rotation", () => {
  it("re-encrypts every secret, verifies, and audits", async () => {
    expect(await rotateMasterKey(h(), oldKey, newKey)).toEqual({ connections: 2, eventSources: 1 });
    const rows = await h().select().from(connections);
    expect(rows.map((r) => decrypt(r.ciphertext, newKey)).sort()).toEqual(["ghp_secret", "sk-or-123"]);
    expect(() => decrypt(rows[0]!.ciphertext, oldKey)).toThrow();
    expect(decrypt((await h().select().from(eventSources))[0]!.urlCiphertext!, newKey)).toBe("https://luma.example/ics?token=abc");
    expect((await h().select().from(auditLog)).some((a) => a.action === "crypto.master_key_rotated")).toBe(true);
  });

  it("dry run writes nothing; a wrong current key changes nothing", async () => {
    const before = await h().select().from(connections);
    expect(await rotateMasterKey(h(), oldKey, newKey, { dryRun: true })).toEqual({ connections: 2, eventSources: 1 });
    expect(await h().select().from(connections)).toEqual(before);
    await expect(rotateMasterKey(h(), randomBytes(32), newKey)).rejects.toThrow(/does not decrypt with the current key/);
    expect(await h().select().from(connections)).toEqual(before);
    await expect(rotateMasterKey(h(), oldKey, oldKey)).rejects.toThrow(/same/);
  });

  it("is all-or-nothing when one secret is already under another key", async () => {
    await h().insert(connections).values({ id: "github_write", ciphertext: encrypt("ghp_other", randomBytes(32)), last4: "ther", status: "connected" });
    const before = await h().select().from(connections);
    await expect(rotateMasterKey(h(), oldKey, newKey)).rejects.toThrow(/github_write/);
    expect(await h().select().from(connections)).toEqual(before);
  });

  it("validates key format", () => {
    expect(() => parseKey("short", "K")).toThrow(/32 bytes/);
    expect(parseKey(randomBytes(32).toString("base64"), "K")).toHaveLength(32);
  });
});
