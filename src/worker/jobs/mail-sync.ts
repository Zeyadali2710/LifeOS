import { log } from "@/server/log";
import { createMailSync } from "@/server/mail/sync";

// run() maps its own failures to a result; the guard keeps a bug from failing the job. Counts only in logs.
export async function handleMailSync(): Promise<void> {
  try {
    const r = await createMailSync().run();
    log.info({ result: "ok" in r ? { added: r.added, changed: r.changed } : r }, "mail sync finished");
  } catch (err) {
    log.error({ err }, "mail sync failed");
  }
}
