"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { linkInput } from "@/lib/project-payload";
import { addLinkAction } from "@/server/project-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/legacy-ui/button";
import { Dialog } from "@/legacy-ui/dialog";
import { Field, Input, Select } from "@/legacy-ui/field";

type Repo = { id: number; fullName: string };

export function LinkDialog({ open, projectId, repos, onClose }: { open: boolean; projectId: string; repos: Repo[]; onClose: () => void }) {
  if (!open) return null;
  return <Form projectId={projectId} repos={repos} onClose={onClose} />;
}

function Form({ projectId, repos, onClose }: { projectId: string; repos: Repo[]; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useShell();
  const [kind, setKind] = useState<"repo" | "url">("repo");
  const [repoId, setRepoId] = useState("");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    const parsed = linkInput.safeParse(kind === "repo" ? { kind, repoId: Number(repoId) } : { kind, label, url });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0] ?? "form")] ??= i.message;
      if (kind === "repo") errs.repoId = "Pick a repository.";
      return setErrors(errs);
    }
    setErrors({});
    setBusy(true);
    const r = await addLinkAction(projectId, parsed.data).catch(() => ({ ok: false, error: "failed" }) as const);
    setBusy(false);
    if (!r.ok) return "errors" in r ? setErrors(r.errors) : toast("Couldn't add the link. Try again.", "error");
    toast("Link added");
    router.refresh();
    onClose();
  };

  const seg = (active: boolean) => `h-[26px] rounded-full px-3.5 text-[12.5px] ${active ? "bg-white/[.12] text-text" : "text-text-2"} max-tab:min-h-11`;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add link"
      sheet
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Add link
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div role="group" aria-label="Link type" className="flex w-fit rounded-full border border-white/[.06] bg-white/[.04] p-[3px]">
          {(["repo", "url"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} className={seg(kind === k)} onClick={() => { setKind(k); setErrors({}); }}>
              {k === "repo" ? "Repository" : "URL"}
            </button>
          ))}
        </div>
        {kind === "repo" ? (
          repos.length === 0 ? (
            <p className="text-[13px] text-text-2">
              No repositories synced yet.{" "}
              <Link href="/settings" className="text-cyan hover:underline">
                Connect GitHub in Settings.
              </Link>
            </p>
          ) : (
            <Field label="Repository" error={errors.repoId}>
              <Select value={repoId} onChange={(e) => setRepoId(e.target.value)}>
                <option value="">Choose a repository</option>
                {repos.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fullName}
                  </option>
                ))}
              </Select>
            </Field>
          )
        ) : (
          <>
            <Field label="Label" error={errors.label}>
              <Input value={label} maxLength={80} required autoFocus onChange={(e) => setLabel(e.target.value)} />
            </Field>
            <Field label="URL" error={errors.url}>
              <Input type="url" value={url} required onChange={(e) => setUrl(e.target.value)} />
            </Field>
          </>
        )}
        <button type="submit" hidden disabled={busy} />
      </form>
    </Dialog>
  );
}
