import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

export function createDb(url: string, max = 10): { db: DB; pool: Pool } {
  const pool = new Pool({ connectionString: url, max });
  return { db: drizzle({ client: pool, schema, casing: "snake_case" }), pool };
}

let instance: ReturnType<typeof createDb> | undefined;

// Lazy: no connection (or env access) until first use.
export function db(): DB {
  return (instance ??= createDb(env().DATABASE_URL)).db;
}
