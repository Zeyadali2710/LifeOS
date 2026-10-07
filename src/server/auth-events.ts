import { and, eq, gt, isNull } from "drizzle-orm";
import { db, type DB } from "./db/client";
import { notifications } from "./db/schema";
import { emitActivity } from "./events";
import { log } from "./log";
import { formatHM } from "./time";

export type AuthEventKind = "sign_in" | "sign_out" | "sign_in_failed";

const FAILED_TITLE = "Failed sign-in attempt";
const THROTTLE_MS = 10 * 60_000;

// Fixed copy only: email/IP/UA stay in audit_log (D-10).
export async function emitAuthEvent(kind: AuthEventKind, handle: DB = db(), now = new Date()): Promise<void> {
  try {
    if (kind === "sign_in") {
      await emitActivity({ type: "auth.sign_in", source: "auth", title: "Signed in", detail: "Owner session" }, undefined, handle);
    } else if (kind === "sign_out") {
      await emitActivity({ type: "auth.sign_out", source: "auth", title: "Signed out", detail: "Owner session" }, undefined, handle);
    } else {
      const [recent] = await handle
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.source, "auth"),
            eq(notifications.title, FAILED_TITLE),
            isNull(notifications.dismissedAt),
            gt(notifications.createdAt, new Date(now.getTime() - THROTTLE_MS)),
          ),
        )
        .limit(1);
      await emitActivity(
        { type: "auth.sign_in_failed", source: "auth", title: FAILED_TITLE, detail: "Credentials rejected", tone: "red" },
        recent
          ? undefined
          : {
              category: "URGENT",
              title: FAILED_TITLE,
              body: `Someone entered the wrong credentials at ${formatHM(now)}. If it wasn't you, change your password.`,
            },
        handle,
      );
    }
  } catch (err) {
    log.error({ err, kind }, "emitAuthEvent failed");
  }
}
