import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { completeTikTokOAuth, TIKTOK_COOKIE } from "@/server/socials/connections";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const base = env().BETTER_AUTH_URL;
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.redirect(`${base}/login`);
  const q = request.nextUrl.searchParams;
  const result = await completeTikTokOAuth(db(), { code: q.get("code"), state: q.get("state"), error: q.get("error"),
    cookie: request.cookies.get(TIKTOK_COOKIE)?.value ?? null, base });
  const res = NextResponse.redirect(`${base}/settings?section=connections&tiktok=${result.ok ? "connected" : result.error}`);
  res.cookies.delete({ name: TIKTOK_COOKIE, path: "/api/connections/tiktok" });
  return res;
}
