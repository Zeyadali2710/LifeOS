import { providerFor } from "@/server/calendar/providers";
import { createCalendarSync } from "@/server/calendar/sync";
import { log } from "@/server/log";

// run() is designed not to throw, but construction and result mapping are guarded too so a bug never fails the job (IN-C05).
// Log outcome keys and counts only (no event titles).
export async function handleCalendarSync(): Promise<void> {
  try {
    const r = await createCalendarSync({ providerFor: (id, h) => providerFor(id, h) }).run();
    const result = Object.fromEntries(
      Object.entries(r).map(([id, v]) => [id, "ok" in v ? { ok: true, changed: v.changed, calendars: v.calendars } : "skipped" in v ? { skipped: v.skipped } : { error: v.error }]),
    );
    log.info({ result }, "calendar sync finished");
  } catch (err) {
    log.error({ err }, "calendar sync failed");
  }
}
