import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import type { ApprovalDTO } from "@/lib/agent-types";
import { issuePayloadSchema, type IssuePayload } from "@/lib/issue-payload";
import type { DB } from "../db/client";
import { agentRuns, approvals, auditLog, githubRepos, toolCalls } from "../db/schema";
import { emitActivity, notifyLive } from "../events";
import { GithubError } from "../github/client";
import { log } from "../log";
import { enqueue as realEnqueue, QUEUES, type Enqueue } from "../queue";
import { toApprovalDTO } from "./dto";
import { redact, summarize } from "./redact";
import { cancelRun } from "./runs";
import { TOOLS } from "./tools";
import { ToolError, type Tool } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous tool map
type Tools = Record<string, Tool<any, any>>;
type Row = typeof approvals.$inferSelect;
export type FieldErrors = Record<string, string>;

const STUCK_MS = 2 * 60_000;

// Audit via the caller's handle so it lands in the same database (audit() uses the global one).
async function aud(h: DB, action: string, id: string, metadata: Record<string, unknown>) {
  try {
    await h.insert(auditLog).values({ actor: "owner", action, target: id, metadata });
  } catch (err) {
    log.error({ err, action }, "audit write failed");
  }
}

const live = async (h: DB, a: { id: string; runId: string }) => {
  await notifyLive(h, "approval", a.id);
  await notifyLive(h, "run", a.runId);
};

const payloadOf = (r: Row) => (r.editedPayload ?? r.originalPayload) as IssuePayload;

function fieldErrors(err: { issues: { path: PropertyKey[]; message: string }[] }): FieldErrors {
  const out: FieldErrors = {};
  for (const i of err.issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
}

async function load(h: DB, id: string) {
  return (await h.select().from(approvals).where(eq(approvals.id, id)))[0] ?? null;
}

export type DecideResult =
  | { ok: true; queued?: boolean }
  | { ok: false; reason: "not_pending" }
  | { ok: false; reason: "invalid"; errors: FieldErrors };

export async function decide(
  h: DB,
  id: string,
  decision: "approve" | "reject",
  opts: { edited?: unknown; enqueue?: Enqueue; now?: () => Date } = {},
): Promise<DecideResult> {
  const now = (opts.now ?? (() => new Date()))();
  const cur = await load(h, id);
  if (!cur || cur.status !== "pending") return { ok: false, reason: "not_pending" };

  if (decision === "reject") {
    const [won] = await h
      .update(approvals)
      .set({ status: "rejected", decidedAt: now })
      .where(and(eq(approvals.id, id), eq(approvals.status, "pending")))
      .returning();
    if (!won) return { ok: false, reason: "not_pending" };
    await aud(h, "approval.reject", id, { approvalId: id, edited: false });
    await cancelRun(h, won.runId, now);
    await live(h, won);
    return { ok: true };
  }

  // Approve: the executed payload is edited ?? original, re-validated server-side (D-04).
  const candidate = opts.edited ?? payloadOf(cur);
  const parsed = issuePayloadSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, reason: "invalid", errors: fieldErrors(parsed.error) };
  const orig = cur.originalPayload as IssuePayload;
  if (parsed.data.repo !== orig.repo) return { ok: false, reason: "invalid", errors: { repo: "Repository can't be changed." } };

  const [won] = await h
    .update(approvals)
    .set({ status: "approved", decidedAt: now, ...(opts.edited ? { editedPayload: parsed.data } : {}) })
    .where(and(eq(approvals.id, id), eq(approvals.status, "pending"), sql`${approvals.expiresAt} > ${now}`))
    .returning();
  if (!won) return { ok: false, reason: "not_pending" };
  if (opts.edited) await aud(h, "approval.edit", id, { original: orig, edited: parsed.data });
  await aud(h, "approval.approve", id, { approvalId: id, edited: Boolean(opts.edited) });
  await live(h, won);
  try {
    await (opts.enqueue ?? realEnqueue)(QUEUES.resume, { runId: won.runId, approvalId: id }, { singletonKey: `resume:${id}` });
  } catch {
    return { ok: true, queued: false }; // expireDue re-enqueues stuck approved rows
  }
  return { ok: true };
}

