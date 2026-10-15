import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { startTikTokOAuth, TIKTOK_COOKIE } from "@/server/socials/connections";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const base = env().BETTER_AUTH_URL;
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.redirect(`${base}/login`);
  const started = await startTikTokOAuth(db(), base);
  if ("error" in started) return NextResponse.redirect(`${base}/settings?section=connections&tiktok=not_configured`);
  const res = NextResponse.redirect(started.url);
  res.cookies.set(TIKTOK_COOKIE, started.cookie, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/connections/tiktok", maxAge: 600 });
  return res;
}
