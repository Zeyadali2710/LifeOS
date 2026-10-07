import { db } from "./db/client";
import { auditLog } from "./db/schema";
import { log } from "./log";

type AuditEntry = {
  actor: string;
  action: string;
  target?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown>;
};

// Audit writes must never break the action being audited; failures are logged loudly instead.
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db().insert(auditLog).values(entry);
  } catch (err) {
    log.error({ err, action: entry.action }, "audit write failed");
  }
}
