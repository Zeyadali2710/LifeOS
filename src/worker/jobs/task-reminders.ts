import { db } from "../../server/db/client";
import { log } from "../../server/log";
import { fireDueReminders } from "../../server/tasks";

export async function handleTaskReminders(): Promise<void> {
  try {
    const fired = await fireDueReminders(db(), new Date());
    if (fired) log.info({ fired }, "task reminders fired"); // counts only, never titles
  } catch (err) {
    log.error({ err }, "task reminders failed");
  }
}
