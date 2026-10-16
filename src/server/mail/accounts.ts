import { isGoogleConnection } from "@/lib/google-accounts";
import type { DB } from "../db/client";
import { connections } from "../db/schema";
import { gmailAllowed } from "./client";
import { mailSyncState } from "./sync";

export async function mailAccounts(h: DB) {
  const rows = await h.select({ id: connections.id, email: connections.login, status: connections.status, scopes: connections.scopes }).from(connections);
  return Promise.all(rows.filter((c) => isGoogleConnection(c.id)).map(async (c) => ({
    ...await mailSyncState(h, c.id),
    id: c.id, email: c.email, status: c.status,
    read: gmailAllowed(c.scopes, "read"), compose: gmailAllowed(c.scopes, "compose"),
  })));
}
