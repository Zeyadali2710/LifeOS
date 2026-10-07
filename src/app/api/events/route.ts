import { auth } from "@/server/auth";
import { getHub } from "@/server/hub";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          cleanup();
        }
      };
      const unsub = getHub().subscribe((e) => send(`event: ${e.k}\ndata: ${e.json}\n\n`));
      const ping = setInterval(() => send(": ping\n\n"), 20_000);
      const max = setTimeout(() => {
        cleanup();
        try {
          controller.close();
        } catch {}
      }, 15 * 60_000); // forces re-auth on reconnect (T-02-21 ceiling)
      cleanup = () => {
        clearInterval(ping);
        clearTimeout(max);
        unsub();
      };
      request.signal.addEventListener("abort", cleanup);
      send("retry: 3000\n: connected\n\n");
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      // no-transform: otherwise Next's compression buffers the stream
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
