"use server";

import { z } from "zod";
import { writableCalendars } from "./calendar/queries";
import { db } from "./db/client";
import { auditLog, settings } from "./db/schema";
import { log } from "./log";
import { enqueue, QUEUES } from "./queue";
import { ROSTER_CONFIG_KEY, rosterConfigInput } from "./roster/apply";
import { requireOwner } from "./session";

export async function saveRosterConfigAction(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireOwner();
  const p = rosterConfigInput.extend({ sender: z.email("Enter the sender's email address.").max(200) }).safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the roster settings." };
  const cfg = { ...p.data, sender: p.data.sender.trim().toLowerCase() };
  const h = db();
  if (cfg.enabled && !(cfg.calendarId && (await writableCalendars(h)).some((c) => c.id === cfg.calendarId))) return { ok: false, error: "Choose a calendar LifeOS can write to." };
  await h.transaction(async (tx) => {
    await tx.insert(settings).values({ key: ROSTER_CONFIG_KEY, value: cfg }).onConflictDoUpdate({ target: settings.key, set: { value: cfg, updatedAt: new Date() } });
    await tx.insert(auditLog).values({ actor: "owner", action: "roster.config", metadata: { enabled: cfg.enabled, calendarId: cfg.calendarId } });
  });
  // Turning the rule on catches up on recent roster emails straight away instead of waiting for new mail.
  if (cfg.enabled) await enqueue(QUEUES.mailTriage, {}, { singletonKey: "mail.triage" }).catch((err) => log.error({ err }, "roster catch-up enqueue failed"));
  return { ok: true };
}
