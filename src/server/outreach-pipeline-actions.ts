"use server";

import { z } from "zod";
import { STAGES } from "../lib/outreach-types";
import type { WriteCtx } from "./calendar/events";
import { providerFor } from "./calendar/providers";
import { db } from "./db/client";
import { log } from "./log";
import { addToCalendar, createFollowUps, dismissEvent, moveStage, restoreEvent, type CalendarResult, type DismissResult, type FollowUpResult, type MoveResult } from "./outreach/pipeline";
import { requireOwner } from "./session";

type Failed = { ok: false; error: "failed" };
const uuid = z.uuid();
const stage = z.enum(STAGES).nullable();
const lines = z.array(z.object({ title: z.string().trim().min(1, "Add a title.").max(200), dueDate: z.iso.date().nullable() })).min(1).max(10);
const ctx = (): WriteCtx => ({ actor: "owner", providerFor, now: () => new Date() });

// Errors are logged as { err } only: never titles or URLs.
async function run<T>(f: () => Promise<T>): Promise<T | Failed> {
  try {
    return await f();
  } catch (err) {
    log.error({ err }, "outreach pipeline action failed");
    return { ok: false, error: "failed" };
  }
}

export async function moveStageAction(id: unknown, from: unknown, to: unknown): Promise<MoveResult | Failed> {
  await requireOwner();
  const i = uuid.safeParse(id);
  if (!i.success) return { ok: false, error: "not_found" };
  const f = stage.safeParse(from);
  const t = stage.safeParse(to);
  if (!f.success || !t.success) return { ok: false, error: "invalid" };
  return run(() => moveStage(db(), i.data, f.data, t.data, new Date()));
}

export async function dismissEventAction(id: unknown): Promise<DismissResult | Failed> {
  await requireOwner();
  const i = uuid.safeParse(id);
  if (!i.success) return { ok: false, error: "not_found" };
  return run(() => dismissEvent(db(), i.data, new Date()));
}

export async function restoreEventAction(id: unknown): Promise<DismissResult | Failed> {
  await requireOwner();
  const i = uuid.safeParse(id);
  if (!i.success) return { ok: false, error: "not_found" };
  return run(() => restoreEvent(db(), i.data, new Date()));
}

export async function addToCalendarAction(id: unknown, calendarId: unknown): Promise<CalendarResult | Failed> {
  await requireOwner();
  const i = uuid.safeParse(id);
  if (!i.success) return { ok: false, error: "not_found" };
  const c = uuid.nullable().safeParse(calendarId ?? null);
  if (!c.success) return { ok: false, error: "no_calendar" };
  return run(() => addToCalendar(db(), i.data, c.data, ctx()));
}

export async function createFollowUpsAction(id: unknown, raw: unknown): Promise<FollowUpResult | Failed> {
  await requireOwner();
  const i = uuid.safeParse(id);
  if (!i.success) return { ok: false, error: "not_found" };
  const l = lines.safeParse(raw);
  if (!l.success) {
    const empty = Array.isArray(raw) && raw.length >= 1 && raw.length <= 10;
    if (!empty) return { ok: false, error: "invalid" };
    const errors: Record<string, string> = {};
    for (const is of l.error.issues) errors[`lines.${String(is.path[0])}.${String(is.path[1] ?? "title")}`] ??= is.message;
    return { ok: false, errors };
  }
  return run(() => createFollowUps(db(), i.data, l.data, new Date()));
}
