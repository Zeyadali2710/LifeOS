import { assistantStatus } from "@/server/agents/chat";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await assistantStatus(db()), { headers: { "cache-control": "no-store" } });
}
