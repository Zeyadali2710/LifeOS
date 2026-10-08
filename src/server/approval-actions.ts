"use server";

import { z } from "zod";
import type { ApprovalDTO } from "@/lib/agent-types";
import { decide, getApproval, retryApproval, saveEdit, type FieldErrors } from "./agents/approvals";
import { db } from "./db/client";
import { log } from "./log";
import { requireOwner } from "./session";

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
