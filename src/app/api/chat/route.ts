import { eq } from "drizzle-orm";
import { z } from "zod";
import { startChat } from "@/server/agents/chat";
import { getLlm } from "@/server/agents/llm";
import { advance } from "@/server/agents/loop";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { threads } from "@/server/db/schema";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

const body = z.object({ prompt: z.string().trim().min(1).max(8000), threadId: z.uuid().optional() });

export async function POST(request: Request) {
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  // CSRF: JSON-only plus same-origin (SameSite=Lax cookie is the third layer).
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ code: "invalid" }, { status: 415 });
  const origin = request.headers.get("origin");
  // Compare to the public URL: behind tailscale serve, request.url is the internal http://…:3000.
  if (origin && origin !== new URL(env().BETTER_AUTH_URL).origin) return Response.json({ error: "forbidden" }, { status: 403 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: "invalid" }, { status: 400 });

  const h = db();
  if (parsed.data.threadId && !(await h.select({ id: threads.id }).from(threads).where(eq(threads.id, parsed.data.threadId)))[0]) {
    return Response.json({ code: "invalid" }, { status: 400 });
  }
  const started = await startChat(h, parsed.data);
  if (!started.ok) return Response.json({ code: started.code, capUsd: started.capUsd }, { status: started.code === "rate_limited" ? 429 : 409 });
  const llm = getLlm()!;

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // request.signal only stops writing; the run itself is never cancelled by a closed stream.
      const send = (s: string) => {
        if (request.signal.aborted) return;
        try {
          controller.enqueue(enc.encode(s));
        } catch {}
      };
      try {
        await advance(started.runId, { handle: h, llm, onEvent: (e) => send(JSON.stringify(e) + "\n") });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
