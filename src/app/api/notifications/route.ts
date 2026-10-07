import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { snapshot } from "@/server/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await snapshot(db(), new Date()), { headers: { "cache-control": "no-store" } });
}
