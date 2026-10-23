"use server";

import { z } from "zod";
import { writableCalendars } from "./calendar/queries";
import { db } from "./db/client";
import { auditLog, settings } from "./db/schema";
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
  return { ok: true };
}
