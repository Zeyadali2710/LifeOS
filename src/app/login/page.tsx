import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · LifeOS" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await auth().api.getSession({ headers: await headers() });
  const { next } = await searchParams;
  // Only same-origin paths. Browsers treat "\" like "/", so "/\evil.com" would leave the origin.
  const target = next?.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
  if (session) redirect(target);

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <div className="font-mono text-xs tracking-[0.3em] text-signal">LIFEOS</div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Welcome back.</h1>
          <p className="mt-1 text-sm text-fg-muted">Sign in to your operating system.</p>
        </div>
        <LoginForm next={target} />
      </div>
    </main>
  );
}
