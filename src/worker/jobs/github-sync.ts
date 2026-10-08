import { createSync } from "@/server/github/sync";
import { log } from "@/server/log";

// run() never throws; log counts only (no repo/PR data). Queue registration lives in the worker entrypoint.
export async function handleGithubSync(): Promise<void> {
  const r = await createSync({ fetch: globalThis.fetch }).run();
  log.info({ result: "ok" in r ? "ok" : "skipped" in r ? r.skipped : r.error, repos: "ok" in r ? r.repos : 0, events: "ok" in r ? r.events : 0 }, "github sync finished");
}
