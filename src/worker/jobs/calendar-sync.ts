import { providerFor } from "@/server/calendar/providers";
import { createCalendarSync } from "@/server/calendar/sync";
import { log } from "@/server/log";

// run() never throws; log outcome keys and counts only (no event titles).
export async function handleCalendarSync(): Promise<void> {
  const r = await createCalendarSync({ providerFor: (id, h) => providerFor(id, h) }).run();
  const result = Object.fromEntries(
    Object.entries(r).map(([id, v]) => [id, "ok" in v ? { ok: true, changed: v.changed, calendars: v.calendars } : "skipped" in v ? { skipped: v.skipped } : { error: v.error }]),
  );
  log.info({ result }, "calendar sync finished");
}
