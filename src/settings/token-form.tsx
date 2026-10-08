"use client";

import { useState } from "react";
import { saveTokenAction } from "@/server/settings-actions";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";

const ERRORS: Record<string, string> = {
  rejected: "GitHub rejected this token. It may be expired, revoked, or copied incompletely. Check it and try again.",
  no_repos: "This token is valid but has no repository access. Choose at least one repository when you create it.",
  unreachable: "Couldn't reach GitHub. Nothing was saved. Try again.",
  invalid: "Couldn't reach GitHub. Nothing was saved. Try again.",
  failed: "Couldn't reach GitHub. Nothing was saved. Try again.",
};

const HELP = {
  github_read:
    "Create it at github.com/settings/personal-access-tokens. Read token: Repository permissions: Contents, Metadata, Pull requests, Issues, Actions, Commit statuses all read-only.",
  github_write:
    "Create it at github.com/settings/personal-access-tokens. Issues: Read and write on only the repositories you choose.",
};

export function TokenForm({
  id,
  onDone,
  onCancel,
}: {
  id: "github_read" | "github_write";
  onDone: (r: { login: string; repos: number }) => void;
  onCancel: () => void;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = token;
    setToken(""); // cleared immediately, regardless of outcome
    setError(undefined);
    if (!value.trim()) return setFieldError("Paste a token to continue.");
    setFieldError(undefined);
    setBusy(true);
    try {
      const r = await saveTokenAction(id, value);
      if (r.ok) onDone(r);
      else if (r.error === "empty") setFieldError("Paste a token to continue.");
      else setError(ERRORS[r.error] ?? ERRORS.failed);
    } catch {
      setError(ERRORS.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex animate-[lo-rise_.25s_ease-out] flex-col gap-3.5 rounded-12 border border-[rgba(255,255,255,.08)] bg-inset px-[18px] py-4">
      <Field label="Fine-grained personal access token" helper={HELP[id]} error={fieldError}>
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="off"
          data-1p-ignore
          className="font-mono"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </Field>
      {error && (
        <p role="alert" className="text-[13px] text-red">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>
          {busy ? "Verifying…" : "Save token"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
