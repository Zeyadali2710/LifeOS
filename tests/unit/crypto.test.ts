import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/server/crypto";

const key = randomBytes(32);

describe("crypto", () => {
  it("round-trips", () => {
    const secret = "gho_example-token ✓";
    expect(decrypt(encrypt(secret, key), key)).toBe(secret);
  });

  it("uses a fresh IV each time", () => {
    expect(encrypt("same", key)).not.toBe(encrypt("same", key));
  });

  it("rejects tampered ciphertext", () => {
    const parts = encrypt("secret", key).split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."), key)).toThrow();
  });

  it("rejects the wrong key", () => {
    expect(() => decrypt(encrypt("secret", key), randomBytes(32))).toThrow();
  });

  it("rejects unknown formats", () => {
    expect(() => decrypt("plaintext", key)).toThrow(/format/);
  });
});