export async function saveEdit(
  h: DB,
  id: string,
  edited: unknown,
): Promise<{ ok: true } | { ok: false; reason: "not_pending" } | { ok: false; errors: FieldErrors }> {
  const cur = await load(h, id);
  if (!cur || cur.status !== "pending") return { ok: false, reason: "not_pending" };
  const parsed = issuePayloadSchema.safeParse(edited);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const orig = cur.originalPayload as IssuePayload;
  if (parsed.data.repo !== orig.repo) return { ok: false, errors: { repo: "Repository can't be changed." } };
  const [won] = await h
    .update(approvals)
    .set({ editedPayload: parsed.data })
    .where(and(eq(approvals.id, id), eq(approvals.status, "pending")))
    .returning();
  if (!won) return { ok: false, reason: "not_pending" };
  await aud(h, "approval.edit", id, { original: orig, edited: parsed.data });
  await notifyLive(h, "approval", id);
  return { ok: true };
}

export type ExecOutcome =
  | { status: "executed"; result: { number: number; url: string } }
  | { status: "failed"; error: string; ambiguous: boolean }
  | { status: "skipped" };

/** Execute an approved (or failed-then-retried) approval exactly once; a repeat returns the stored result. */
export async function executeApproved(
  h: DB,
  id: string,
  deps: { tools?: Tools; fetch?: typeof fetch; now?: () => Date } = {},
): Promise<ExecOutcome> {
  const now = deps.now ?? (() => new Date());
  const [row] = await h
    .update(approvals)
    .set({ status: "executing" })
    .where(
      and(
        eq(approvals.id, id),
        inArray(approvals.status, ["approved", "failed"]),
        // A cancelled/expired run must never create the issue (cancelRun also cancels approved rows).
        sql`not exists (select 1 from agent_runs r where r.id = ${approvals.runId} and r.status in ('cancelled', 'expired'))`,
      ),
    )
    .returning();
  if (!row) {
    const cur = await load(h, id);
    return cur?.status === "executed" && cur.result ? { status: "executed", result: cur.result } : { status: "skipped" };
  }
  await live(h, row);
  const tool = (deps.tools ?? TOOLS)[row.tool];
  const [call] = await h.select().from(toolCalls).where(eq(toolCalls.id, row.toolCallId));
  const t0 = Date.now();

  const fail = async (error: string, ambiguous: boolean): Promise<ExecOutcome> => {
    await h.update(approvals).set({ status: "failed", error, ambiguous }).where(eq(approvals.id, id));
    await live(h, row);
    return { status: "failed", error, ambiguous };
  };

  if (!tool || !call) return fail("This request can't be run any more.", false);
  try {
    const out = await tool.handler(tool.input.parse(payloadOf(row)), {
      handle: h,
      runId: row.runId,
      agentId: row.agentId,
      toolUseId: call.toolUseId,
      now,
      fetch: deps.fetch,
      approvalId: id,
      adopt: row.ambiguous,
    });
    const o = redact(out);
    await h.update(approvals).set({ status: "executed", result: out, error: null, ambiguous: false }).where(eq(approvals.id, id));
    await h
      .update(toolCalls)
      .set({ status: "done", output: o ?? null, outputSummary: summarize(o), durationMs: Date.now() - t0 })
      .where(eq(toolCalls.id, call.id));
    await live(h, row);
    return { status: "executed", result: out };
  } catch (err) {
    if (err instanceof GithubError) {
      const definite = err.kind === "client" || err.kind === "auth" || err.kind === "not_found" || err.kind === "rate_limit";
      return fail(definite ? `GitHub rejected it: ${err.message}` : "GitHub didn't respond. It may or may not have been created; Retry will check first.", !definite);
    }
    if (err instanceof ToolError) return fail(err.message, false);
    log.error({ err, approvalId: id }, "approved execution failed");
    return fail("Something went wrong while creating the issue. Retry will check first.", true);
  }
}

