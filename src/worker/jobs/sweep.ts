import { db } from "../../server/db/client";
import { log } from "../../server/log";
import { sweepOrphans } from "../../server/agents/runs";

export async function handleSweep(): Promise<void> {
  try {
    const n = await sweepOrphans(db(), new Date());
    if (n) log.warn({ n }, "swept orphaned agent runs");
  } catch (err) {
    log.error({ err }, "orphan sweep failed");
  }
}
