import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { completeGoogleOAuth, GOOGLE_COOKIE } from "@/server/calendar/google/oauth";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const base = env().BETTER_AUTH_URL;
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.redirect(`${base}/login`);
  const q = request.nextUrl.searchParams;
  const r = await completeGoogleOAuth(undefined, {
    code: q.get("code"),
    state: q.get("state"),
    error: q.get("error"),
    cookie: request.cookies.get(GOOGLE_COOKIE)?.value ?? null,
  });
  const res = NextResponse.redirect(`${base}/settings?section=connections&${r.ok ? `google=connected&n=${r.calendars}&gmail=${r.gmail ? 1 : 0}` : `google=${r.error}`}`);
  res.cookies.delete({ name: GOOGLE_COOKIE, path: "/api/connections/google" }); // single use
  return res;
}
