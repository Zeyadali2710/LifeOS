import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isSafePath } from "@/lib/safe-url";
import { auth } from "@/server/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · LifeOS" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await auth().api.getSession({ headers: await headers() });
  const { next } = await searchParams;
  const target = isSafePath(next) ? next : "/";
  if (session) redirect(target);

  return (
    <main className="canvas-glow grid min-h-dvh place-items-center px-6">
      <div className="glass-menu w-full max-w-sm rounded-30 p-8">
        <div className="mb-10">
          <div className="font-mono text-xs tracking-[0.3em] text-cyan">LIFEOS</div>
          <h1 className="mt-3 font-display text-[40px] leading-[1.05] font-normal">Welcome back.</h1>
          <p className="mt-1 text-sm text-text-2">Sign in to your operating system.</p>
        </div>
        <LoginForm next={target} />
      </div>
    </main>
  );
}