/** failed -> approved again with the same approval id (the marker keeps it idempotent). */
export async function retryApproval(h: DB, id: string, opts: { enqueue?: Enqueue; now?: () => Date } = {}): Promise<{ ok: boolean }> {
  const now = (opts.now ?? (() => new Date()))();
  const [won] = await h
    .update(approvals)
    .set({ status: "approved", decidedAt: now })
    .where(and(eq(approvals.id, id), eq(approvals.status, "failed"), sql`${approvals.expiresAt} > ${now}`))
    .returning();
  if (!won) return { ok: false };
  await live(h, won);
  try {
    await (opts.enqueue ?? realEnqueue)(QUEUES.resume, { runId: won.runId, approvalId: id }, { singletonKey: `resume:${id}` });
  } catch (err) {
    log.error({ err }, "retry enqueue failed");
  }
  return { ok: true };
}

/** Sweep: expire due approvals (nothing runs afterwards) and re-enqueue approvals stuck in 'approved'. */
export async function expireDue(h: DB, now: Date = new Date(), opts: { enqueue?: Enqueue } = {}): Promise<number> {
  const due = await h
    .update(approvals)
    .set({ status: "expired", decidedAt: now })
    .where(and(inArray(approvals.status, ["pending", "failed"]), lte(approvals.expiresAt, now)))
    .returning();
  for (const a of due) {
    const [run] = await h
      .update(agentRuns)
      .set({ status: "expired", endedAt: now })
      .where(and(eq(agentRuns.id, a.runId), eq(agentRuns.status, "waiting_approval")))
      .returning();
    await h.update(toolCalls).set({ status: "cancelled" }).where(and(eq(toolCalls.id, a.toolCallId), eq(toolCalls.status, "waiting_approval")));
    if (run?.parentRunId) {
      await h
        .update(agentRuns)
        .set({ status: "expired", endedAt: now })
        .where(and(eq(agentRuns.id, run.parentRunId), eq(agentRuns.status, "waiting_approval")));
    }
    await emitActivity(
      { type: "agent.approval.expired", source: a.agentId, title: "Approval expired", detail: payloadOf(a).title },
      {
        category: "FYI",
        title: "Approval expired",
        body: `The issue "${payloadOf(a).title}" was not created. Nothing ran after the request expired.`,
        actionUrl: `/approvals?id=${a.id}`,
      },
      h,
    );
    await live(h, a);
    if (run?.parentRunId) await notifyLive(h, "run", run.parentRunId);
  }

  // A worker that died mid-execution leaves 'executing' behind: mark it failed+ambiguous so Retry adopts via the marker.
  const hung = await h
    .update(approvals)
    .set({ status: "failed", ambiguous: true, error: "Interrupted while creating. Retry will check first." })
    .where(and(eq(approvals.status, "executing"), lte(approvals.updatedAt, new Date(now.getTime() - STUCK_MS))))
    .returning();
  for (const a of hung) await live(h, a);

  const stuck = await h
    .select()
    .from(approvals)
    .where(and(eq(approvals.status, "approved"), lte(approvals.decidedAt, new Date(now.getTime() - STUCK_MS))));
  for (const a of stuck) {
    try {
      await (opts.enqueue ?? realEnqueue)(QUEUES.resume, { runId: a.runId, approvalId: a.id }, { singletonKey: `resume:${a.id}` });
    } catch (err) {
      log.error({ err }, "reconcile enqueue failed");
    }
  }
  return due.length;
}

async function toDTOs(h: DB, rows: Row[]): Promise<ApprovalDTO[]> {
  const repos = new Map(
    (await h.select({ n: githubRepos.fullName, p: githubRepos.private }).from(githubRepos)).map((r) => [r.n, r.p]),
  );
  return rows.flatMap((r) => {
    try {
      return [toApprovalDTO(r, repos.get((r.originalPayload as IssuePayload).repo) ?? null)];
    } catch (err) {
      log.error({ err, id: r.id }, "approval DTO failed");
      return [];
    }
  });
}

export async function listApprovals(h: DB, which: "pending" | "resolved"): Promise<ApprovalDTO[]> {
  const rows =
    which === "pending"
      ? await h.select().from(approvals).where(eq(approvals.status, "pending")).orderBy(desc(approvals.createdAt))
      : await h
          .select()
          .from(approvals)
          .where(sql`${approvals.status} <> 'pending'`)
          .orderBy(desc(approvals.createdAt))
          .limit(50);
  return toDTOs(h, rows);
}

export async function getApproval(h: DB, id: string): Promise<ApprovalDTO | null> {
  const r = await load(h, id);
  return r ? ((await toDTOs(h, [r]))[0] ?? null) : null;
}
