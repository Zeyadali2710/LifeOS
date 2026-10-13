"use server";

import { z } from "zod";
import { db } from "./db/client";
import { log } from "./log";
import { removeEventKey, saveEventKey } from "./outreach/connections";
import { addFeed, importEventUrl, removeFeed, saveEventbriteOrganizers, saveInterests, setFeedEnabled } from "./outreach/sources";
import { enqueue, QUEUES } from "./queue";
import { requireOwner } from "./session";

const uuid = z.uuid();
const keyId = z.enum(["eventbrite", "luma"]);
const FAILED = { ok: false, error: "failed" } as const;
const INVALID = { ok: false, error: "invalid" } as const;
const sync = () => enqueue(QUEUES.eventsSync, {}, { singletonKey: "outreach.events.sync" }).catch(() => undefined);

// Never log URLs, keys, labels or interests: only the error object.
async function run<T>(fn: () => Promise<T>): Promise<T | typeof FAILED> {
  try {
    return await fn();
  } catch (err) {
    log.error({ err }, "outreach action failed");
    return FAILED;
  }
}

export async function addFeedAction(label: string, url: string) {
  await requireOwner();
  const p = z.object({ label: z.string().max(60), url: z.string().max(2000) }).safeParse({ label, url });
  if (!p.success) return INVALID;
  return run(async () => {
    const r = await addFeed(db(), p.data);
    if (r.ok) await sync();
    return r;
  });
}

export async function setFeedEnabledAction(id: string, enabled: boolean) {
  await requireOwner();
  const p = z.object({ id: uuid, enabled: z.boolean() }).safeParse({ id, enabled });
  if (!p.success) return INVALID;
  return run(async () => {
    const ok = await setFeedEnabled(db(), p.data.id, p.data.enabled);
    if (ok) await sync();
    return ok ? ({ ok: true } as const) : ({ ok: false, error: "not_found" } as const);
  });
}

export async function removeFeedAction(id: string) {
  await requireOwner();
  const p = uuid.safeParse(id);
  if (!p.success) return INVALID;
  return run(async () => {
    const ok = await removeFeed(db(), p.data);
    return ok ? ({ ok: true } as const) : ({ ok: false, error: "not_found" } as const);
  });
}

export async function importEventUrlAction(url: string) {
  await requireOwner();
  const p = z.string().max(2000).safeParse(url);
  if (!p.success) return INVALID;
  return run(() => importEventUrl(db(), p.data));
}

export async function saveInterestsAction(list: string[]) {
  await requireOwner();
  const p = z.array(z.string().max(40)).max(20).safeParse(list);
  if (!p.success) return { ok: false, error: Array.isArray(list) && list.length > 20 ? "too_many" : "too_long" } as const;
  return run(() => saveInterests(db(), p.data));
}

export async function syncEventsNowAction() {
  await requireOwner();
  return run(async () => {
    await sync();
    return { ok: true } as const;
  });
}

export async function saveEventKeyAction(id: string, raw: string) {
  await requireOwner();
  const p = z.object({ id: keyId, raw: z.string().trim().min(1).max(255) }).safeParse({ id, raw });
  if (!p.success) return INVALID;
  return run(async () => {
    const r = await saveEventKey(db(), p.data.id, p.data.raw);
    if (r.ok) await sync();
    return r;
  });
}

export async function removeEventKeyAction(id: string) {
  await requireOwner();
  const p = keyId.safeParse(id);
  if (!p.success) return INVALID;
  return run(async () => {
    await removeEventKey(db(), p.data);
    await sync();
    return { ok: true } as const;
  });
}

export async function saveEventbriteOrganizersAction(ids: string[]) {
  await requireOwner();
  const p = z.array(z.string().max(30)).max(20).safeParse(ids);
  if (!p.success) return INVALID;
  return run(async () => {
    const r = await saveEventbriteOrganizers(db(), p.data);
    if (r.ok) await sync();
    return r;
  });
}
