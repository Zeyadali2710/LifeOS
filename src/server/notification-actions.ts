"use server";

import { z } from "zod";
import { db } from "./db/client";
import { log } from "./log";
import { dismissOne, readAll, setRead, snoozeUntil } from "./notifications";
import { requireOwner } from "./session";

type Result = Promise<{ ok: boolean }>;
const id = z.uuid();
const MAX_SNOOZE_MS = 30 * 24 * 3_600_000;

async function run(fn: () => Promise<boolean>): Result {
  try {
    return { ok: await fn() };
  } catch (err) {
    log.error({ err }, "notification action failed");
    return { ok: false };
  }
}

export async function markRead(rawId: string, read: boolean): Result {
  await requireOwner();
  const p = z.tuple([id, z.boolean()]).safeParse([rawId, read]);
  if (!p.success) return { ok: false };
  return run(() => setRead(db(), p.data[0], p.data[1]));
}

export async function markAllRead(): Result {
  await requireOwner();
  return run(() => readAll(db()));
}

export async function snooze(rawId: string, untilIso: string): Result {
  await requireOwner();
  const p = z.tuple([id, z.iso.datetime()]).safeParse([rawId, untilIso]);
  if (!p.success) return { ok: false };
  const until = new Date(p.data[1]);
  const now = Date.now();
  if (until.getTime() <= now || until.getTime() > now + MAX_SNOOZE_MS) return { ok: false };
  return run(() => snoozeUntil(db(), p.data[0], until));
}

export async function dismiss(rawId: string): Result {
  await requireOwner();
  const p = id.safeParse(rawId);
  if (!p.success) return { ok: false };
  return run(() => dismissOne(db(), p.data));
}
