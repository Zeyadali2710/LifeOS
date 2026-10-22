"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/ui/button";
import { TextField } from "@/ui/controls";
import { Alert } from "@/ui/feedback";
import s from "./login.module.css";

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
    <form onSubmit={onSubmit} className={s.form} noValidate>
      <TextField label="Email" name="email" type="email" autoComplete="username" required />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
      {error && <Alert>{error}</Alert>}
      <Button type="submit" variant="primary" size="lg" disabled={pending} aria-busy={pending || undefined} block className={s.submit}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
