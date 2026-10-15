import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { executeApproved, expireDue } from "../../server/agents/approvals";
import { getLlm } from "../../server/agents/llm";
import { runQueued } from "../../server/agents/loop";
import { db } from "../../server/db/client";
import { agentRuns } from "../../server/db/schema";
import { notifyLive } from "../../server/events";
import { log } from "../../server/log";

const data = z.object({ runId: z.uuid(), approvalId: z.uuid().optional() });

/** agent.resume: execute an approved action (if any), then continue the run to its next suspension. */
export async function handleResume(job: unknown): Promise<void> {
  const parsed = data.safeParse(job);
  if (!parsed.success) return log.error({ err: parsed.error }, "agent resume: bad job data"); // retrying can't help
  const { runId, approvalId } = parsed.data;
  try {
    const h = db();
    const outcome = approvalId ? await executeApproved(h, approvalId) : null;
    if (outcome?.status === "failed") return; // run keeps waiting; owner can Retry
    const [run] = await h.select().from(agentRuns).where(eq(agentRuns.id, runId));
    if (run?.agentId === "social" && run.model === "owner-action:socials.publish") {
      if (outcome?.status === "executed") {
        await h.update(agentRuns).set({ status: "completed", endedAt: new Date(), answer: "Publish scheduled." })
          .where(and(eq(agentRuns.id, runId), inArray(agentRuns.status, ["running", "waiting_approval"])));
        await notifyLive(h, "run", runId);
      }
      return;
    }
    if (!getLlm()) {
      await h
        .update(agentRuns)
        .set({ status: "failed", errorKind: "llm", error: "The Anthropic API key isn't configured", endedAt: new Date() })
        .where(eq(agentRuns.id, runId));
      await notifyLive(h, "run", runId);
      return;
    }
    await runQueued(h, runId);
  } catch (err) {
    log.error({ err }, "agent resume failed");
    throw err; // let pg-boss retryLimit re-run the job
  }
}

export async function handleExpire(): Promise<void> {
  try {
    const n = await expireDue(db(), new Date());
    if (n) log.info({ n }, "expired approvals");
  } catch (err) {
    log.error({ err }, "approval expiry failed");
  }
}
