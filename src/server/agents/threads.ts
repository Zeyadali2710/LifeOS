import { desc, eq, sql } from "drizzle-orm";
import type { ThreadDTO } from "@/lib/agent-types";
import { db, type DB } from "../db/client";
import { threadMessages, threads } from "../db/schema";

export async function createThread(handle: DB = db(), firstMessage: string): Promise<string> {
  const [t] = await handle.insert(threads).values({ title: firstMessage.trim().slice(0, 48) }).returning({ id: threads.id });
  return t!.id;
}

export async function appendMessage(handle: DB = db(), threadId: string, role: "user" | "assistant", content: string, runId?: string) {
  await handle.insert(threadMessages).values({ threadId, role, content, runId });
  await handle.update(threads).set({ updatedAt: new Date() }).where(eq(threads.id, threadId));
}

export async function threadHistory(handle: DB = db(), threadId: string, limit = 20) {
  const rows = await handle
    .select({ role: threadMessages.role, content: threadMessages.content })
    .from(threadMessages)
    .where(eq(threadMessages.threadId, threadId))
    .orderBy(desc(threadMessages.createdAt), desc(threadMessages.id))
    .limit(limit);
  return rows.reverse() as { role: "user" | "assistant"; content: string }[];
}

export async function listThreads(handle: DB = db(), limit = 20): Promise<ThreadDTO[]> {
  const rows = await handle
    .select({
      id: threads.id,
      title: threads.title,
      updatedAt: threads.updatedAt,
      messageCount: sql<number>`(select count(*)::int from thread_messages m where m.thread_id = threads.id)`,
    })
    .from(threads)
    .orderBy(desc(threads.updatedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}
