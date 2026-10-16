"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { KNOWLEDGE_LIMITS, knowledgeInput } from "@/lib/knowledge";
import { db } from "./db/client";
import { auditLog, knowledgeItems } from "./db/schema";
import { setSemanticEnabled } from "./knowledge";
import { enqueue, QUEUES } from "./queue";
import { requireOwner } from "./session";

type Result = { ok: true; id?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the entered values.";
// Embedding runs in the worker; a failed enqueue is harmless because the schedule picks changes up.
const reindex = () => enqueue(QUEUES.knowledgeEmbed, {}, { singletonKey: "knowledge.embed" }).catch(() => undefined);

export async function saveKnowledgeAction(raw: unknown, id?: string): Promise<Result> {
  await requireOwner();
  const p = knowledgeInput.safeParse(raw);
  if (!p.success) return fail(firstIssue(p.error));
  if (id !== undefined && !z.uuid().safeParse(id).success) return fail("Unknown item.");
  try {
    const saved = await db().transaction(async (tx) => {
      const [row] = id
        ? await tx.update(knowledgeItems).set({ ...p.data, updatedAt: new Date() }).where(eq(knowledgeItems.id, id)).returning({ id: knowledgeItems.id })
        : await tx.insert(knowledgeItems).values({ ...p.data, source: "manual" }).returning({ id: knowledgeItems.id });
      if (!row) return null;
      await tx.insert(auditLog).values({ actor: "owner", action: id ? "knowledge.update" : "knowledge.create", target: row.id, metadata: { kind: p.data.kind } });
      return row.id;
    });
    if (!saved) return fail("This item no longer exists.");
    await reindex();
    revalidatePath("/knowledge");
    return { ok: true, id: saved };
  } catch {
    return fail("Could not save this item.");
  }
}

export async function uploadKnowledgeAction(form: FormData): Promise<Result> {
  await requireOwner();
  const file = form.get("file");
  if (!(file instanceof File) || !/\.(md|markdown|txt)$/i.test(file.name) || !file.size || file.size > KNOWLEDGE_LIMITS.uploadBytes) return fail("Choose a .md or .txt file up to 500 KB.");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()).replace(/^﻿/, "");
  } catch {
    return fail("The file isn't valid UTF-8 text.");
  }
  const heading = /^#\s+(.+)$/m.exec(text)?.[1];
  const title = (heading ?? file.name.replace(/\.[^.]+$/, "")).trim().slice(0, KNOWLEDGE_LIMITS.title) || "Untitled document";
  const p = knowledgeInput.safeParse({ kind: "document", title, body: text, tags: String(form.get("tags") ?? "").split(",") });
  if (!p.success) return fail(firstIssue(p.error));
  try {
    const [row] = await db().insert(knowledgeItems).values({ ...p.data, source: "upload" }).returning({ id: knowledgeItems.id });
    await db().insert(auditLog).values({ actor: "owner", action: "knowledge.upload", target: row!.id, metadata: { bytes: file.size } });
    await reindex();
    revalidatePath("/knowledge");
    return { ok: true, id: row!.id };
  } catch {
    return fail("Could not save this document.");
  }
}

export async function deleteKnowledgeAction(id: string): Promise<Result> {
  await requireOwner();
  if (!z.uuid().safeParse(id).success) return fail("Unknown item.");
  try {
    const gone = await db().delete(knowledgeItems).where(eq(knowledgeItems.id, id)).returning({ id: knowledgeItems.id });
    if (!gone.length) return fail("This item no longer exists.");
    await db().insert(auditLog).values({ actor: "owner", action: "knowledge.delete", target: id, metadata: {} });
    revalidatePath("/knowledge");
    return { ok: true };
  } catch {
    return fail("Could not delete this item.");
  }
}

export async function markKnowledgeViewedAction(id: string): Promise<void> {
  await requireOwner();
  if (!z.uuid().safeParse(id).success) return;
  // Not an edit: updatedAt stays, so viewing never reorders "recently updated".
  await db().update(knowledgeItems).set({ viewedAt: new Date(), updatedAt: sql`${knowledgeItems.updatedAt}` }).where(eq(knowledgeItems.id, id));
}

export async function setKnowledgeSemanticAction(on: boolean): Promise<Result> {
  await requireOwner();
  if (typeof on !== "boolean") return fail("Invalid setting.");
  await setSemanticEnabled(db(), on);
  await db().insert(auditLog).values({ actor: "owner", action: "knowledge.semantic", metadata: { enabled: on } });
  if (on) await reindex();
  revalidatePath("/knowledge");
  return { ok: true };
}
