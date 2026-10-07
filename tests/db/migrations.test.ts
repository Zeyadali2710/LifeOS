import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "@/server/db/migrate";

// Needs Postgres: `docker compose -f docker/compose.dev.yml up -d`.
const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://lifeos:lifeos@localhost:5433/postgres";
const dbName = `lifeos_test_${randomBytes(4).toString("hex")}`;
const testUrl = Object.assign(new URL(ADMIN_URL), { pathname: `/${dbName}` }).toString();

async function admin(sql: string) {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

describe("migrations", () => {
  beforeAll(() => admin(`create database ${dbName}`));
  afterAll(() => admin(`drop database if exists ${dbName} with (force)`));

  it("apply cleanly to an empty database and are idempotent", async () => {
    await runMigrations(testUrl);
    await runMigrations(testUrl);

    const client = new Client({ connectionString: testUrl });
    await client.connect();
    const { rows } = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1",
    );
    await client.end();

    expect(rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining(["users", "sessions", "accounts", "verifications", "rate_limits", "audit_log", "settings", "activity_events", "notifications"]),
    );
  });
});
