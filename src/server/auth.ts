import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { audit } from "./audit";
import { emitAuthEvent } from "./auth-events";
import { clientIp } from "./client-ip";
import { db } from "./db/client";
import { accounts, rateLimits, sessions, users, verifications } from "./db/schema";
import { env } from "./env";

function createAuth() {
  const e = env();
  return betterAuth({
    secret: e.BETTER_AUTH_SECRET,
    baseURL: e.BETTER_AUTH_URL,
    trustedOrigins: [e.BETTER_AUTH_URL],
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications, rateLimit: rateLimits },
    }),
    // Single owner, created via `npm run create-owner`. No public sign-up.
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: { "/sign-in/email": { window: 60, max: 5 } },
    },
    advanced: {
      useSecureCookies: e.NODE_ENV === "production",
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email" && ctx.path !== "/sign-out") return;
        // Sign-out succeeds even without a session; only a validly signed session cookie counts as the owner.
        if (ctx.path === "/sign-out" && !(await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret))) return;
        const ip = clientIp(ctx.request?.headers);
        const returned = ctx.context.returned;
        const failed = returned instanceof Error;
        await audit({
          actor: failed ? "anonymous" : "owner",
          action: ctx.path === "/sign-out" ? "auth.sign_out" : failed ? "auth.sign_in_failed" : "auth.sign_in",
          ip,
          metadata: failed ? { email: (ctx.body as { email?: string } | undefined)?.email } : undefined,
        });
        await emitAuthEvent(ctx.path === "/sign-out" ? "sign_out" : failed ? "sign_in_failed" : "sign_in");
      }),
    },
    plugins: [nextCookies()],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

export function auth() {
  return (instance ??= createAuth());
}
