"use client";
import s from "./settings.module.css";
import { Alert } from "@/ui/feedback";
import { useState } from "react";
import { connectIcloudAction } from "@/server/calendar-settings-actions";
import { Button } from "@/ui/button";
import { TextField } from "@/ui/controls";
const ERRORS: Record<string, string> = {
  rejected: "Apple rejected this sign-in. Check the Apple ID and app-specific password (not your Apple ID password) and try again.",
  unreachable: "Couldn't reach iCloud. Nothing was saved. Try again.",
  invalid: "Check the Apple ID format (it looks like an email address) and the app-specific password. Nothing was saved.",
  failed: "Couldn't reach iCloud. Nothing was saved. Try again.",
};
export function IcloudForm({ onDone, onCancel }: {
  onDone: (calendars: number) => void;
  onCancel: () => void;
}) {
  const [appleId, setAppleId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string>();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const pw = password;
    setPassword(""); // cleared immediately, regardless of outcome
    setError(undefined);
    if (!pw.trim())
      return setFieldError("Paste the app-specific password to continue.");
    setFieldError(undefined);
    setBusy(true);
    try {
      const r = await connectIcloudAction(appleId, pw);
      if (r.ok)
        onDone(r.calendars);
      else if (r.error === "empty")
        setFieldError("Paste the app-specific password to continue.");
      else
        setError(ERRORS[r.error] ?? ERRORS.failed);
    }
    catch {
      setError(ERRORS.failed);
    }
    finally {
      setBusy(false);
    }
  }
  return (<form onSubmit={submit} className={s.form}>
    <TextField label="Apple ID" type="email" autoComplete="off" spellCheck={false} autoCapitalize="off" data-1p-ignore value={appleId} onChange={e => setAppleId(e.target.value)} />
    <TextField label="App-specific password" help="Create one at account.apple.com · Sign-In and Security · App-Specific Passwords. It looks like xxxx-xxxx-xxxx-xxxx." error={fieldError} type="password" autoComplete="off" spellCheck={false} autoCapitalize="off" data-1p-ignore value={password} onChange={e => setPassword(e.target.value)} />
    {fieldError && <p role="alert" className={s.error}>
      {fieldError}
    </p>}{error && <Alert>
      {error}
    </Alert>}<div className={s.actions}>
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? "Verifying…" : "Save and connect"}
      </Button>
      <Button onClick={onCancel} disabled={busy}>Cancel</Button>
    </div>
  </form>);
}
