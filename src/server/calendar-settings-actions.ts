"use server";

import { z } from "zod";
import { connectIcloud } from "./calendar/caldav/provider";
import { setCalendarCategory, setCalendarEnabled, setDefaultCalendar } from "./calendar/calendars";
import { removeCalendarConnection } from "./calendar/connections";
import { db } from "./db/client";
import { log } from "./log";
import { enqueue, QUEUES } from "./queue";
import { requireOwner } from "./session";

const connId = z.enum(["google_calendar", "icloud_calendar"]);
const uuid = z.uuid();
const queueSync = () => enqueue(QUEUES.calendarSync, {}, { singletonKey: "calendar.sync" }).catch(() => undefined);

export type ConnectIcloudResult = { ok: true; calendars: number } | { ok: false; error: "empty" | "invalid" | "rejected" | "unreachable" | "failed" };

export async function connectIcloudAction(appleId: string, password: string): Promise<ConnectIcloudResult> {
  await requireOwner();
  try {
    const r = await connectIcloud(db(), String(appleId), String(password));
    if (!r.ok) return r;
    await queueSync();
    return { ok: true, calendars: r.calendars };
  } catch (err) {
    log.error({ err }, "icloud connect failed"); // never log the password
    return { ok: false, error: "failed" };
  }
}

export async function disconnectCalendarAction(rawId: string): Promise<{ ok: true } | { ok: false; error: "invalid" | "failed" }> {
  await requireOwner();
  const i = connId.safeParse(rawId);
  if (!i.success) return { ok: false, error: "invalid" };
  try {
    await removeCalendarConnection(db(), i.data);
    return { ok: true };
  } catch (err) {
    log.error({ err }, "calendar disconnect failed");
    return { ok: false, error: "failed" };
  }
}

export async function setCalendarSyncAction(rawId: string, rawOn: boolean): Promise<{ ok: true } | { ok: false; error: "invalid" | "failed" }> {
  await requireOwner();
  const i = uuid.safeParse(rawId);
  const on = z.boolean().safeParse(rawOn);
  if (!i.success || !on.success) return { ok: false, error: "invalid" };
  try {
    await setCalendarEnabled(db(), i.data, on.data);
    if (on.data) await queueSync();
    return { ok: true };
  } catch (err) {
    log.error({ err }, "set calendar sync failed");
    return { ok: false, error: "failed" };
  }
}

export async function setCalendarCategoryAction(rawId: string, category: string): Promise<{ ok: true } | { ok: false; error: "invalid" | "category" | "failed" }> {
  await requireOwner();
  const i = uuid.safeParse(rawId);
  if (!i.success) return { ok: false, error: "invalid" };
  try {
    return await setCalendarCategory(db(), i.data, String(category));
  } catch (err) {
    log.error({ err }, "set calendar category failed");
    return { ok: false, error: "failed" };
  }
}

export async function setDefaultCalendarAction(rawId: string): Promise<{ ok: true } | { ok: false; error: "invalid" | "not_writable" | "failed" }> {
  await requireOwner();
  const i = uuid.safeParse(rawId);
  if (!i.success) return { ok: false, error: "invalid" };
  try {
    return await setDefaultCalendar(db(), i.data);
  } catch (err) {
    log.error({ err }, "set default calendar failed");
    return { ok: false, error: "failed" };
  }
}
