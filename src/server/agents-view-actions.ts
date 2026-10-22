"use server";

import { z } from "zod";
import { agentInspector, runTrace } from "./agents/view";
import { AGENTS } from "./agents/registry";
import { db } from "./db/client";
import { log } from "./log";
import { requireOwner } from "./session";

const agentId = z.enum(AGENTS.map((a) => a.id) as [string, ...string[]]);

/** Read-only: the Agents inspector for one agent. */
export async function agentInspectorAction(raw: string) {
  await requireOwner();
  const p = agentId.safeParse(raw);
  if (!p.success) return null;
  try {
    return await agentInspector(db(), p.data);
  } catch (err) {
    log.error({ err }, "agent inspector failed");
    return null;
  }
}

/** Read-only: one run's trace (tool inputs/outputs are already redacted by runDetail). */
export async function runTraceAction(raw: string) {
  await requireOwner();
  const p = z.uuid().safeParse(raw);
  if (!p.success) return null;
  try {
    return await runTrace(db(), p.data);
  } catch (err) {
    log.error({ err }, "run trace failed");
    return null;
  }
}
