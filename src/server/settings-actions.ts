"use server";

import { z } from "zod";
import { setFreePrivateOk } from "./agents/routing";
import { setCap } from "./agents/spend";
import { db } from "./db/client";
import { audit } from "./audit";
import { getConnections, removeToken, saveOpenRouterKey, saveToken } from "./github/connections";
import { log } from "./log";
import { enqueue, QUEUES } from "./queue";
import { requireOwner } from "./session";

const id = z.enum(["github_read", "github_write"]);
const removable = z.enum(["github_read", "github_write", "openrouter"]);
const token = z.string().trim().min(1).max(255);
const cap = z.number().int().min(1).max(1000);

export type SaveTokenResult =
  | { ok: true; login: string; repos: number }
  | { ok: false; error: "empty" | "invalid" | "rejected" | "no_repos" | "unreachable" | "failed" };

export async function saveTokenAction(rawId: string, rawToken: string): Promise<SaveTokenResult> {
  await requireOwner();
  const i = id.safeParse(rawId);
  if (!i.success) return { ok: false, error: "invalid" };
  const t = token.safeParse(rawToken);
  if (!t.success) return { ok: false, error: String(rawToken).trim() === "" ? "empty" : "invalid" };
  try {
    const r = await saveToken(db(), i.data, t.data);
    if (!r.ok) return r;
    if (i.data === "github_read") await enqueue(QUEUES.githubSync, {}, { singletonKey: "github.sync" }).catch(() => undefined);
    return { ok: true, login: r.login, repos: r.repos };
  } catch (err) {
    log.error({ err }, "save token failed"); // never log the token
    return { ok: false, error: "failed" };
  }
}

export async function saveOpenRouterKeyAction(
  rawKey: string,
): Promise<{ ok: true } | { ok: false; error: "empty" | "invalid" | "rejected" | "unreachable" | "failed" }> {
  await requireOwner();
  const t = token.safeParse(rawKey);
  if (!t.success) return { ok: false, error: String(rawKey).trim() === "" ? "empty" : "invalid" };
  try {
    return await saveOpenRouterKey(db(), t.data);
  } catch (err) {
    log.error({ err }, "save openrouter key failed"); // never log the key
    return { ok: false, error: "failed" };
  }
}

export async function setFreePrivateAction(raw: boolean): Promise<{ ok: boolean }> {
  await requireOwner();
  const v = z.boolean().safeParse(raw);
  if (!v.success) return { ok: false };
  try {
    await setFreePrivateOk(db(), v.data);
    await audit({ actor: "owner", action: "settings.free_private", target: "ai.free_private_ok", metadata: { value: v.data } });
    return { ok: true };
  } catch (err) {
    log.error({ err }, "set free private failed");
    return { ok: false };
  }
}

export async function removeTokenAction(rawId: string): Promise<{ ok: boolean }> {
  await requireOwner();
  const i = removable.safeParse(rawId);
  if (!i.success) return { ok: false };
  try {
    await removeToken(db(), i.data);
    return { ok: true };
  } catch (err) {
    log.error({ err }, "remove token failed");
    return { ok: false };
  }
}

export async function syncNowAction(): Promise<{ ok: boolean }> {
  await requireOwner();
  try {
    const read = (await getConnections(db())).find((c) => c.id === "github_read");
    if (!read || read.status === "none") return { ok: false };
    await enqueue(QUEUES.githubSync, {}, { singletonKey: "github.sync" });
    return { ok: true };
  } catch (err) {
    log.error({ err }, "sync now failed");
    return { ok: false };
  }
}

export async function setSpendCapAction(raw: number): Promise<{ ok: boolean }> {
  await requireOwner();
  const c = cap.safeParse(raw);
  if (!c.success) return { ok: false };
  try {
    return { ok: await setCap(db(), c.data) };
  } catch (err) {
    log.error({ err }, "set spend cap failed");
    return { ok: false };
  }
}
