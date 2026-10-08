import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, type DB } from "../db/client";
import { agentRuns, settings } from "../db/schema";
import { emitActivity } from "../events";
import { sydneyMonthBounds } from "./pricing";

const CAP_KEY = "ai.spend_cap_usd";
const DEFAULT_CAP = 20;

const inMonth = (now: Date) => {
  const { start, end } = sydneyMonthBounds(now);
  return and(gte(agentRuns.startedAt, start), lt(agentRuns.startedAt, end));
};

export async function monthToDate(handle: DB = db(), now: Date = new Date()): Promise<number> {
  const [r] = await handle.select({ s: sql<string>`coalesce(sum(${agentRuns.costUsd}), 0)` }).from(agentRuns).where(inMonth(now));
  return Number(r?.s ?? 0);
}

export async function spendByModel(handle: DB = db(), now: Date = new Date()) {
  const rows = await handle
    .select({
      model: agentRuns.model,
      input: sql<string>`coalesce(sum(${agentRuns.inputTokens}), 0)`,
      output: sql<string>`coalesce(sum(${agentRuns.outputTokens}), 0)`,
      cache: sql<string>`coalesce(sum(${agentRuns.cacheWriteTokens} + ${agentRuns.cacheReadTokens}), 0)`,
      costUsd: sql<string>`coalesce(sum(${agentRuns.costUsd}), 0)`,
    })
    .from(agentRuns)
    .where(inMonth(now))
    .groupBy(agentRuns.model);
  return rows.map((r) => ({ model: r.model, input: Number(r.input), output: Number(r.output), cache: Number(r.cache), costUsd: Number(r.costUsd) }));
}

export async function getCap(handle: DB = db()): Promise<number> {
  const [r] = await handle.select({ v: settings.value }).from(settings).where(eq(settings.key, CAP_KEY));
  return typeof r?.v === "number" ? r.v : DEFAULT_CAP;
}

export async function setCap(handle: DB = db(), usd: number): Promise<boolean> {
  if (!Number.isInteger(usd) || usd < 1 || usd > 1000) return false;
  await handle
    .insert(settings)
    .values({ key: CAP_KEY, value: usd })
    .onConflictDoUpdate({ target: settings.key, set: { value: usd, updatedAt: new Date() } });
  return true;
}

export async function capStatus(handle: DB = db(), now: Date = new Date()) {
  const [mtdUsd, capUsd] = await Promise.all([monthToDate(handle, now), getCap(handle)]);
  return { mtdUsd, capUsd, reached: mtdUsd >= capUsd };
}

// Called only at run creation (D-15): in-flight runs finish, so one run may overshoot the cap,
// bounded by RUN_LIMITS (tokens/tool calls/time).
export async function assertUnderCap(
  handle: DB = db(),
  now: Date = new Date(),
  emit: typeof emitActivity = emitActivity,
): Promise<{ ok: true } | { ok: false; capUsd: number }> {
  const { reached, capUsd } = await capStatus(handle, now);
  if (!reached) return { ok: true };
  const claim = await handle
    .insert(settings)
    .values({ key: `ai.spend_cap_notified:${sydneyMonthBounds(now).key}`, value: true })
    .onConflictDoNothing()
    .returning({ key: settings.key });
  if (claim.length > 0) {
    await emit(
      { type: "agent.spend_cap.reached", source: "agentops", title: "Spend cap reached", tone: "red" },
      {
        category: "URGENT",
        title: "Monthly AI spend cap reached",
        body: `New runs are paused at US$${capUsd}. Raise the cap in Settings to continue.`,
        actionUrl: "/settings?section=ai",
      },
      handle,
    );
  }
  return { ok: false, capUsd };
}
