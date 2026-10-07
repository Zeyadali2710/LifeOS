"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/ui/button";

const field =
  "mt-1.5 block h-11 w-full rounded-9 border border-[rgba(255,255,255,.10)] bg-surface px-3 text-sm text-text placeholder:text-text-3 focus:border-indigo focus:outline-none";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (error) {
      setError(error.status === 429 ? "Too many attempts. Wait a minute and try again." : "Incorrect email or password.");
      setPending(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <label className="block text-sm text-text-2">
        Email
        <input name="email" type="email" autoComplete="username" required className={field} />
      </label>
      <label className="block text-sm text-text-2">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={field} />
      </label>
      <p role="alert" aria-live="polite" className="min-h-5 text-sm text-red">
        {error}
      </p>
      <Button type="submit" size="touch" loading={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
