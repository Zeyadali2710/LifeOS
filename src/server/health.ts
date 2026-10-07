import { eq, sql } from "drizzle-orm";
import { db } from "./db/client";
import { settings } from "./db/schema";

export const HEARTBEAT_KEY = "worker.heartbeat";
const STALE_AFTER_MS = 3 * 60_000;

export type Health = {
  status: "ok" | "degraded" | "down";
  db: "ok" | "down";
  worker: "ok" | "stale" | "unknown";
  version: string;
};

export async function checkHealth(now = Date.now()): Promise<Health> {
  const version = process.env.LIFEOS_VERSION ?? "dev";
  try {
    await db().execute(sql`select 1`);
  } catch {
    return { status: "down", db: "down", worker: "unknown", version };
  }
  const [row] = await db().select({ value: settings.value }).from(settings).where(eq(settings.key, HEARTBEAT_KEY));
  const beat = typeof row?.value === "string" ? Date.parse(row.value) : NaN;
  const worker = Number.isNaN(beat) ? "unknown" : now - beat > STALE_AFTER_MS ? "stale" : "ok";
  return { status: worker === "ok" ? "ok" : "degraded", db: "ok", worker, version };
}
