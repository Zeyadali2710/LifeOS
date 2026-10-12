import { log } from "@/server/log";
import { createOutreachSync } from "@/server/outreach/sync";

// run() never throws; guarded anyway so a bug never fails the job. Logs counts only (no titles or URLs).
export async function handleOutreachSync(): Promise<void> {
  try {
    log.info({ result: await createOutreachSync().run() }, "outreach sync finished");
  } catch (err) {
    log.error({ err }, "outreach sync failed");
  }
}
