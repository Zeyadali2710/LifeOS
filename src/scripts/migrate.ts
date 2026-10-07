import { Client } from "pg";
import { createDb } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { env } from "@/server/env";
import { emitActivity } from "@/server/events";
import { log } from "@/server/log";

async function appliedCount(url: string): Promise<number> {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const r = await c.query("select count(*)::int as n from drizzle.__drizzle_migrations");
    return r.rows[0].n as number;
  } catch (err) {
    if ((err as { code?: string }).code === "42P01" || (err as { code?: string }).code === "3F000") return 0; // no table/schema yet
    throw err;
  } finally {
    await c.end();
  }
}

async function main() {
  const url = env().DATABASE_URL;
  const before = await appliedCount(url);
  await runMigrations(url);
  log.info("migrations applied");
  const delta = (await appliedCount(url)) - before;
  if (delta > 0) {
    // Short-lived pool: the lazy db() pool would keep the process alive.
    const { db: handle, pool } = createDb(url, 1);
    try {
      await emitActivity({ type: "system.migrations_applied", source: "system", title: "Migrations applied", detail: `${delta} new` }, undefined, handle);
    } finally {
      await pool.end();
    }
  }
}

main().catch((err) => {
  log.fatal({ err }, "migration failed");
  process.exit(1);
});
