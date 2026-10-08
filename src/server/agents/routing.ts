import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, type DB } from "../db/client";
import { connections, githubRepos, settings } from "../db/schema";
import { env } from "../env";
import { MODELS } from "./registry";

// The only place the free model id is written (D-03). Override with OPENROUTER_FREE_MODEL.
export const DEFAULT_FREE_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
export const freeModel = (): string => env().OPENROUTER_FREE_MODEL ?? DEFAULT_FREE_MODEL;
export const isFree = (model: string): boolean => model.endsWith(":free");

export type Tier = "simple" | "reasoning" | null;
export type ResolveParams = {
  agentId: string;
  pref: string | null;
  routable: boolean;
  defaultModel: string;
  tier: Tier;
  hasKey: boolean;
  coolingDown: boolean;
  privateTainted: boolean;
  privateOk: boolean;
};
export type Resolved = { model: string; mode: "auto" | "free" | null; reason: string | null; blocked?: "private_blocked" };

export function resolveModel(p: ResolveParams): Resolved {
  if (p.agentId === "orchestrator") return { model: MODELS.opus, mode: null, reason: null };
  const routing = p.pref === null || p.pref === "auto" || p.pref === "free";
  if (!routing) return { model: p.pref as string, mode: null, reason: null }; // explicit Sonnet/Opus pin
  if (!p.routable || !p.hasKey) return { model: p.defaultModel, mode: null, reason: null }; // D-12
  const blockPrivate = p.privateTainted && !p.privateOk;
  if (p.pref === "free") {
    if (blockPrivate) return { model: p.defaultModel, mode: "free", reason: null, blocked: "private_blocked" };
    return { model: freeModel(), mode: "free", reason: "pinned: free only" };
  }
  const sonnet = (reason: string): Resolved => ({ model: MODELS.sonnet, mode: "auto", reason });
  if (blockPrivate) return sonnet("private data in thread");
  if (p.tier === "simple") return p.coolingDown ? sonnet("free model cooling down") : { model: freeModel(), mode: "auto", reason: "tag simple" };
  return sonnet(p.tier === "reasoning" ? "tag reasoning" : "no tag");
}

export function effectivePref(p: { pref: string | null; routable: boolean; hasKey: boolean; defaultModel: string }): string {
  if (p.pref === null) return p.routable && p.hasKey ? "auto" : p.defaultModel;
  return p.pref;
}

/** D-09 thread-level taint: any run in the anchor's tree/thread that saw private data. */
export async function privateInTree(h: DB, anchorRunId: string | null): Promise<boolean> {
  if (!anchorRunId) return false;
  const res = await h.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM agent_runs r, (SELECT thread_id FROM agent_runs WHERE id = ${anchorRunId}) a
      WHERE r.saw_private AND (
        r.id = ${anchorRunId} OR r.parent_run_id = ${anchorRunId}
        OR (a.thread_id IS NOT NULL AND (
          r.thread_id = a.thread_id
          OR r.parent_run_id IN (SELECT id FROM agent_runs WHERE thread_id = a.thread_id)))
      )
    ) AS tainted`);
  const row = (res as unknown as { rows?: { tainted: boolean }[] }).rows?.[0] ?? (res as unknown as { tainted: boolean }[])[0];
  return row?.tainted === true;
}

export async function hasFreeKey(h: DB = db()): Promise<boolean> {
  const rows = await h.select({ id: connections.id }).from(connections).where(eq(connections.id, "openrouter")).limit(1);
  return rows.length > 0;
}

// ponytail: cooldown is per process (web vs worker); share via DB if that ever matters.
const COOLDOWN_MS = 5 * 60_000;
let freeDownUntil = 0;
export const markFreeUnavailable = (now: Date) => void (freeDownUntil = now.getTime() + COOLDOWN_MS);
export const freeCoolingDown = (now: Date) => now.getTime() < freeDownUntil;
export const resetFreeCooldown = () => void (freeDownUntil = 0);

const PRIVATE_OK_KEY = "ai.free_private_ok";
export async function getFreePrivateOk(h: DB = db()): Promise<boolean> {
  const [r] = await h.select({ v: settings.value }).from(settings).where(eq(settings.key, PRIVATE_OK_KEY));
  return r?.v === true;
}
export async function setFreePrivateOk(h: DB = db(), value: boolean): Promise<void> {
  await h
    .insert(settings)
    .values({ key: PRIVATE_OK_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

/** Repos treated as private: private true OR null (unknown), fail closed (Pitfall 10). */
export async function sensitiveRepoNames(h: DB = db()): Promise<string[]> {
  const rows = await h
    .select({ n: githubRepos.fullName })
    .from(githubRepos)
    .where(sql`${githubRepos.private} IS NOT FALSE`);
  return rows.map((r) => r.n.toLowerCase());
}

/**
 * Scans the WHOLE conversation (task prompt, assistant text, tool_use inputs, tool_result data), not just
 * tool results: every GitHub tool output carries the repo full name, and a full scan also catches private
 * names Opus copies into a task. Fails closed. Row filtering was rejected (touches every tool, silently wrong answers).
 */
export function mentionsSensitive(messages: unknown, names: string[]): boolean {
  if (names.length === 0) return false;
  const hay = JSON.stringify(messages).toLowerCase();
  return names.some((n) => hay.includes(n.toLowerCase()));
}
