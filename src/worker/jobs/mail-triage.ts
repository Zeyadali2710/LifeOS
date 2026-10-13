import { z } from "zod";
import { log } from "@/server/log";
import { runTriage } from "@/server/mail/triage";

const data = z.object({ ids: z.array(z.uuid()).max(20).optional() });

export async function handleMailTriage(raw?: unknown): Promise<void> {
  try {
    const p = data.safeParse(raw ?? {});
    await runTriage({ ids: p.success ? p.data.ids : undefined });
  } catch (err) {
    log.error({ err }, "mail triage failed");
  }
}
