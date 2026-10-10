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

  it("treats ANTHROPIC_API_KEY as optional", () => {
    expect(parseEnv(valid).ANTHROPIC_API_KEY).toBeUndefined();
    expect(parseEnv({ ...valid, ANTHROPIC_API_KEY: "sk-ant-x" }).ANTHROPIC_API_KEY).toBe("sk-ant-x");
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

  it("treats GOOGLE_CLIENT_ID/SECRET as optional but non-empty", () => {
    expect(parseEnv(valid).GOOGLE_CLIENT_ID).toBeUndefined();
    const set = parseEnv({ ...valid, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "sec" });
    expect(set.GOOGLE_CLIENT_ID).toBe("id");
    expect(set.GOOGLE_CLIENT_SECRET).toBe("sec");
    expect(() => parseEnv({ ...valid, GOOGLE_CLIENT_ID: "" })).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it("validates OPENROUTER_FREE_MODEL ends in :free", () => {
    expect(parseEnv(valid).OPENROUTER_FREE_MODEL).toBeUndefined();
    expect(parseEnv({ ...valid, OPENROUTER_FREE_MODEL: "a/b:free" }).OPENROUTER_FREE_MODEL).toBe("a/b:free");
    expect(() => parseEnv({ ...valid, OPENROUTER_FREE_MODEL: "a/b" })).toThrow(/OPENROUTER_FREE_MODEL/);
  });
});
