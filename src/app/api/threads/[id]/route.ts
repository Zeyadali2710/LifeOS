import { z } from "zod";
import { threadDetail } from "@/server/agents/chat";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = z.uuid().safeParse((await params).id);
  const detail = id.success ? await threadDetail(db(), id.data) : null;
  if (!detail) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(detail, { headers: { "cache-control": "no-store" } });
}
