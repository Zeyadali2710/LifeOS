"use client";

import { useState } from "react";
import { saveEventKeyAction } from "@/server/outreach-actions";
import { saveOpenRouterKeyAction, saveTokenAction } from "@/server/settings-actions";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";

const ERRORS: Record<string, string> = {
  rejected: "GitHub rejected this token. It may be expired, revoked, or copied incompletely. Check it and try again.",
  no_repos: "This token is valid but has no repository access. Choose at least one repository when you create it.",
  unreachable: "Couldn't reach GitHub. Nothing was saved. Try again.",
  invalid: "Couldn't reach GitHub. Nothing was saved. Try again.",
  failed: "Couldn't reach GitHub. Nothing was saved. Try again.",
};

const OR_ERRORS: Record<string, string> = {
  rejected: "OpenRouter rejected this key. Check it and try again.",
  unreachable: "Couldn't reach OpenRouter. Nothing was saved. Try again.",
  invalid: "Couldn't reach OpenRouter. Nothing was saved. Try again.",
  failed: "Couldn't reach OpenRouter. Nothing was saved. Try again.",
};

const EVENT_ERRORS = (name: string): Record<string, string> => ({
  rejected: `${name} rejected this ${name === "Eventbrite" ? "token" : "key"}. Check it and try again.`,
  unreachable: `Couldn't reach ${name}. Nothing was saved. Try again.`,
  invalid: `Couldn't reach ${name}. Nothing was saved. Try again.`,
  failed: `Couldn't reach ${name}. Nothing was saved. Try again.`,
});
const EVENT_ERRORS_BY_ID = { eventbrite: EVENT_ERRORS("Eventbrite"), luma: EVENT_ERRORS("Luma") };

const HELP = {
  eventbrite: "Create a private token at eventbrite.com/platform/api-keys. LifeOS uses it only to read events.",
  luma: "Covers only the Luma Plus calendar the key was made on. For Sydney discovery, add Luma's iCal feed below.",
  openrouter:
    "Create a key at openrouter.ai/settings/keys. LifeOS uses it only for free models. Buying US$10 of credits once raises the free limit from 50 to 1000 requests a day; free models don't spend credits.",
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
  id: "github_read" | "github_write" | "openrouter" | "eventbrite" | "luma";
  onDone: (r: { repos?: number }) => void;
  onCancel: () => void;
}) {
  const or = id === "openrouter";
  const ev = id === "eventbrite" || id === "luma";
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
      const r = ev
        ? await saveEventKeyAction(id, value)
        : or
          ? await saveOpenRouterKeyAction(value)
          : await saveTokenAction(id as "github_read" | "github_write", value);
      if (r.ok) onDone({ repos: "repos" in r ? Number(r.repos) : undefined });
      else if (r.error === "empty") setFieldError(or || id === "luma" ? "Paste a key to continue." : "Paste a token to continue.");
      else setError((ev ? EVENT_ERRORS_BY_ID[id] : or ? OR_ERRORS : ERRORS)[r.error] ?? ERRORS.failed);
    } catch {
      setError((ev ? EVENT_ERRORS_BY_ID[id] : ERRORS).failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex animate-[lo-rise_.25s_ease-out] flex-col gap-3.5 rounded-14 border border-white/[.10] bg-white/[.03] p-4">
      <Field label={id === "luma" ? "Luma API key" : ev ? "Eventbrite private token" : or ? "OpenRouter API key" : "Fine-grained personal access token"} helper={HELP[id]} error={fieldError}>
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
          {busy ? "Verifying…" : or || id === "luma" ? "Save key" : "Save token"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
