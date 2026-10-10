import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { GOOGLE_COOKIE, startGoogleOAuth } from "@/server/calendar/google/oauth";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const base = env().BETTER_AUTH_URL;
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.redirect(`${base}/login`);
  const s = startGoogleOAuth();
  if ("error" in s) return NextResponse.redirect(`${base}/settings?section=connections&google=not_configured`);
  const res = NextResponse.redirect(s.url);
  res.cookies.set(GOOGLE_COOKIE, s.cookie, { httpOnly: true, secure: base.startsWith("https:"), sameSite: "lax", path: "/api/connections/google", maxAge: 600 });
  return res;
}
