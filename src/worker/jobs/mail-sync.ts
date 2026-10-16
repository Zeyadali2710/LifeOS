import { log } from "@/server/log";
import { syncMailAccounts } from "@/server/mail/sync";

// run() maps its own failures to a result; the guard keeps a bug from failing the job. Counts only in logs.
export async function handleMailSync(): Promise<void> {
  try {
    const results = await syncMailAccounts();
    log.info({ results }, "mail sync finished");
  } catch (err) {
    log.error({ err }, "mail sync failed");
  }
}
