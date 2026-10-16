"use server";

import { z } from "zod";
import type { ApprovalDTO } from "@/lib/agent-types";
import { decide, getApproval, retryApproval, saveEdit, type FieldErrors } from "./agents/approvals";
import { db } from "./db/client";
import { log } from "./log";
import { requireOwner } from "./session";
import { financeChangePlan } from "@/lib/finance-payload";
import { refreshFinanceProposal } from "./finance-agent";
import { ToolError } from "./agents/types";

type Result = { ok: boolean; approval?: ApprovalDTO; errors?: FieldErrors };
const id = z.uuid();

async function run(rawId: string, fn: (id: string) => Promise<{ ok: boolean; errors?: FieldErrors; reason?: string }>): Promise<Result> {
  const p = id.safeParse(rawId);
  if (!p.success) return { ok: false };
  try {
    const r = await fn(p.data);
    const approval = (await getApproval(db(), p.data)) ?? undefined;
    return r.ok ? { ok: true, approval } : { ok: false, errors: r.errors, approval };
  } catch (err) {
    log.error({ err }, "approval action failed");
    return { ok: false };
  }
}

export async function approveAction(rawId: string, edited?: unknown): Promise<Result> {
  await requireOwner();
  return run(rawId, (i) => decide(db(), i, "approve", { edited }).then((r) => ({ ...r, errors: "errors" in r ? r.errors : undefined })));
}

export async function rejectAction(rawId: string): Promise<Result> {
  await requireOwner();
  return run(rawId, (i) => decide(db(), i, "reject"));
}

export async function saveEditAction(rawId: string, edited: unknown): Promise<Result> {
  await requireOwner();
  return run(rawId, async (i) => {
    const r = await saveEdit(db(), i, edited);
    return { ok: r.ok, errors: "errors" in r ? r.errors : undefined };
  });
}

export async function retryApprovalAction(rawId: string): Promise<Result> {
  await requireOwner();
  return run(rawId, (i) => retryApproval(db(), i));
}

export async function reviewFinanceAction(rawId: string, rawPlan: unknown) {
  await requireOwner();
  const p = id.safeParse(rawId), plan = financeChangePlan.safeParse(rawPlan);
  if (!p.success || !plan.success) return { ok: false, error: plan.success ? "Invalid request." : plan.error.issues[0]!.message } as const;
  try {
    const a = await getApproval(db(), p.data);
    if (!a || a.kind !== "finance_update" || a.status !== "pending") return { ok: false, error: "This proposal is no longer pending." } as const;
    const original = a.original as { before: string; impact: unknown };
    return { ok: true, payload: await refreshFinanceProposal(db(), { plan: plan.data, before: original.before, impact: original.impact }) } as const;
  } catch (err) { return { ok: false, error: err instanceof ToolError ? err.message : "Could not review these finance changes." } as const; }
}
