import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { clientIp } from "@/server/client-ip";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health"];

function csp(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Optimistic cookie check only; pages re-validate the session server-side.
  if (!isPublic && !getSessionCookie(request)) {
    if (pathname.startsWith("/api/")) return Response.json({ error: "unauthorized" }, { status: 401 });
    // Build from the public URL: behind tailscale serve request.url is the internal http://…:3000,
    // and Next's proxy rejects a relative Location ("Invalid URL").
    const url = new URL("/login", process.env.BETTER_AUTH_URL ?? request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = csp(nonce);
  const headers = new Headers(request.headers);
  // Keep only the proxy-appended hop so clients can't spoof the IP used for rate limiting and audit.
  const ip = clientIp(request.headers);
  if (ip) headers.set("x-forwarded-for", ip);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", policy);
  return response;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico).*)" }],
};
