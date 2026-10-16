"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { automationInput } from "@/lib/automations";
import { db } from "./db/client";
import { auditLog, automations } from "./db/schema";
import { requireOwner } from "./session";

type Result = { ok: true; id?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const uuid = z.uuid();

export async function saveAutomationAction(raw: unknown, id?: string): Promise<Result> {
  await requireOwner();
  const p = automationInput.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Check the automation.");
  if (id !== undefined && !uuid.safeParse(id).success) return fail("Unknown automation.");
  const saved = await db().transaction(async (tx) => {
    const now = new Date();
    let row: { id: string } | undefined;
    if (id) {
      const [cur] = await tx.select({ enabled: automations.enabled, trigger: automations.trigger }).from(automations).where(eq(automations.id, id)).for("update");
      if (!cur) return null;
      // Re-enabling or changing the trigger starts from now: no replay of events from before the change.
      const restart = (p.data.enabled && !cur.enabled) || JSON.stringify(cur.trigger) !== JSON.stringify(p.data.trigger);
      [row] = await tx.update(automations).set({ ...p.data, enabledAt: restart ? now : undefined, updatedAt: now }).where(eq(automations.id, id)).returning({ id: automations.id });
    } else {
      [row] = await tx.insert(automations).values({ ...p.data, enabledAt: now }).returning({ id: automations.id });
    }
    await tx.insert(auditLog).values({ actor: "owner", action: id ? "automation.update" : "automation.create", target: row!.id, metadata: { enabled: p.data.enabled, trigger: p.data.trigger.type, actions: p.data.actions.map((a) => a.type) } });
    return row!.id;
  });
  if (!saved) return fail("This automation no longer exists.");
  revalidatePath("/automations");
  return { ok: true, id: saved };
}

export async function setAutomationEnabledAction(id: string, enabled: boolean): Promise<Result> {
  await requireOwner();
  if (!uuid.safeParse(id).success || typeof enabled !== "boolean") return fail("Unknown automation.");
  const ok = await db().transaction(async (tx) => {
    const [cur] = await tx.select({ enabled: automations.enabled }).from(automations).where(eq(automations.id, id)).for("update");
    if (!cur) return false;
    await tx.update(automations).set({ enabled, enabledAt: enabled && !cur.enabled ? new Date() : undefined, updatedAt: new Date() }).where(eq(automations.id, id));
    await tx.insert(auditLog).values({ actor: "owner", action: enabled ? "automation.enable" : "automation.disable", target: id, metadata: {} });
    return true;
  });
  if (!ok) return fail("This automation no longer exists.");
  revalidatePath("/automations");
  return { ok: true };
}

export async function deleteAutomationAction(id: string): Promise<Result> {
  await requireOwner();
  if (!uuid.safeParse(id).success) return fail("Unknown automation.");
  const gone = await db().transaction(async (tx) => {
    const del = await tx.delete(automations).where(eq(automations.id, id)).returning({ id: automations.id });
    if (del.length) await tx.insert(auditLog).values({ actor: "owner", action: "automation.delete", target: id, metadata: {} });
    return del.length > 0;
  });
  if (!gone) return fail("This automation no longer exists.");
  revalidatePath("/automations");
  return { ok: true };
}
