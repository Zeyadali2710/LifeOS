import { randomBytes } from "node:crypto";
import { Client, type Pool } from "pg";
import { afterAll, beforeAll } from "vitest";
import { createDb, type DB } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://lifeos:lifeos@localhost:5433/postgres";

async function admin(sql: string) {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

// Throwaway migrated database per test file.
export function setupTestDb(): { url: () => string; handle: () => DB; pool: () => Pool } {
  const name = `lifeos_test_${randomBytes(4).toString("hex")}`;
  const testUrl = Object.assign(new URL(ADMIN_URL), { pathname: `/${name}` }).toString();
  let conn: ReturnType<typeof createDb>;
  beforeAll(async () => {
    await admin(`create database ${name}`);
    await runMigrations(testUrl);
    conn = createDb(testUrl, 3);
  });
  afterAll(async () => {
    await conn?.pool.end().catch(() => {});
    await admin(`drop database if exists ${name} with (force)`);
  });
  return { url: () => testUrl, handle: () => conn.db, pool: () => conn.pool };
}
