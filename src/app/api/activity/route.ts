import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { recentActivity } from "@/server/events";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ items: await recentActivity(db(), 20) }, { headers: { "cache-control": "no-store" } });
}
