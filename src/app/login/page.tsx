import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isSafePath } from "@/lib/safe-url";
import { auth } from "@/server/auth";
import { Card } from "@/ui/layout";
import s from "@/features/login/login.module.css";
import { LoginForm } from "@/features/login/login-form";

export const metadata = { title: "Sign in · LifeOS" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await auth().api.getSession({ headers: await headers() });
  const { next } = await searchParams;
  const target = isSafePath(next) ? next : "/";
  if (session) redirect(target);

  return (
    <main className={s.page} aria-labelledby="login-title">
      <Card className={s.card}>
        <header className={s.header}>
          <div className={s.wordmark}>LifeOS</div>
          <h1 id="login-title" className={s.title}>Welcome back.</h1>
          <p className={s.subtitle}>Sign in to your operating system.</p>
        </header>
        <LoginForm next={target} />
      </Card>
    </main>
  );
}
