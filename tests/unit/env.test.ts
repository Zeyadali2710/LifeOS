import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/server/env";

const valid = {
  DATABASE_URL: "postgres://u:p@localhost:5433/lifeos",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  LIFEOS_MASTER_KEY: randomBytes(32).toString("base64"),
};

describe("env", () => {
  it("accepts a valid environment and applies defaults", () => {
    const env = parseEnv(valid);
    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("names every invalid variable", () => {
    const run = () => parseEnv({ ...valid, BETTER_AUTH_SECRET: "short", LIFEOS_MASTER_KEY: "abc", DATABASE_URL: undefined });
    expect(run).toThrow(/BETTER_AUTH_SECRET/);
    expect(run).toThrow(/LIFEOS_MASTER_KEY/);
    expect(run).toThrow(/DATABASE_URL/);
  });

  it("rejects non-postgres database URLs", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://u:p@h/db" })).toThrow(/DATABASE_URL/);
  });
});
