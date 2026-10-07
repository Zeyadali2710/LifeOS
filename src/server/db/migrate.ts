import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client";

export async function runMigrations(url: string): Promise<void> {
  const { db, pool } = createDb(url, 1);
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
  } finally {
    await pool.end();
  }
}
