"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BRIEFING_KINDS, periodKey, type BriefingKind, type BriefingSchedule } from "@/lib/digest";
import { generateBriefing, getBriefing, saveSchedule, scheduleInput } from "./briefings";
import { db, type DB } from "./db/client";
import { auditLog, briefings } from "./db/schema";
import { sydneyYmd } from "@/lib/project-rules";
import { requireOwner } from "./session";

export async function saveBriefingScheduleAction(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireOwner();
  const p = scheduleInput.safeParse(raw);
  if (!p.success) return { ok: false, error: "Use 24-hour times like 07:00." };
  await db().transaction(async (tx) => {
    await saveSchedule(tx as unknown as DB, p.data as BriefingSchedule);
    await tx.insert(auditLog).values({ actor: "owner", action: "briefings.schedule", metadata: Object.fromEntries(BRIEFING_KINDS.map((k) => [k, p.data[k].on])) });
  });
  revalidatePath("/settings");
  return { ok: true };
}

/** Builds the current period's briefing of `kind` now (or returns the one that already exists). */
export async function briefingNowAction(kind: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireOwner();
  if (!BRIEFING_KINDS.includes(kind as BriefingKind)) return { ok: false, error: "Unknown briefing." };
  const now = new Date();
  const k = kind as BriefingKind;
  const id = await generateBriefing(db(), k, now).catch(() => null)
    ?? (await db().select({ id: briefings.id }).from(briefings).where(and(eq(briefings.kind, k), eq(briefings.period, periodKey(k, sydneyYmd(now))))))[0]?.id;
  if (!id) return { ok: false, error: "Could not build the briefing. Try again." };
  revalidatePath("/briefings");
  return { ok: true, id };
}

export async function markBriefingReadAction(id: string): Promise<void> {
  await requireOwner();
  if (!z.uuid().safeParse(id).success || !(await getBriefing(db(), id))) return;
  await db().update(briefings).set({ readAt: new Date() }).where(and(eq(briefings.id, id), isNull(briefings.readAt)));
}
